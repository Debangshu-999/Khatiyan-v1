package com.khatiyan.d_modules.tenancy.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput;
import com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistResponse;
import com.khatiyan.d_modules.tenancy.model.MoveInChecklist;
import com.khatiyan.d_modules.tenancy.model.MoveInChecklistItem;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.repository.MoveInChecklistRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * The move-in checklist (user, 2026-10-29): recorded with the stay at
 * onboarding, read by its tenant and by management, answered by the tenant.
 */
@Slf4j
@Service
public class MoveInChecklistService {

    private final MoveInChecklistRepository checklists;
    private final TenancyRepository tenancies;
    private final TenancyAccessPolicy access;
    private final Clock clock;
    private final com.khatiyan.d_modules.property.PropertyModule properties;

    public MoveInChecklistService(MoveInChecklistRepository checklists, TenancyRepository tenancies,
            TenancyAccessPolicy access, Clock clock, com.khatiyan.d_modules.property.PropertyModule properties) {
        this.checklists = checklists;
        this.tenancies = tenancies;
        this.access = access;
        this.clock = clock;
        this.properties = properties;
    }

    /** What each level means at the stay's property, for whoever reads the checklist. */
    private java.util.List<com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse.DamageLevelView> levels(Tenancy tenancy) {
        return properties.getExitPolicy(tenancy.getPropertyId()).damageLevels();
    }

    /**
     * Records it with the stay, inside the onboarding's own transaction. The
     * onboarding has already checked who may create the stay.
     */
    @Transactional
    public void record(UUID tenancyId, UUID recordedBy, MoveInChecklistInput input) {
        Tenancy tenancy = tenancies.findById(tenancyId).orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        if (!tenancy.isMonthly()) {
            throw new ValidationException("A move-in checklist is for monthly stays");
        }
        if (checklists.existsById(tenancyId)) {
            throw new ValidationException("This stay's move-in checklist is already recorded");
        }
        List<MoveInChecklistItem> items = input.items().stream()
                .map(item -> new MoveInChecklistItem(
                        item.name().strip(),
                        item.damageLevel(),
                        item.note() == null || item.note().isBlank() ? null : item.note().strip(),
                        item.custom(),
                        item.photoUrls(),
                        item.section()))
                .toList();
        checklists.save(MoveInChecklist.record(tenancyId, recordedBy, clock.instant(), items, input.keysHandedOver()));
        log.info("Move-in checklist recorded tenancyId={} items={} actorUserId={}", tenancyId, items.size(), recordedBy);
    }

    @Transactional(readOnly = true)
    public MoveInChecklistResponse get(UUID viewer, UUID tenancyId) {
        Tenancy tenancy = tenancies.findById(tenancyId).orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        boolean isTenant = viewer.equals(tenancy.getUserId());
        if (!isTenant) {
            access.ensureCanViewStays(viewer, tenancy.getPropertyId());
        }
        MoveInChecklist checklist = checklists.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Move-in checklist", tenancyId));
        return MoveInChecklistResponse.from(checklist, clock.instant(), isTenant, levels(tenancy));
    }

    /**
     * The checklist when the stay has one, for the screens that offer it only
     * then. Empty, not an error, when none was recorded.
     */
    @Transactional(readOnly = true)
    public java.util.Optional<MoveInChecklistResponse> find(UUID viewer, UUID tenancyId) {
        Tenancy tenancy = tenancies.findById(tenancyId).orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        boolean isTenant = viewer.equals(tenancy.getUserId());
        if (!isTenant) {
            access.ensureCanViewStays(viewer, tenancy.getPropertyId());
        }
        return checklists.findById(tenancyId).map(checklist -> MoveInChecklistResponse.from(checklist, clock.instant(), isTenant, levels(tenancy)));
    }

    /** Whether a stay has one, for the screens that offer to open it. */
    @Transactional(readOnly = true)
    public boolean exists(UUID tenancyId) {
        return checklists.existsById(tenancyId);
    }

    @Transactional
    public MoveInChecklistResponse respond(UUID tenantUserId, UUID tenancyId, boolean looksRight, String note) {
        Tenancy tenancy = tenancies.findById(tenancyId).orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        if (!tenantUserId.equals(tenancy.getUserId())) {
            throw new ValidationException("Only the tenant can answer their move-in checklist");
        }
        MoveInChecklist checklist = checklists.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Move-in checklist", tenancyId));
        Instant now = clock.instant();
        checklist.respond(looksRight, note, now);
        log.info("Move-in checklist answered tenancyId={} response={}", tenancyId, checklist.getTenantResponse());
        return MoveInChecklistResponse.from(checklist, now, true, levels(tenancy));
    }
}
