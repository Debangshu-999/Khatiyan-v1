package com.khatiyan.d_modules.lead.model;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Which lead an enquiry belongs to.
 *
 * <p>Keyed by the enquiry, so an enquiry belongs to exactly one lead and the
 * database refuses a second. It is also what makes hearing about an enquiry
 * twice harmless: the row is already there.
 */
@Entity
@Table(name = "lead_enquiries", schema = "lead")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LeadEnquiry extends BaseEntity {

    @Id
    @Column(name = "enquiry_id", nullable = false, updatable = false)
    private UUID enquiryId;

    @Column(name = "lead_id", nullable = false, updatable = false)
    private UUID leadId;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    private LeadEnquiry(UUID enquiryId, UUID leadId, Instant joinedAt) {
        this.enquiryId = enquiryId;
        this.leadId = leadId;
        this.joinedAt = joinedAt;
    }

    public static LeadEnquiry of(UUID enquiryId, UUID leadId, Instant joinedAt) {
        return new LeadEnquiry(enquiryId, leadId, joinedAt);
    }
}
