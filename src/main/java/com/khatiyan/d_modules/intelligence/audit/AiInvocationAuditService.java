package com.khatiyan.d_modules.intelligence.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes the audit row for every AI call.
 *
 * <p><b>{@code REQUIRES_NEW}, and failures are swallowed.</b> Both are
 * deliberate. The audit is a record of what happened, so it has to survive the
 * caller rolling back — a call that was made and then failed validation is
 * exactly the row worth keeping. And the reverse must never happen: a search
 * that worked must not fail because writing its audit row did. Losing an audit
 * row is bad, losing the user's answer to protect it is worse.
 */
@Service
public class AiInvocationAuditService {

    private static final Logger log = LoggerFactory.getLogger(AiInvocationAuditService.class);

    private final AiInvocationRepository repository;

    public AiInvocationAuditService(AiInvocationRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(AiInvocation invocation) {
        try {
            repository.save(invocation);
        } catch (RuntimeException exception) {
            // Logged, never rethrown. See the class note.
            log.warn("Could not write AI audit row capability={} provider={} outcome={}",
                    invocation.getCapability(), invocation.getProvider(), invocation.getOutcome(), exception);
        }
    }
}
