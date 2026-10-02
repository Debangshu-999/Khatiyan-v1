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
 * One entry on a lead's timeline. Written once and never changed.
 *
 * <p>Calls and chats are not here. They are attempts, they belong to the
 * enquiry, and the enquiry keeps them.
 */
@Entity
@Table(name = "lead_activities", schema = "lead")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LeadActivity extends BaseEntity {

    public static final int MAX_DETAIL_LENGTH = 500;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "lead_id", nullable = false, updatable = false)
    private UUID leadId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, length = 40)
    private LeadActivityType type;

    /** Who did it. Null when the system did. */
    @Column(name = "actor_user_id", updatable = false)
    private UUID actorUserId;

    /** Who it was about, when that is a person: the handler it was given to. */
    @Column(name = "subject_user_id", updatable = false)
    private UUID subjectUserId;

    @Column(name = "enquiry_id", updatable = false)
    private UUID enquiryId;

    @Column(updatable = false, length = MAX_DETAIL_LENGTH)
    private String detail;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    private LeadActivity(
            UUID leadId, LeadActivityType type, UUID actorUserId, UUID subjectUserId, UUID enquiryId,
            String detail, Instant occurredAt) {
        this.id = UUID.randomUUID();
        this.leadId = leadId;
        this.type = type;
        this.actorUserId = actorUserId;
        this.subjectUserId = subjectUserId;
        this.enquiryId = enquiryId;
        this.detail = detail;
        this.occurredAt = occurredAt;
    }

    /** Something the pipeline recorded by itself, with no person acting. */
    public static LeadActivity bySystem(
            UUID leadId, LeadActivityType type, UUID subjectUserId, UUID enquiryId, String detail, Instant occurredAt) {
        return new LeadActivity(leadId, type, null, subjectUserId, enquiryId, detail, occurredAt);
    }

    /** Something a person did. */
    public static LeadActivity by(
            UUID actorUserId, UUID leadId, LeadActivityType type, UUID enquiryId, String detail, Instant occurredAt) {
        return new LeadActivity(leadId, type, actorUserId, null, enquiryId, detail, occurredAt);
    }
}
