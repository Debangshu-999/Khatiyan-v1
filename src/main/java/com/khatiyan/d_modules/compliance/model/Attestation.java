package com.khatiyan.d_modules.compliance.model;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One recorded declaration, frozen at the moment it was made.
 *
 * <p>Deliberately <b>not</b> a {@code BaseEntity}. That base class carries an
 * {@code updated_at} that Spring maintains on every save, and a row with an
 * update timestamp is a row that expects to be updated. Nothing here is ever
 * updated: the table refuses it at the database, and this class has no setters
 * and no mutating methods at all.
 *
 * <p>The fields are ordinary columns rather than one JSON blob because they have
 * to be queryable — "every declaration this owner made in March" is a question
 * somebody will ask under time pressure. {@link #details} holds only what varies
 * between kinds.
 */
@Entity
@Table(name = "attestations", schema = "compliance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Attestation {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, updatable = false, length = 48)
    private String kind;

    @Column(name = "subject_id", nullable = false, updatable = false)
    private UUID subjectId;

    @Column(name = "actor_user_id", nullable = false, updatable = false)
    private UUID actorUserId;

    @Column(name = "session_jti", updatable = false)
    private UUID sessionJti;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "client_ip", updatable = false, length = 64)
    private String clientIp;

    @Column(name = "device_brand", updatable = false, length = 64)
    private String deviceBrand;

    @Column(name = "device_model", updatable = false, length = 96)
    private String deviceModel;

    @Column(name = "device_os_version", updatable = false, length = 48)
    private String deviceOsVersion;

    @Column(name = "device_os_build", updatable = false, length = 96)
    private String deviceOsBuild;

    @Column(name = "app_version", updatable = false, length = 32)
    private String appVersion;

    @Column(name = "app_install_id", updatable = false, length = 64)
    private String appInstallId;

    @Column(updatable = false, length = 24)
    private String platform;

    @Column(name = "statement_key", nullable = false, updatable = false, length = 64)
    private String statementKey;

    @Column(name = "statement_version", nullable = false, updatable = false)
    private int statementVersion;

    @Column(name = "statement_text", nullable = false, updatable = false)
    private String statementText;

    @Column(name = "subject_hash", updatable = false, length = 128)
    private String subjectHash;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false, updatable = false)
    private Map<String, String> details = new LinkedHashMap<>();

    @Column(name = "otp_verified", nullable = false, updatable = false)
    private boolean otpVerified;

    @Column(name = "otp_verified_at", updatable = false)
    private Instant otpVerifiedAt;

    @Column(name = "otp_channel", updatable = false, length = 24)
    private String otpChannel;

    /**
     * Where the code went, masked. The last four digits of the phone are enough
     * for the person to recognise it as theirs; the whole number is already on
     * their account and does not need a second copy here.
     */
    @Column(name = "otp_destination", updatable = false, length = 32)
    private String otpDestination;

    @Column(name = "record_hash", nullable = false, updatable = false, length = 128)
    private String recordHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Builder
    private Attestation(
            AttestationKind kind,
            UUID subjectId,
            UUID actorUserId,
            UUID sessionJti,
            Instant occurredAt,
            String clientIp,
            DeviceFingerprint device,
            LegalStatement statement,
            String subjectHash,
            Map<String, String> details,
            Instant otpVerifiedAt,
            String otpChannel,
            String otpDestination) {
        this.id = UUID.randomUUID();
        this.kind = kind.name();
        this.subjectId = subjectId;
        this.actorUserId = actorUserId;
        this.sessionJti = sessionJti;
        this.occurredAt = occurredAt;
        this.clientIp = clientIp;
        this.statementKey = statement.key();
        this.statementVersion = statement.version();
        this.statementText = statement.text();
        this.subjectHash = subjectHash;
        this.details = details == null ? new LinkedHashMap<>() : new LinkedHashMap<>(details);
        this.otpVerified = otpVerifiedAt != null;
        this.otpVerifiedAt = otpVerifiedAt;
        this.otpChannel = otpChannel;
        this.otpDestination = otpDestination;
        this.createdAt = Instant.now();

        if (device != null) {
            this.deviceBrand = device.brand();
            this.deviceModel = device.model();
            this.deviceOsVersion = device.osVersion();
            this.deviceOsBuild = device.osBuild();
            this.appVersion = device.appVersion();
            this.appInstallId = device.installId();
            this.platform = device.platform();
        }
    }

    /**
     * Seals the record with its own fingerprint.
     *
     * <p>Called once, by AttestationService, immediately before the insert.
     *
     * <p>What stops a caller setting a convenient hash is the once-only guard
     * below, not the visibility — the service lives in a sibling package, so
     * package-private was never going to reach it. Re-sealing throws, and the
     * column is {@code updatable = false} besides, so a second value cannot
     * reach the database even if this object is passed around.
     */
    public void seal(String recordHash) {
        if (this.recordHash != null) {
            throw new IllegalStateException("An attestation is sealed once");
        }
        this.recordHash = recordHash;
    }
}
