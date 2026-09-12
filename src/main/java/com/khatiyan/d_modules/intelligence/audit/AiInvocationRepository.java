package com.khatiyan.d_modules.intelligence.audit;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Reads and writes the AI audit trail. */
public interface AiInvocationRepository extends JpaRepository<AiInvocation, UUID> {

    /**
     * What one capability has spent since a point in time.
     *
     * <p>The budget is enforced by the rate limiter, which is fast and
     * in-memory. This is the durable second opinion — the one that answers
     * whether the free tier is actually big enough, after the fact.
     */
    @Query("""
        SELECT COALESCE(SUM(COALESCE(invocation.inputTokens, 0) + COALESCE(invocation.outputTokens, 0)), 0)
        FROM AiInvocation invocation
        WHERE invocation.capability = :capability
          AND invocation.createdAt >= :since
        """)
    long tokensSpentSince(AiCapability capability, Instant since);

    long countByCapabilityAndOutcomeAndCreatedAtGreaterThanEqual(
            AiCapability capability, AiOutcome outcome, Instant since);
}
