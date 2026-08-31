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

    /**
     * The owner's choices, not the deed.
     *
     * <p>This used to hold a list of rendered clauses, which meant the property's
     * defaults carried prose resolved against no particular tenancy — a rent
     * sentence with somebody else's rent in it, waiting to be copied. A template
     * holds only what the owner actually decided; the words are produced per
     * tenancy, from that tenancy's facts.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "template", columnDefinition = "jsonb", nullable = false)
    private AgreementTemplate template = AgreementTemplate.starter();

    public static PropertyAgreementSettings create(UUID propertyId, AgreementTemplate template) {
        PropertyAgreementSettings settings = new PropertyAgreementSettings();
        settings.id = UUID.randomUUID();
        settings.propertyId = propertyId;
        settings.template = template != null ? template : AgreementTemplate.starter();
        return settings;
    }

    public void update(AgreementTemplate template) {
        this.template = template != null ? template : AgreementTemplate.starter();
    }
}
