package com.khatiyan.d_modules.compliance.model;

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
 * Per-property agreement settings: whether agreements apply to monthly
 * tenancies ({@link AgreementMode}) and the default clause set ("starter
 * library") every new tenancy agreement is seeded from.
 */
@Entity
@Table(name = "property_agreement_settings", schema = "compliance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyAgreementSettings extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, unique = true)
    private UUID propertyId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "default_clauses", columnDefinition = "jsonb", nullable = false)
    private List<AgreementClause> defaultClauses = new ArrayList<>();

    public static PropertyAgreementSettings create(UUID propertyId, List<AgreementClause> defaultClauses) {
        PropertyAgreementSettings settings = new PropertyAgreementSettings();
        settings.id = UUID.randomUUID();
        settings.propertyId = propertyId;
        settings.defaultClauses = defaultClauses != null ? new ArrayList<>(defaultClauses) : new ArrayList<>();
        return settings;
    }

    public void update(List<AgreementClause> defaultClauses) {
        this.defaultClauses = defaultClauses != null ? new ArrayList<>(defaultClauses) : new ArrayList<>();
    }
}
