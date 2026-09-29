package com.khatiyan.c_shared.concurrency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

/**
 * One record's clash or failure never costs the rest of the run (2026-09-28).
 */
class RecordByRecordTest {

    /** A transaction manager that hands out a fresh status per record. */
    static PlatformTransactionManager perRecordTransactions() {
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());
        return manager;
    }

    @Test
    void aClashOnOneRecordSkipsItAndTheRestStillRun() {
        PlatformTransactionManager manager = perRecordTransactions();
        List<String> ran = new ArrayList<>();

        int changed = new RecordByRecord(manager).run("test-job", List.of("a", "b", "c"), id -> id, record -> {
            if (record.equals("b")) {
                throw new ObjectOptimisticLockingFailureException("raced", null);
            }
            ran.add(record);
            return true;
        });

        assertThat(ran).containsExactly("a", "c");
        assertThat(changed).isEqualTo(2);
        // Each record in its own transaction: three begun, two committed, one rolled back.
        verify(manager, times(3)).getTransaction(any());
        verify(manager, times(2)).commit(any());
        verify(manager, times(1)).rollback(any());
    }

    @Test
    void anyOtherFailureIsAlsoContainedToItsRecord() {
        int changed = new RecordByRecord(perRecordTransactions()).run("test-job", List.of(1, 2), id -> id, record -> {
            if (record == 1) {
                throw new IllegalStateException("broken row");
            }
            return true;
        });

        assertThat(changed).isEqualTo(1);
    }

    @Test
    void workThatChangesNothingIsNotCounted() {
        int changed = new RecordByRecord(perRecordTransactions()).run("test-job", List.of(1, 2, 3), id -> id, record -> record == 2);

        assertThat(changed).isEqualTo(1);
    }
}
