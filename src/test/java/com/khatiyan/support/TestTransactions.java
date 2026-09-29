package com.khatiyan.support;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import com.khatiyan.c_shared.concurrency.RecordByRecord;

/**
 * Transactions for Mockito tests of services whose scheduled jobs run record
 * by record (2026-09-28). No database: every record just gets a status.
 */
public final class TestTransactions {

    private TestTransactions() {
    }

    public static RecordByRecord recordByRecord() {
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        lenient().when(manager.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());
        return new RecordByRecord(manager);
    }
}
