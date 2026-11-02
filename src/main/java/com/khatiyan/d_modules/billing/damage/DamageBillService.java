package com.khatiyan.d_modules.billing.damage;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CancelOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.CreateOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.RaiseDamageBillRequest;
import com.khatiyan.d_modules.billing.model.BillingCycle;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.model.BillingLineSettlementAction;
import com.khatiyan.d_modules.billing.repository.BillingCycleRepository;
import com.khatiyan.d_modules.billing.service.BillingCycleLineItemService;
import com.khatiyan.d_modules.billing.service.BillingCycleService;
import com.khatiyan.d_modules.billing.service.DepositManagerService;
import com.khatiyan.d_modules.billing.service.DepositManagerService.ExitDeduction;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Damage at checkout (2026-10-31, spec 2026-10-31-end-tenancy-damage-design.md).
 *
 * <p>Billed damage is really owed: a Damage bill is unpaid, and the exit gate
 * holds until it is cleared. So it is raised straight away, not when the
 * tenancy ends, and a split between it and the deposit survives leaving the
 * screen. What the deposit took can be moved back onto the bill while the bill
 * is still owed. What is left of the records at the exit itself comes off the
 * deposit or is waived, inside the exit's own transaction.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DamageBillService {

    private static final String RECORDS_CHANGED = "The damage records changed. Check the list again.";

    private final DamageRecordRepository records;
    private final BillingCycleRepository bills;
    private final BillingCycleService billingCycleService;
    private final BillingCycleLineItemService lineItemService;
    private final DepositManagerService depositManagerService;

    /** One bill for the picked records, one line each, the deposit's share taken at once. */
    @Transactional
    public BillingCycleResponse raise(UUID actorUserId, UUID tenancyId, RaiseDamageBillRequest request) {
        Set<UUID> wanted = new HashSet<>(request.recordIds());
        List<DamageRecord> picked = open(tenancyId).stream().filter(record -> wanted.contains(record.getId())).toList();
        if (picked.size() != wanted.size()) {
            throw new ValidationException(RECORDS_CHANGED);
        }
        long fromDeposit = request.fromDepositPaise() == null ? 0L : request.fromDepositPaise();
        if (fromDeposit > depositManagerService.availableBalance(tenancyId)) {
            throw new ValidationException("The deposit does not have that much left.");
        }

        List<CreateOneOffBillRequest> lines = picked.stream()
                .map(record -> new CreateOneOffBillRequest(
                        DamageRecordService.billReason(record), shareOf(record, tenancyId).getAmountPaise()))
                .toList();
        BillingCycleResponse bill = billingCycleService.createOneOffBill(
                actorUserId, tenancyId, lines.get(0), lines.subList(1, lines.size()));
        picked.forEach(record -> shareOf(record, tenancyId).billedAs(bill.id()));
        records.saveAll(picked);

        log.info("Damage bill raised billId={} tenancyId={} records={} fromDepositPaise={}",
                bill.id(), tenancyId, picked.size(), fromDeposit);
        return fromDeposit > 0
                ? syncShares(lineItemService.moveBillToDeposit(actorUserId, bill.id(), fromDeposit))
                : bill;
    }

    /** The deposit takes what it has. Anything left stays on the bill. */
    @Transactional
    public BillingCycleResponse chargeFromDeposit(UUID actorUserId, UUID billId) {
        requireOwedDamageBill(billId);
        return syncShares(lineItemService.moveBillToDeposit(actorUserId, billId, Long.MAX_VALUE));
    }

    /** Everything the bill took from the deposit goes back, and the bill holds it all again. */
    @Transactional
    public BillingCycleResponse moveOffDeposit(UUID actorUserId, UUID billId) {
        requireOwedDamageBill(billId);
        return syncShares(lineItemService.moveBillOffDeposit(actorUserId, billId));
    }

    /**
     * Changing what a Damage bill charges cancels it (user, 2026-10-31): whatever
     * it took from the deposit goes back, and every record on it returns to the
     * list, to be waived or collected again.
     */
    @Transactional
    public BillingCycleResponse cancelToChange(UUID actorUserId, UUID billId) {
        requireOwedDamageBill(billId);
        List<DamageRecord> onBill = records.findByShareBillId(billId);
        boolean tookDeposit = onBill.stream().flatMap(record -> record.getShares().stream())
                .anyMatch(share -> billId.equals(share.getBillId()) && share.getDepositPaise() > 0);
        if (tookDeposit) {
            lineItemService.moveBillOffDeposit(actorUserId, billId);
        }
        BillingCycleResponse cancelled = billingCycleService.cancelOneOffBill(
                actorUserId, billId, new CancelOneOffBillRequest("Changed by owner"));
        onBill.forEach(record -> record.getShares().stream()
                .filter(share -> billId.equals(share.getBillId()))
                .forEach(share -> {
                    share.unbill();
                    share.tookFromDeposit(0L);
                }));
        records.saveAll(onBill);
        log.info("Damage bill cancelled to change it billId={} records={}", billId, onBill.size());
        return cancelled;
    }

    /**
     * Decides every record still open on a leaving stay, in the exit's own
     * transaction. A record the screen never showed is refused, so nothing
     * slips past a checkout. Returns what comes off the deposit, oldest first.
     */
    @Transactional
    public List<ExitDeduction> settleAtExit(UUID tenancyId, ApplyExitPolicyRequest.DamageCharge damages) {
        Set<UUID> charged = new HashSet<>(damages == null || damages.recordIds() == null ? List.of() : damages.recordIds());
        Set<UUID> waived = new HashSet<>(damages == null || damages.waivedRecordIds() == null ? List.of() : damages.waivedRecordIds());
        List<DamageRecord> open = open(tenancyId);
        Set<UUID> sent = new HashSet<>(charged);
        sent.addAll(waived);
        if (sent.size() != charged.size() + waived.size()
                || !sent.equals(open.stream().map(DamageRecord::getId).collect(Collectors.toSet()))) {
            throw new ValidationException(RECORDS_CHANGED);
        }

        List<ExitDeduction> deductions = new ArrayList<>();
        for (DamageRecord record : open) {
            DamageRecordShare share = shareOf(record, tenancyId);
            if (waived.contains(record.getId())) {
                share.waive();
            } else {
                share.tookFromDeposit(share.getAmountPaise());
                deductions.add(new ExitDeduction(DamageRecordService.billReason(record), share.getAmountPaise()));
            }
        }
        records.saveAll(open);
        log.info("Damage settled at exit tenancyId={} fromDeposit={} waived={}", tenancyId, charged.size(), waived.size());
        return deductions;
    }

    /** The records whose share for this stay has no live bill, no waiver and no deposit cover, oldest first. */
    private List<DamageRecord> open(UUID tenancyId) {
        List<DamageRecord> naming = records.findByShareTenancyId(tenancyId);
        Set<UUID> billIds = naming.stream().map(record -> shareOf(record, tenancyId).getBillId())
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, BillingCycle> billById = billIds.isEmpty() ? Map.of()
                : bills.findAllById(billIds).stream().collect(Collectors.toMap(BillingCycle::getId, Function.identity()));
        return naming.stream()
                .filter(record -> {
                    DamageRecordShare share = shareOf(record, tenancyId);
                    BillingCycle bill = share.getBillId() == null ? null : billById.get(share.getBillId());
                    return !share.settledWithoutABill() && (bill == null || bill.getStatus() == BillingCycleStatus.CANCELLED);
                })
                .sorted(Comparator.comparing(DamageRecord::getCreatedAt))
                .toList();
    }

    private static DamageRecordShare shareOf(DamageRecord record, UUID tenancyId) {
        return record.getShares().stream().filter(share -> tenancyId.equals(share.getTenancyId())).findFirst()
                .orElseThrow(() -> new ValidationException(RECORDS_CHANGED));
    }

    private void requireOwedDamageBill(UUID billId) {
        BillingCycle bill = bills.findById(billId).orElseThrow(() -> new NotFoundException("BillingCycle", billId));
        VersionGuard.claim(bill);
        if (records.findByShareBillId(billId).isEmpty()) {
            throw new ValidationException("Only a Damage bill can do this.");
        }
        if (bill.getStatus() != BillingCycleStatus.UNPAID && bill.getStatus() != BillingCycleStatus.OVERDUE) {
            throw new ValidationException("This bill is paid or awaiting confirmation, so it can't change now.");
        }
    }

    /** Hands what the bill's lines took from the deposit to its shares, in the order the lines were raised. */
    private BillingCycleResponse syncShares(BillingCycleResponse bill) {
        long remaining = bill.lineItems().stream()
                .filter(line -> line.settlementAction() == BillingLineSettlementAction.ADJUSTED_FROM_DEPOSIT)
                .mapToLong(BillingCycleLineItemResponse::settlementAmountPaise)
                .sum();
        List<DamageRecord> onBill = records.findByShareBillId(bill.id());
        for (DamageRecord record : onBill) {
            for (DamageRecordShare share : record.getShares()) {
                if (bill.id().equals(share.getBillId())) {
                    long taken = Math.min(share.getAmountPaise(), remaining);
                    share.tookFromDeposit(taken);
                    remaining -= taken;
                }
            }
        }
        records.saveAll(onBill);
        return bill;
    }
}
