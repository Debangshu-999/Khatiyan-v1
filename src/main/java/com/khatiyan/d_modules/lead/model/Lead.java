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

    /** The app user it belongs to. Null for an external person, who has {@link #externalProspectId}. */
    @Column(name = "prospect_user_id", updatable = false)
    private UUID prospectUserId;

    /**
     * The person's name when the record opened, which the Leads screen
     * searches (2026-10-17). A copy, like a booking's tenant name. The name a
     * lead shows is read fresh.
     */
    @Column(name = "prospect_name", length = 120)
    private String prospectName;

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

    /**
     * The first time a visit was scheduled, which is when the owner starts
     * counting it as a lead. Never cleared, unlike {@link #earlyLeadAt}: a
     * record that dies after its visit was cancelled still died as a lead.
     */
    @Column(name = "became_lead_at")
    private Instant becameLeadAt;

    /** The same person's earlier record here, which ended without a move-in. This one is a resumed lead. */
    @Column(name = "resumed_from_lead_id", updatable = false)
    private UUID resumedFromLeadId;

    /** When "Changed your mind?" opened this same record again. Also a resumed lead. */
    @Column(name = "reopened_at")
    private Instant reopenedAt;

    /**
     * The latest of the person's earlier records here that ended for their own
     * reason, where this one is a repeat ({@link #earlierWalkaways} above zero).
     */
    @Column(name = "duplicate_of_lead_id", updatable = false)
    private UUID duplicateOfLeadId;

    /**
     * How many of the person's earlier records here ended for their own reason,
     * since they last moved in, counted when this one opened (user,
     * 2026-10-17). One or two make it a duplicate, three or more potential
     * spam ({@link LeadRepeatFlag}). Never changed after.
     */
    @Column(name = "earlier_walkaways", nullable = false, updatable = false)
    private int earlierWalkaways;

    /**
     * It ended for the person's own reason: they did not reply when someone
     * tried, booked no visit, said not interested, dropped their visit, let the
     * days to book run out, or walked away from a booking. What a later record
     * of theirs counts. False while open, and when the property let them down.
     */
    @Column(name = "ended_by_prospect", nullable = false)
    private boolean endedByProspect;

    /**
     * Someone who reached the property outside the app (2026-10-19): a record
     * in {@code lead.external_prospects}, not an account. Exactly one of this
     * and {@link #prospectUserId} is set.
     */
    @Column(name = "external_prospect_id", updatable = false)
    private UUID externalProspectId;

    /**
     * A record for someone who reached the property outside the app: they
     * walked in, or booked in person or by phone (2026-10-19). No enquiry. The
     * caller moves it to the stage the visit or the booking makes it.
     */
    public static Lead openedExternally(
            String referenceCode, UUID propertyId, UUID externalProspectId, String name, Instant at) {
        Lead lead = new Lead(referenceCode, propertyId, null, null, at);
        lead.externalProspectId = externalProspectId;
        lead.nameProspect(name);
        return lead;
    }

    public boolean isExternal() {
        return externalProspectId != null;
    }

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

    /**
     * A record opened by an enquiry from someone whose earlier record here
     * ended without a move-in: a resumed lead, linked to that one.
     */
    public static Lead resumedByEnquiry(
            String referenceCode, UUID propertyId, UUID prospectUserId, UUID enquiryId, Instant enquiredAt,
            UUID earlierLeadId) {
        Lead lead = new Lead(referenceCode, propertyId, prospectUserId, enquiryId, enquiredAt);
        lead.resumedFromLeadId = earlierLeadId;
        return lead;
    }

    /**
     * A record opened by an enquiry from someone who walked away from earlier
     * records here: a duplicate, or potential spam from the third (user,
     * 2026-10-17). Linked to the latest of them, and not a resumed lead.
     */
    public static Lead repeatByEnquiry(
            String referenceCode, UUID propertyId, UUID prospectUserId, UUID enquiryId, Instant enquiredAt,
            UUID latestWalkawayId, int earlierWalkaways) {
        if (latestWalkawayId == null || earlierWalkaways < 1) {
            throw new IllegalArgumentException("A repeat follows at least one earlier record it names");
        }
        Lead lead = new Lead(referenceCode, propertyId, prospectUserId, enquiryId, enquiredAt);
        lead.duplicateOfLeadId = latestWalkawayId;
        lead.earlierWalkaways = earlierWalkaways;
        return lead;
    }

    /** Keeps the person's name to search by. Set once, as the record opens. */
    public void nameProspect(String name) {
        if (this.prospectName == null && name != null && !name.isBlank()) {
            this.prospectName = name.strip();
        }
    }

    /** Duplicate, potential spam, or null for a record that is neither. */
    public LeadRepeatFlag repeatFlag() {
        return LeadRepeatFlag.of(earlierWalkaways);
    }

    /** Whether the owner ever counted it as a lead: a visit was scheduled at least once. */
    public boolean wasEverALead() {
        return becameLeadAt != null;
    }

    /** Came back after an earlier record here ended, or was opened again by "Changed your mind?". */
    public boolean isResumed() {
        return resumedFromLeadId != null || reopenedAt != null;
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
        if (this.becameLeadAt == null) {
            this.becameLeadAt = at;
        }
        return true;
    }

    /**
     * They came: the visit was checked in. An advanced lead, and it stays one
     * through a booking request, its counters and a token that is due.
     *
     * @return true when it moved up, false when it was there already or beyond
     */
    public boolean reachAdvancedLead(Instant at) {
        if (!isOpen() || (stage != LeadStage.ENQUIRED && stage != LeadStage.EARLY_LEAD)) {
            return false;
        }
        this.stage = LeadStage.ADVANCED_LEAD;
        this.advancedLeadAt = at;
        if (this.becameLeadAt == null) {
            this.becameLeadAt = at;
        }
        return true;
    }

    /**
     * A booking is confirmed: the token arrived or was waived, or none is
     * taken. A request sent or terms agreed is not this.
     *
     * @return true when it moved up, false when it was booked already or is over
     */
    public boolean reachBooked(Instant at) {
        if (!isOpen() || stage == LeadStage.BOOKED || stage == LeadStage.MOVED_IN) {
            return false;
        }
        this.stage = LeadStage.BOOKED;
        this.bookedAt = at;
        if (this.advancedLeadAt == null) {
            this.advancedLeadAt = at;
        }
        if (this.becameLeadAt == null) {
            this.becameLeadAt = at;
        }
        return true;
    }

    /**
     * Back to an advanced lead: the confirmed booking ended without a move-in
     * (user, 2026-10-11). The booked moment is cleared, and set again if they
     * book again. Whether it then dies is the caller's question.
     *
     * @return true when it moved back
     */
    public boolean returnToAdvancedLead() {
        if (!isOpen() || stage != LeadStage.BOOKED) {
            return false;
        }
        this.stage = LeadStage.ADVANCED_LEAD;
        this.bookedAt = null;
        return true;
    }

    /**
     * The stay made from their booking is active: moved in. The record ends
     * here, as converted, which also leaves the person free to enquire again
     * one day as a new record.
     *
     * @return true when it converted now
     */
    public boolean moveIn(UUID tenancyId, Instant at) {
        if (!isOpen()) {
            return false;
        }
        this.stage = LeadStage.MOVED_IN;
        this.movedInAt = at;
        this.convertedTenancyId = tenancyId;
        this.state = LeadState.CLOSED;
        this.closeReason = LeadCloseReason.CONVERTED;
        this.closedAt = at;
        return true;
    }

    /**
     * Takes the handler of the lead's live booking. While a booking is live
     * its handler is the lead's, whatever the enquiry says and whenever it
     * said it.
     *
     * @return true when the handler changed
     */
    public boolean takeBookingHandler(UUID handlerUserId, Instant assignedAt) {
        if (!isOpen() || handlerUserId == null || assignedAt == null || handlerUserId.equals(this.handlerUserId)) {
            return false;
        }
        this.handlerUserId = handlerUserId;
        this.handlerAssignedBy = LeadHandlerSource.BOOKING;
        this.handlerAssignedAt = assignedAt;
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
     * Open again: its enquiry was reopened by the enquirer after closing as not
     * interested (owner's rule, 2026-10-03). Keeps the stage it reached.
     *
     * @return true when it reopened, false when it was open already
     */
    public boolean reopen(Instant at) {
        if (isOpen()) {
            return false;
        }
        this.state = LeadState.OPEN;
        this.closeReason = null;
        this.closedAt = null;
        this.endedByProspect = false;
        // It came back: a resumed lead from here on (user, 2026-10-11).
        this.reopenedAt = at;
        return true;
    }

    public LeadCloseReason getCloseReasonOrNull() {
        return closeReason;
    }

    /**
     * Closes the record, keeping the stage it reached. Whether that was the
     * person's doing is read off the reason alone.
     *
     * @return true when it closed, false when it was closed already
     */
    public boolean close(LeadCloseReason reason, Instant at) {
        return close(reason, at, reason.isAlwaysTheProspects());
    }

    /**
     * Closes the record, keeping the stage it reached.
     *
     * @param byProspect it ended for the person's own reason. A later record of
     *                   theirs here counts it ({@link LeadRepeatFlag})
     * @return true when it closed, false when it was closed already
     */
    public boolean close(LeadCloseReason reason, Instant at, boolean byProspect) {
        if (!isOpen()) {
            return false;
        }
        this.state = LeadState.CLOSED;
        this.closeReason = reason;
        this.closedAt = at;
        this.endedByProspect = byProspect && reason != LeadCloseReason.CONVERTED;
        return true;
    }
}
