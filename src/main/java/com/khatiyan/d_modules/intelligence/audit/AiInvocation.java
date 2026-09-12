package com.khatiyan.d_modules.intelligence.audit;

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
 * One question asked of a language model, and what it cost.
 *
 * <p><b>No prompt, no response.</b> A smart-search prompt is whatever a tenant
 * typed and an insight prompt is built from a property's figures. Keeping
 * either here would make this table a second copy of the data the redaction
 * rules exist to protect. {@code snapshotHash} ties a generated insight back to
 * the figures behind it without storing them twice.
 *
 * <p><b>Refusals are recorded too.</b> A call the budget refused, or one whose
 * output failed validation, is as much a fact as a successful answer — those
 * are the rows that say the free tier is too small, or that a prompt has
 * drifted since the golden set last passed.
 */
@Entity
@Table(name = "ai_invocation", schema = "intelligence")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiInvocation extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private AiCapability capability;

    /** Null for scheduled work that no person triggered. */
    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "actor_role", length = 30)
    private String actorRole;

    @Column(name = "property_id")
    private UUID propertyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AiProvider provider;

    @Column(nullable = false, length = 100)
    private String model;

    @Column(name = "fallback_used", nullable = false)
    private boolean fallbackUsed;

    @Column(name = "prompt_version", length = 20)
    private String promptVersion;

    @Column(name = "schema_version", length = 20)
    private String schemaVersion;

    @Column(name = "snapshot_hash", length = 64)
    private String snapshotHash;

    /** Null when the call never reached a provider, or returned no usage. */
    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(name = "latency_ms", nullable = false)
    private int latencyMs;

    @Column(name = "cache_hit", nullable = false)
    private boolean cacheHit;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private AiOutcome outcome;

    @Column(name = "error_code", length = 60)
    private String errorCode;

    @Column(name = "trace_id", length = 64)
    private String traceId;

    private AiInvocation(AiCapability capability, AiProvider provider, String model, AiOutcome outcome) {
        this.id = UUID.randomUUID();
        this.capability = capability;
        this.provider = provider;
        this.model = model;
        this.outcome = outcome;
    }

    /** A call that reached a provider and came back. */
    public static AiInvocation answered(
            AiCapability capability,
            AiProvider provider,
            String model,
            UUID actorUserId,
            Integer inputTokens,
            Integer outputTokens,
            int latencyMs) {
        AiInvocation invocation = new AiInvocation(capability, provider, model, AiOutcome.SUCCESS);
        invocation.actorUserId = actorUserId;
        invocation.inputTokens = inputTokens;
        invocation.outputTokens = outputTokens;
        invocation.latencyMs = latencyMs;
        return invocation;
    }

    /**
     * A call that never happened, because a budget or quota said no.
     *
     * <p>Worth a row precisely because nothing was spent: a table of only
     * successful calls cannot answer "how often are we turning people away".
     */
    public static AiInvocation refused(
            AiCapability capability, AiProvider provider, String model, UUID actorUserId, String errorCode) {
        AiInvocation invocation = new AiInvocation(capability, provider, model, AiOutcome.REFUSED_BUDGET);
        invocation.actorUserId = actorUserId;
        invocation.errorCode = errorCode;
        invocation.latencyMs = 0;
        return invocation;
    }

    /** A call that reached a provider and failed there. */
    public static AiInvocation failed(
            AiCapability capability,
            AiProvider provider,
            String model,
            UUID actorUserId,
            AiOutcome outcome,
            String errorCode,
            int latencyMs) {
        AiInvocation invocation = new AiInvocation(capability, provider, model, outcome);
        invocation.actorUserId = actorUserId;
        invocation.errorCode = errorCode;
        invocation.latencyMs = latencyMs;
        return invocation;
    }

    /** An answer served from the interpretation cache, costing no tokens. */
    public static AiInvocation fromCache(AiCapability capability, UUID actorUserId, int latencyMs) {
        AiInvocation invocation =
                new AiInvocation(capability, AiProvider.NONE, "cache", AiOutcome.SUCCESS);
        invocation.actorUserId = actorUserId;
        invocation.cacheHit = true;
        invocation.latencyMs = latencyMs;
        return invocation;
    }

    public AiInvocation onProperty(UUID propertyId) {
        this.propertyId = propertyId;
        return this;
    }

    public AiInvocation withVersions(String promptVersion, String schemaVersion, String snapshotHash) {
        this.promptVersion = promptVersion;
        this.schemaVersion = schemaVersion;
        this.snapshotHash = snapshotHash;
        return this;
    }

    public AiInvocation viaFallback() {
        this.fallbackUsed = true;
        return this;
    }

    public AiInvocation withTrace(String traceId) {
        this.traceId = traceId;
        return this;
    }
}
