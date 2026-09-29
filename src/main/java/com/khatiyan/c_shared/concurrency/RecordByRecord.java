package com.khatiyan.c_shared.concurrency;

import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.khatiyan.c_shared.exception.StaleVersionException;

import jakarta.persistence.OptimisticLockException;
import lombok.extern.slf4j.Slf4j;

/**
 * Runs a scheduled job one record at a time (2026-09-28).
 *
 * <p>Every row now carries a version, so a job and a person changing the same
 * record at the same moment clash, and one side loses at commit. In one big
 * transaction that one clash would undo the whole night's batch. Here each
 * record gets its own transaction: a clash, or any other failure, costs that
 * record only. It is logged and left for the next run, which reads it fresh.
 * Jobs never retry in a loop ([[scheduled-runs-never-retry]]).
 *
 * <p>REQUIRED, not REQUIRES_NEW. Called from the scheduler there is no
 * transaction around it, so every record gets a fresh one. Called from inside
 * one (an integration test that rolls back its own data), each record joins it
 * and still sees the data it was given.
 *
 * <p>Work must load its record again inside, by id. Entities read outside the
 * record's transaction are detached and may be stale.
 */
@Slf4j
@Component
public class RecordByRecord {

    private final TransactionTemplate perRecord;

    public RecordByRecord(PlatformTransactionManager transactionManager) {
        this.perRecord = new TransactionTemplate(transactionManager);
    }

    /**
     * Runs {@code work} for each record in its own transaction and counts the
     * records where it returned true (changed something).
     */
    public <T> int run(String job, List<T> records, Function<T, Object> id, Predicate<T> work) {
        int changed = 0;
        for (T record : records) {
            if (attempt(job, id.apply(record), () -> work.test(record))) {
                changed++;
            }
        }
        return changed;
    }

    /**
     * One record's work in its own transaction. False when it changed nothing
     * or failed, and a failure is logged rather than thrown, so the caller's
     * loop carries on.
     */
    public boolean attempt(String job, Object recordId, Supplier<Boolean> work) {
        try {
            return Boolean.TRUE.equals(perRecord.execute(status -> work.get()));
        } catch (OptimisticLockingFailureException | OptimisticLockException | StaleVersionException clash) {
            log.info("{} left {} for the next run: someone changed it at the same moment", job, recordId);
            return false;
        } catch (RuntimeException failure) {
            log.error("{} failed for {}, left for the next run", job, recordId, failure);
            return false;
        }
    }
}
