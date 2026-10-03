package com.khatiyan.d_modules.lead.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One person's path at one property, from their enquiry to moving in.
 *
 * <p>Called a lead in code from the first enquiry, though the owner counts it
 * as one only from {@link LeadStage#EARLY_LEAD}. One OPEN record per person per
 * property: a second enquiry from them joins it.
 *
 * <p>The handler and {@code respondedAt} are copies. The enquiry module owns
 * both, and this record is brought level with the enquiry whenever the enquiry
 * changes. Each change method below says whether it changed anything, which is
 * what makes applying the same enquiry twice harmless.
 */
@Entity
@Table(name = "leads", schema = "lead")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Lead extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, updatable = false, length = 40)
    private String referenceCode;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "prospect_user_id", nullable = false, updatable = false)
    private UUID prospectUserId;

    /** The enquiry that opened it. A plain id: enquiries are another module. */
    @Column(name = "enquiry_id", updatable = false)
    private UUID enquiryId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LeadStage stage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private LeadState state;

    @Enumerated(EnumType.STRING)
    @Column(name = "close_reason", length = 40)
    private LeadCloseReason closeReason;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "handler_user_id")
    private UUID handlerUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "handler_assigned_by", length = 20)
    private LeadHandlerSource handlerAssignedBy;

    @Column(name = "handler_assigned_at")
    private Instant handlerAssignedAt;

    @Column(name = "enquired_at")
    private Instant enquiredAt;

    @Column(name = "responded_at")
    private Instant respondedAt;

    @Column(name = "early_lead_at")
    private Instant earlyLeadAt;

    @Column(name = "advanced_lead_at")
    private Instant advancedLeadAt;

    @Column(name = "booked_at")
    private Instant bookedAt;

    @Column(name = "moved_in_at")
    private Instant movedInAt;

    /** The tenancy they moved into. A plain id: tenancies are another module. */
    @Column(name = "converted_tenancy_id")
    private UUID convertedTenancyId;

    private Lead(String referenceCode, UUID propertyId, UUID prospectUserId, UUID enquiryId, Instant enquiredAt) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.propertyId = propertyId;
        this.prospectUserId = prospectUserId;
        this.enquiryId = enquiryId;
        this.stage = LeadStage.ENQUIRED;
        this.state = LeadState.OPEN;
        this.enquiredAt = enquiredAt;
    }

    /** A record opened by an enquiry. */
    public static Lead openedByEnquiry(
            String referenceCode, UUID propertyId, UUID prospectUserId, UUID enquiryId, Instant enquiredAt) {
        return new Lead(referenceCode, propertyId, prospectUserId, enquiryId, enquiredAt);
    }

    public boolean isOpen() {
        return state == LeadState.OPEN;
    }

    /** Still at the first stage with nobody having reached them: what an expired enquiry closes. */
    public boolean awaitsFirstAnswer() {
        return isOpen() && stage == LeadStage.ENQUIRED && respondedAt == null;
    }

    /**
     * Takes the enquiry's handler, when that assignment is newer than the one
     * held.
     *
     * <p>Newer, not different. Enquiry changes are heard at least once and not
     * always in order, so a reassignment can be heard before the assignment it
     * replaced. Going by the time keeps the later one whichever arrives last.
     *
     * @return true when the handler changed
     */
    public boolean takeHandler(UUID handlerUserId, LeadHandlerSource source, Instant assignedAt) {
        if (handlerUserId == null || source == null || assignedAt == null) {
            return false;
        }
        if (this.handlerAssignedAt != null && !assignedAt.isAfter(this.handlerAssignedAt)) {
            return false;
        }
        this.handlerUserId = handlerUserId;
        this.handlerAssignedBy = source;
        this.handlerAssignedAt = assignedAt;
        return true;
    }

    /**
     * Records the first time an attempt to reach them succeeded. The time to
     * book a visit runs from it.
     *
     * @return true the first time, false once it is already recorded
     */
    public boolean markResponded(Instant at) {
        if (at == null || this.respondedAt != null) {
            return false;
        }
        this.respondedAt = at;
        return true;
    }

    /**
     * A visit is scheduled, so this is now a lead the owner counts: an early
     * lead. By whichever side booked it.
     *
     * @return true when it moved up, false when it was there already or beyond
     */
    public boolean reachEarlyLead(Instant at) {
        if (!isOpen() || stage != LeadStage.ENQUIRED) {
            return false;
        }
        this.stage = LeadStage.EARLY_LEAD;
        this.earlyLeadAt = at;
        return true;
    }

    /**
     * Back to Enquired, because the visit that made it an early lead was
     * cancelled (owner's rule, 2026-10-03). The early-lead moment is cleared:
     * it is set again if they book again.
     *
     * @return true when it moved back
     */
    public boolean returnToEnquired() {
        if (!isOpen() || stage != LeadStage.EARLY_LEAD) {
            return false;
        }
        this.stage = LeadStage.ENQUIRED;
        this.earlyLeadAt = null;
        return true;
    }

    /**
     * Closes the record, keeping the stage it reached.
     *
     * @return true when it closed, false when it was closed already
     */
    public boolean close(LeadCloseReason reason, Instant at) {
        if (!isOpen()) {
            return false;
        }
        this.state = LeadState.CLOSED;
        this.closeReason = reason;
        this.closedAt = at;
        return true;
    }
}
