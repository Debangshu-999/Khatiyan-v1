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

    /**
     * The head of the deed: title, execution, both parties, recitals.
     *
     * <p>Stored, not rendered on read, and covered by the content hash — so a
     * signed agreement pins WHO agreed as firmly as what they agreed to. Rendering
     * the parties from the user table at read time would let a tenant change their
     * own address and silently alter a document they had already signed.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "preamble", columnDefinition = "jsonb")
    private AgreementPreamble preamble;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "clauses", columnDefinition = "jsonb", nullable = false)
    private List<AgreementClause> clauses = new ArrayList<>();

    /**
     * How this deed was built, kept beside what it says.
     *
     * <p>This is what makes a PENDING agreement re-editable: an owner dropping a
     * clause at onboarding changes the template, the assembler runs again and the
     * clause list is replaced. Re-deriving from the property instead would throw
     * away whatever was varied for this one stay.
     *
     * <p>After acceptance it stops mattering. The frozen clause list IS the
     * agreement; the template beside it is only a record of how it was produced.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "template", columnDefinition = "jsonb", nullable = false)
    private AgreementTemplate template = AgreementTemplate.starter();

    @Column(name = "content_hash", length = 128)
    private String contentHash;

    @Column(name = "accepted_by_user_id")
    private UUID acceptedByUserId;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    public static TenancyAgreement pending(
            UUID tenancyId,
            UUID propertyId,
            AgreementTemplate template,
            AgreementPreamble preamble,
            List<AgreementClause> clauses) {
        TenancyAgreement agreement = new TenancyAgreement();
        agreement.id = UUID.randomUUID();
        agreement.tenancyId = tenancyId;
        agreement.propertyId = propertyId;
        agreement.status = AgreementStatus.PENDING_ACCEPTANCE;
        agreement.template = template != null ? template : AgreementTemplate.starter();
        agreement.preamble = preamble;
        agreement.clauses = clauses != null ? new ArrayList<>(clauses) : new ArrayList<>();
        return agreement;
    }

    /**
     * Replace both halves while still editable.
     *
     * <p>Template and clauses move together and there is no setter for either
     * alone: the clauses are the template's output, so writing one without the
     * other leaves a deed whose text and whose stated construction disagree.
     */
    public void replace(
            AgreementTemplate template, AgreementPreamble preamble, List<AgreementClause> clauses) {
        ensureEditable();
        this.template = template != null ? template : AgreementTemplate.starter();
        this.preamble = preamble;
        this.clauses = clauses != null ? new ArrayList<>(clauses) : new ArrayList<>();
    }

    /**
     * The execution date is deliberately NOT written into the stored preamble.
     *
     * <p>It stays a placeholder there, and a reader renders {@link #acceptedAt}
     * in its place once the deed is accepted. Stamping it at acceptance would
     * change the document's bytes at the exact instant of signing — so the hash
     * the tenant agreed to would no longer be the hash of what is stored, and the
     * "you signed what you saw" guarantee would be lost to a field that is a
     * record of WHEN, not part of what was agreed.
     */

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
