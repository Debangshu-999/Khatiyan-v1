package com.khatiyan.d_modules.compliance.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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
 * The per-tenancy agreement instance: a copy of the property's clause set,
 * editable while {@code PENDING_ACCEPTANCE}, frozen (immutable + content hash)
 * once {@code ACCEPTED}. The frozen {@code ACCEPTED} row is the legal snapshot
 * and the ruleset enforcement reads.
 */
@Entity
@Table(name = "tenancy_agreements", schema = "compliance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TenancyAgreement extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenancy_id", nullable = false, unique = true)
    private UUID tenancyId;

    @Column(name = "property_id", nullable = false)
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AgreementStatus status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "clauses", columnDefinition = "jsonb", nullable = false)
    private List<AgreementClause> clauses = new ArrayList<>();

    @Column(name = "content_hash", length = 128)
    private String contentHash;

    @Column(name = "accepted_by_user_id")
    private UUID acceptedByUserId;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    public static TenancyAgreement pending(UUID tenancyId, UUID propertyId, List<AgreementClause> clauses) {
        TenancyAgreement agreement = new TenancyAgreement();
        agreement.id = UUID.randomUUID();
        agreement.tenancyId = tenancyId;
        agreement.propertyId = propertyId;
        agreement.status = AgreementStatus.PENDING_ACCEPTANCE;
        agreement.clauses = clauses != null ? new ArrayList<>(clauses) : new ArrayList<>();
        return agreement;
    }

    /** Replace the clause list while still editable (pending). */
    public void replaceClauses(List<AgreementClause> clauses) {
        ensureEditable();
        this.clauses = clauses != null ? new ArrayList<>(clauses) : new ArrayList<>();
    }

    /** Freeze the agreement as the accepted snapshot. */
    public void accept(UUID acceptedByUserId, String contentHash, Instant acceptedAt) {
        ensureEditable();
        this.status = AgreementStatus.ACCEPTED;
        this.acceptedByUserId = acceptedByUserId;
        this.contentHash = contentHash;
        this.acceptedAt = acceptedAt;
    }

    public void cancel() {
        if (this.status == AgreementStatus.ACCEPTED) {
            throw new IllegalStateException("An accepted agreement cannot be cancelled");
        }
        this.status = AgreementStatus.CANCELLED;
    }

    public boolean isAccepted() {
        return this.status == AgreementStatus.ACCEPTED;
    }

    private void ensureEditable() {
        if (this.status == AgreementStatus.ACCEPTED) {
            throw new IllegalStateException("An accepted agreement is immutable");
        }
        if (this.status == AgreementStatus.CANCELLED) {
            throw new IllegalStateException("A cancelled agreement cannot be modified");
        }
    }
}
