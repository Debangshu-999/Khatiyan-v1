package com.khatiyan.d_modules.billing.damage;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.c_shared.reference.ReferenceCodeGenerator;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CancelOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.DamageRecordResponse;
import com.khatiyan.d_modules.billing.api.dto.DamageRecordPageResponse;
import com.khatiyan.d_modules.billing.api.dto.RepairDamageRecordRequest;
import com.khatiyan.d_modules.billing.api.dto.SaveDamageRecordRequest;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.billing.service.BillingCycleService;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Damage records (2026-10-29, spec 2026-10-29-damage-records-design.md).
 *
 * <p>The app records the owner's decision and never judges it. The money rules:
 * a record is charged once, on a one-off bill. While its bill is unpaid, changing
 * the amount or deleting it cancels the bill. Once the bill is paid, or awaiting
 * the owner's confirmation, nothing about it changes.
 *
 * <p>A split is one record per tenant (user, 2026-10-31), sharing a code, so one
 * tenant paying, or a change to one, leaves the others alone. Only the item is
 * shared: its room, item and level stay the same across the splits, and fixing it
 * fixes them all.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DamageRecordService {

    /** A bill in one of these is past cancelling, so the record it came from is locked. */
    private static final Set<BillingCycleStatus> SETTLED = EnumSet.of(BillingCycleStatus.PAID, BillingCycleStatus.CONFIRMATION_PENDING);

    private final DamageRecordRepository records;
    private final BillingCycleRepository bills;
    private final BillingCycleService billingCycleService;
    private final PropertyModule propertyModule;
    private final TenancyModule tenancyModule;
    private final AuthModule authModule;
    private final ReferenceCodeGenerator referenceCodeGenerator;
    private final ApplicationEventPublisher events;

    /** What a move-in checklist found worse than the room's level. */
    public record FoundDamage(String itemName, String section, DamageLevel level, List<String> photoUrls) {
    }

    @Transactional
    public DamageRecordResponse create(UUID actorUserId, UUID propertyId, SaveDamageRecordRequest request) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_RULES);
        requireRoom(propertyId, request.roomId());
        requireDamageLevel(request.damageLevel());
        List<DamageRecordShare> shares = sharesFor(propertyId, request);
        String code = referenceCodeGenerator.nextCode("DMG");

        List<DamageRecord> created = new ArrayList<>();
        if (shares.size() == 1) {
            created.add(newRecord(actorUserId, code, propertyId, request, request.costPaise(), shares.get(0)));
        } else {
            for (int index = 0; index < shares.size(); index++) {
                DamageRecord split = newRecord(actorUserId, code, propertyId, request, shares.get(index).getAmountPaise(), shares.get(index));
                split.splitAs(index + 1);
                created.add(split);
            }
        }
        // Whatever save returns is the managed record: charging below must work on it.
        created.replaceAll(records::save);
        DamageRecord first = created.get(0);
        propertyModule.raiseCondition(first.getRoomId(), actorUserId, first.getItemName(), first.getSection(),
                first.getDamageLevel(), first.getPhotoUrls());

        log.info("Damage recorded code={} propertyId={} roomId={} item={} level={} costPaise={} records={}",
                code, propertyId, first.getRoomId(), first.getItemName(), first.getDamageLevel(),
                request.costPaise(), created.size());
        created.forEach(record -> publish(record, DamageRecordChangedEvent.Kind.CREATED));
        if (Boolean.TRUE.equals(request.chargeNow())) {
            created.forEach(record -> billUncharged(actorUserId, record));
        }
        return toResponses(propertyId, List.of(first)).get(0);
    }

    private DamageRecord newRecord(UUID actorUserId, String code, UUID propertyId, SaveDamageRecordRequest request,
            long costPaise, DamageRecordShare share) {
        return DamageRecord.record(code, propertyId, request.roomId(), request.itemName(), request.section(),
                request.damageLevel(), costPaise, request.note(), request.photoUrls(), request.responsibility(),
                DamageRecordSource.MANUAL, List.of(share), actorUserId);
    }

    @Transactional
    public DamageRecordResponse update(UUID actorUserId, UUID propertyId, UUID recordId, SaveDamageRecordRequest request) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_RULES);
        DamageRecord record = find(propertyId, recordId);
        VersionGuard.claim(record);
        requireEditable(record);
        requireRoom(propertyId, request.roomId());
        requireDamageLevel(request.damageLevel());
        if (record.getSplitNumber() != null) {
            return updateSplit(actorUserId, propertyId, record, request);
        }

        boolean moneyMoved = !Objects.equals(record.getRoomId(), request.roomId())
                || !record.getItemName().equalsIgnoreCase(request.itemName().trim())
                || record.getDamageLevel() != request.damageLevel()
                || record.getCostPaise() != request.costPaise()
                || record.getResponsibility() != request.responsibility()
                || (request.responsibility() == DamageResponsibility.TENANT
                        && !Objects.equals(soleTenancy(record), request.tenancyId()));
        List<DamageRecord> addedSplits = new ArrayList<>();
        if (moneyMoved) {
            cancelBills(actorUserId, record, "Damage record " + record.getCode() + " changed");
            List<DamageRecordShare> shares = sharesFor(propertyId, request);
            // Now split: this record is the first, and the others join its code.
            boolean split = shares.size() > 1;
            record.describe(request.roomId(), request.itemName(), request.section(), request.damageLevel(),
                    split ? shares.get(0).getAmountPaise() : request.costPaise(), request.note(), request.photoUrls(),
                    request.responsibility(), List.of(shares.get(0)));
            if (split) {
                record.splitAs(1);
                for (int index = 1; index < shares.size(); index++) {
                    DamageRecord added = newRecord(actorUserId, record.getCode(), propertyId, request,
                            shares.get(index).getAmountPaise(), shares.get(index));
                    added.splitAs(index + 1);
                    addedSplits.add(added);
                }
            }
        } else {
            record.retouch(request.note(), request.photoUrls());
        }
        records.save(record);
        addedSplits.replaceAll(records::save);
        propertyModule.raiseCondition(record.getRoomId(), actorUserId, record.getItemName(), record.getSection(),
                record.getDamageLevel(), record.getPhotoUrls());

        log.info("Damage record changed code={} moneyMoved={} addedSplits={}", record.getCode(), moneyMoved, addedSplits.size());
        publish(record, DamageRecordChangedEvent.Kind.UPDATED);
        addedSplits.forEach(added -> publish(added, DamageRecordChangedEvent.Kind.CREATED));
        if (Boolean.TRUE.equals(request.chargeNow())) {
            billUncharged(actorUserId, record);
            addedSplits.forEach(added -> billUncharged(actorUserId, added));
        }
        return toResponses(propertyId, List.of(record)).get(0);
    }

    /** One split can change its cost, note and photos. The rest is the item's, shared with the other splits. */
    private DamageRecordResponse updateSplit(UUID actorUserId, UUID propertyId, DamageRecord record, SaveDamageRecordRequest request) {
        if (!Objects.equals(record.getRoomId(), request.roomId())
                || !record.getItemName().equalsIgnoreCase(request.itemName().trim())
                || record.getDamageLevel() != request.damageLevel()
                || request.responsibility() != DamageResponsibility.SPLIT) {
            throw new ValidationException("This is one split of a damage, so only its cost, note and photos can change.");
        }
        boolean moneyMoved = record.getCostPaise() != request.costPaise();
        if (moneyMoved) {
            cancelBills(actorUserId, record, "Damage record " + record.getCode() + " changed");
            DamageRecordShare share = record.getShares().get(0);
            record.describe(record.getRoomId(), record.getItemName(), record.getSection(), record.getDamageLevel(),
                    request.costPaise(), request.note(), request.photoUrls(), DamageResponsibility.SPLIT,
                    List.of(new DamageRecordShare(share.getTenancyId(), share.getTenantUserId(), share.getTenantName(), request.costPaise())));
        } else {
            record.retouch(request.note(), request.photoUrls());
        }
        records.save(record);
        propertyModule.raiseCondition(record.getRoomId(), actorUserId, record.getItemName(), record.getSection(),
                record.getDamageLevel(), record.getPhotoUrls());

        log.info("Damage split changed code={} split={} moneyMoved={}", record.getCode(), record.getSplitNumber(), moneyMoved);
        publish(record, DamageRecordChangedEvent.Kind.UPDATED);
        if (Boolean.TRUE.equals(request.chargeNow())) {
            billUncharged(actorUserId, record);
        }
        return toResponses(propertyId, List.of(record)).get(0);
    }

    @Transactional
    public void delete(UUID actorUserId, UUID propertyId, UUID recordId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_RULES);
        DamageRecord record = find(propertyId, recordId);
        VersionGuard.claim(record);
        requireEditable(record);
        cancelBills(actorUserId, record, "Damage record " + record.getCode() + " deleted");
        publish(record, DamageRecordChangedEvent.Kind.DELETED);
        records.delete(record);
        log.info("Damage record deleted code={} propertyId={}", record.getCode(), propertyId);
    }

    /** A one-off bill for the tenant it names, unless it has one, or its bill was cancelled. */
    @Transactional
    public DamageRecordResponse charge(UUID actorUserId, UUID propertyId, UUID recordId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_RULES);
        DamageRecord record = find(propertyId, recordId);
        VersionGuard.claim(record);
        if (record.getResponsibility() == DamageResponsibility.NONE) {
            throw new ValidationException("Nobody is responsible for this damage, so it is not charged.");
        }
        if (!billUncharged(actorUserId, record)) {
            throw new ValidationException("This damage is already charged.");
        }
        log.info("Damage charged code={} split={}", record.getCode(), record.getSplitNumber());
        return toResponses(propertyId, List.of(record)).get(0);
    }

    private boolean billUncharged(UUID actorUserId, DamageRecord record) {
        Map<UUID, BillingCycle> billById = billsOf(List.of(record));
        boolean raised = false;
        for (int index = 0; index < record.getShares().size(); index++) {
            DamageRecordShare share = record.getShares().get(index);
            if (share.settledWithoutABill() || (share.getBillId() != null && !cancelled(billById.get(share.getBillId())))) {
                continue;
            }
            BillingCycleResponse bill = billingCycleService.createOneOffBill(actorUserId, share.getTenancyId(),
                    new CreateOneOffBillRequest(billReason(record), share.getAmountPaise()));
            record.billShare(index, bill.id());
            raised = true;
        }
        if (raised) {
            records.save(record);
        }
        return raised;
    }

    @Transactional
    public DamageRecordResponse repair(UUID actorUserId, UUID propertyId, UUID recordId, RepairDamageRecordRequest request) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_RULES);
        DamageRecord record = find(propertyId, recordId);
        VersionGuard.claim(record);
        if (request.level() == null || request.level().ordinal() >= record.getDamageLevel().ordinal()) {
            throw new ValidationException("Pick a level below " + record.getDamageLevel() + ".");
        }
        return fixed(actorUserId, propertyId, record, DamageRecordStatus.REPAIRED, request.level(), request);
    }

    @Transactional
    public DamageRecordResponse replace(UUID actorUserId, UUID propertyId, UUID recordId, RepairDamageRecordRequest request) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.TENANCY_RULES);
        DamageRecord record = find(propertyId, recordId);
        VersionGuard.claim(record);
        return fixed(actorUserId, propertyId, record, DamageRecordStatus.REPLACED, DamageLevel.NA, request);
    }

    /** Open damages, or the repaired and replaced ones, newest first. */
    @Transactional(readOnly = true)
    public List<DamageRecordResponse> list(UUID actorUserId, UUID propertyId, boolean history) {
        propertyModule.ensureCanViewAny(actorUserId, propertyId,
                ManagerResource.TENANCY_RULES, ManagerResource.TENANCIES, ManagerResource.DEPOSITS);
        Collection<DamageRecordStatus> statuses = history
                ? EnumSet.of(DamageRecordStatus.REPAIRED, DamageRecordStatus.REPLACED)
                : EnumSet.of(DamageRecordStatus.OPEN);
        return toResponses(propertyId, records.findByPropertyIdAndStatusInOrderByCodeDescSplitNumberAsc(propertyId, statuses));
    }

    /** A bounded database page; the legacy list and tenant contracts remain unchanged. */
    @Transactional(readOnly = true)
    public DamageRecordPageResponse page(UUID actorUserId, UUID propertyId, boolean history, int page, int size) {
        propertyModule.ensureCanViewAny(actorUserId, propertyId,
                ManagerResource.TENANCY_RULES, ManagerResource.TENANCIES, ManagerResource.DEPOSITS);
        Collection<DamageRecordStatus> statuses = history
                ? EnumSet.of(DamageRecordStatus.REPAIRED, DamageRecordStatus.REPLACED)
                : EnumSet.of(DamageRecordStatus.OPEN);
        var ids = records.findPageIds(propertyId, statuses, PageRequest.of(Math.max(0, page), Math.max(1, Math.min(50, size))));
        List<DamageRecord> ordered = List.of();
        if (!ids.isEmpty()) {
            Map<UUID, DamageRecord> byId = records.findPageRecords(ids.getContent()).stream()
                    .collect(Collectors.toMap(DamageRecord::getId, Function.identity()));
            ordered = ids.getContent().stream().map(byId::get).filter(Objects::nonNull).toList();
        }
        var counts = records.countForProperty(propertyId);
        return new DamageRecordPageResponse(new PageResponse<>(toResponses(propertyId, ordered),
                ids.getNumber(), ids.getSize(), ids.getTotalElements(), ids.getTotalPages(), ids.hasNext(), ids.hasPrevious()),
                counts.getOpenCount(), counts.getHistoryCount(), counts.getNotChargedCount());
    }

    /** The records naming one stay: the tenant's own, or management of the property. */
    @Transactional(readOnly = true)
    public List<DamageRecordResponse> listForTenancy(UUID actorUserId, UUID tenancyId) {
        TenancyResponse tenancy = tenancyModule.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        if (!actorUserId.equals(tenancy.userId())) {
            propertyModule.ensureCanViewAny(actorUserId, tenancy.propertyId(),
                    ManagerResource.TENANCY_RULES, ManagerResource.TENANCIES, ManagerResource.DEPOSITS);
        }
        return toResponses(tenancy.propertyId(), records.findByShareTenancyId(tenancyId));
    }

    /**
     * What a move-in checklist found worse than the room's level: a record with
     * nobody responsible and no cost, so it can be repaired later. Unguarded:
     * onboarding, which checked its own access, is the only caller.
     */
    @Transactional
    public void recordFoundAtMoveIn(UUID propertyId, UUID roomId, UUID actorUserId, List<FoundDamage> found) {
        if (found == null) {
            return;
        }
        for (FoundDamage item : found) {
            records.save(DamageRecord.record(referenceCodeGenerator.nextCode("DMG"), propertyId, roomId,
                    item.itemName(), item.section(), item.level(), 0L, "Found at move-in", item.photoUrls(),
                    DamageResponsibility.NONE, DamageRecordSource.MOVE_IN, List.of(), actorUserId));
        }
        if (!found.isEmpty()) {
            log.info("Move-in damage recorded propertyId={} roomId={} items={}", propertyId, roomId, found.size());
        }
    }

    private DamageRecordResponse fixed(UUID actorUserId, UUID propertyId, DamageRecord record,
            DamageRecordStatus outcome, DamageLevel level, RepairDamageRecordRequest request) {
        record.repaired(outcome, level, request.photoUrls(), request.note(), actorUserId, Instant.now());
        records.save(record);
        // There is one item, so fixing it fixes every split of the damage.
        if (record.getSplitNumber() != null) {
            for (DamageRecord other : records.findByPropertyIdAndCode(propertyId, record.getCode())) {
                if (!other.getId().equals(record.getId()) && other.getStatus() == DamageRecordStatus.OPEN) {
                    other.repaired(outcome, level, request.photoUrls(), request.note(), actorUserId, Instant.now());
                    records.save(other);
                }
            }
        }
        // The fix's photos replace the item's, so the next tenant never sees the damage (2026-10-29).
        propertyModule.resetCondition(record.getRoomId(), actorUserId, record.getItemName(), record.getSection(),
                level, request.photoUrls());
        log.info("Damage {} code={} level={}", outcome, record.getCode(), level);
        return toResponses(propertyId, List.of(record)).get(0);
    }

    private List<DamageRecordShare> sharesFor(UUID propertyId, SaveDamageRecordRequest request) {
        List<TenancyResponse> inRoom = tenancyModule.findActiveByPropertyId(propertyId).stream()
                .filter(tenancy -> request.roomId().equals(tenancy.roomId()))
                .filter(tenancy -> tenancy.billingType() == TenancyBillingType.MONTHLY)
                .filter(tenancy -> tenancy.status() == TenancyStatus.ACTIVE || tenancy.status() == TenancyStatus.PENDING_EXIT)
                .toList();
        return switch (request.responsibility()) {
            case TENANT -> {
                TenancyResponse tenant = inRoom.stream()
                        .filter(tenancy -> tenancy.id().equals(request.tenancyId()))
                        .findFirst()
                        .orElseThrow(() -> new ValidationException("Pick a tenant living in this room."));
                yield List.of(shareOf(tenant, request.costPaise(), names(List.of(tenant))));
            }
            case SPLIT -> {
                if (inRoom.isEmpty()) {
                    throw new ValidationException("Nobody lives in this room to split it between.");
                }
                yield split(inRoom, request.costPaise());
            }
            case NONE -> throw new ValidationException("Pick who is responsible for this damage.");
        };
    }

    /** Equal shares, the odd paise on the first, so they always add up to the cost. */
    private List<DamageRecordShare> split(List<TenancyResponse> tenants, long costPaise) {
        long each = costPaise / tenants.size();
        long remainder = costPaise - each * tenants.size();
        if (each < 1) {
            throw new ValidationException("The cost is too small to split between " + tenants.size() + " tenants.");
        }
        Map<UUID, String> names = names(tenants);
        List<DamageRecordShare> shares = new ArrayList<>();
        for (int index = 0; index < tenants.size(); index++) {
            shares.add(shareOf(tenants.get(index), each + (index == 0 ? remainder : 0), names));
        }
        return shares;
    }

    private DamageRecordShare shareOf(TenancyResponse tenancy, long amountPaise, Map<UUID, String> names) {
        String name = tenancy.userId() == null ? null : names.get(tenancy.userId());
        if (name == null || name.isBlank()) {
            name = tenancy.tenantName() == null || tenancy.tenantName().isBlank() ? "Tenant" : tenancy.tenantName();
        }
        return new DamageRecordShare(tenancy.id(), tenancy.userId(), name, amountPaise);
    }

    private Map<UUID, String> names(List<TenancyResponse> tenancies) {
        Set<UUID> userIds = tenancies.stream().map(TenancyResponse::userId).filter(Objects::nonNull).collect(Collectors.toSet());
        return authModule.findByIds(userIds).entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().fullName()));
    }

    private void cancelBills(UUID actorUserId, DamageRecord record, String reason) {
        Map<UUID, BillingCycle> billById = billsOf(List.of(record));
        for (DamageRecordShare share : record.getShares()) {
            BillingCycle bill = share.getBillId() == null ? null : billById.get(share.getBillId());
            if (bill != null && !cancelled(bill)) {
                billingCycleService.cancelOneOffBill(actorUserId, bill.getId(), new CancelOneOffBillRequest(reason));
            }
        }
        record.unbillAll();
    }

    private void requireEditable(DamageRecord record) {
        if (record.getStatus() != DamageRecordStatus.OPEN) {
            throw new ValidationException("This damage is already fixed, so it stays in the history.");
        }
        if (locked(record, billsOf(List.of(record)))) {
            throw new ValidationException("This record is settled, by a paid bill, the deposit or a waiver, so it can't be changed.");
        }
    }

    private void requireRoom(UUID propertyId, UUID roomId) {
        propertyModule.findRoomForDisplay(propertyId, roomId).orElseThrow(() -> new NotFoundException("Room", roomId));
    }

    private static void requireDamageLevel(DamageLevel level) {
        if (level == null || level == DamageLevel.NA) {
            throw new ValidationException("Pick a damage level from D1 to D3.");
        }
    }

    private DamageRecord find(UUID propertyId, UUID recordId) {
        return records.findByIdAndPropertyId(recordId, propertyId)
                .orElseThrow(() -> new NotFoundException("Damage record", recordId));
    }

    private static UUID soleTenancy(DamageRecord record) {
        return record.getShares().size() == 1 ? record.getShares().get(0).getTenancyId() : null;
    }

    static String billReason(DamageRecord record) {
        String reason = "Damage " + record.getCode() + ": " + record.getItemName() + " (" + record.getDamageLevel() + ")"
                + (record.getSplitNumber() == null ? "" : ", split " + record.getSplitNumber());
        return reason.length() > 120 ? reason.substring(0, 120) : reason;
    }

    private static boolean cancelled(BillingCycle bill) {
        return bill == null || bill.getStatus() == BillingCycleStatus.CANCELLED;
    }

    private static boolean locked(DamageRecord record, Map<UUID, BillingCycle> billById) {
        return record.getShares().stream().anyMatch(share -> {
            BillingCycle bill = share.getBillId() == null ? null : billById.get(share.getBillId());
            return share.isWaived() || share.getDepositPaise() > 0 || (bill != null && SETTLED.contains(bill.getStatus()));
        });
    }

    private Map<UUID, BillingCycle> billsOf(Collection<DamageRecord> list) {
        Set<UUID> ids = list.stream().flatMap(record -> record.getShares().stream())
                .map(DamageRecordShare::getBillId).filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        return bills.findAllById(ids).stream().collect(Collectors.toMap(BillingCycle::getId, Function.identity()));
    }

    private void publish(DamageRecord record, DamageRecordChangedEvent.Kind kind) {
        List<DamageRecordChangedEvent.Recipient> recipients = record.getShares().stream()
                .filter(share -> share.getTenantUserId() != null)
                .map(share -> new DamageRecordChangedEvent.Recipient(share.getTenantUserId(), share.getTenancyId(), share.getAmountPaise()))
                .toList();
        if (recipients.isEmpty()) {
            return;
        }
        events.publishEvent(new DamageRecordChangedEvent(record.getId(), record.getCode(), record.getPropertyId(),
                record.getItemName(), record.getDamageLevel().name(), kind, recipients));
    }

    /** One query each for bills, rooms and people, however many records. */
    private List<DamageRecordResponse> toResponses(UUID propertyId, List<DamageRecord> list) {
        if (list.isEmpty()) {
            return List.of();
        }
        Map<UUID, BillingCycle> billById = billsOf(list);
        Map<UUID, RoomResponse> rooms = propertyModule.findRoomsForDisplay(propertyId,
                list.stream().map(DamageRecord::getRoomId).collect(Collectors.toSet()));
        Set<UUID> people = new HashSet<>();
        list.forEach(record -> {
            people.add(record.getCreatedBy());
            if (record.getRepairedBy() != null) {
                people.add(record.getRepairedBy());
            }
        });
        Map<UUID, UserSummaryResponse> users = authModule.findByIds(people);
        return list.stream().map(record -> {
            List<DamageRecordResponse.Share> shares = record.getShares().stream().map(share -> {
                BillingCycle bill = share.getBillId() == null ? null : billById.get(share.getBillId());
                return new DamageRecordResponse.Share(share.getTenancyId(), share.getTenantName(), share.getAmountPaise(),
                        share.getBillId(), bill == null ? null : bill.getReferenceCode(),
                        bill == null ? null : bill.getStatus().name(), share.isWaived(), share.getDepositPaise());
            }).toList();
            boolean charged = !record.getShares().isEmpty() && record.getShares().stream()
                    .allMatch(share -> share.settledWithoutABill()
                            || (share.getBillId() != null && !cancelled(billById.get(share.getBillId()))));
            RoomResponse room = rooms.get(record.getRoomId());
            UserSummaryResponse creator = users.get(record.getCreatedBy());
            UserSummaryResponse repairer = record.getRepairedBy() == null ? null : users.get(record.getRepairedBy());
            return new DamageRecordResponse(record.getId(), record.getCode(), record.getRoomId(),
                    room == null ? null : room.roomNumber(), record.getItemName(), record.getSection(),
                    record.getDamageLevel(), record.getCostPaise(), record.getNote(), List.copyOf(record.getPhotoUrls()),
                    record.getResponsibility(), record.getSource(), record.getStatus(), record.getCreatedAt(),
                    record.getCreatedBy(), creator == null ? null : creator.fullName(), shares, charged, locked(record, billById),
                    record.getSplitNumber(), record.getRepairedLevel(),
                    record.getRepairPhotoUrls() == null ? null : List.copyOf(record.getRepairPhotoUrls()),
                    record.getRepairNote(), record.getRepairedAt(), record.getRepairedBy(), repairer == null ? null : repairer.fullName(),
                    record.getVersion());
        }).toList();
    }
}
