package com.khatiyan.c_shared.concurrency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.d_modules.property.model.Property;
import com.khatiyan.d_modules.property.repository.PropertyRepository;
import com.khatiyan.support.IntegrationTest;

/**
 * The version on every row, against a real database (2026-09-28).
 *
 * <p>Not {@code @Transactional}: the point is what happens when real
 * transactions commit over each other, which a rolled-back test never does.
 */
@IntegrationTest
class VersionColumnTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PropertyRepository properties;
    @Autowired private PlatformTransactionManager transactionManager;

    private UUID propertyId;

    @AfterEach
    void removeFixture() {
        if (propertyId != null) {
            jdbc.update("DELETE FROM property.properties WHERE id = ?", propertyId);
        }
    }

    @Test
    void everySaveBumpsTheVersion() {
        propertyId = new AnalyticsFixtures(jdbc).property(Instant.now());
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        Long before = tx.execute(status -> load().getVersion());
        tx.executeWithoutResult(status -> load().updateVisitorsAllowed(true));
        Long after = tx.execute(status -> load().getVersion());

        assertThat(before).isZero();
        assertThat(after).isEqualTo(1L);
    }

    /**
     * Two people save the same record at once. Both read version 0, the first
     * commits version 1, and the second's save finds no version 0 left: it is
     * refused and writes nothing.
     */
    @Test
    void theSecondOfTwoRacingSavesIsRefusedAndWritesNothing() {
        propertyId = new AnalyticsFixtures(jdbc).property(Instant.now());
        TransactionTemplate outer = new TransactionTemplate(transactionManager);
        TransactionTemplate other = new TransactionTemplate(transactionManager);
        other.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        assertThatThrownBy(() -> outer.executeWithoutResult(status -> {
            Property mine = load();
            other.executeWithoutResult(inner -> load().updateVisitorsAllowed(true));
            mine.updateVisitorsAllowed(false);
        })).isInstanceOf(OptimisticLockingFailureException.class);

        assertThat(jdbc.queryForObject(
                "SELECT version FROM property.properties WHERE id = ?", Long.class, propertyId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT visitors_allowed FROM property.properties WHERE id = ?", Boolean.class, propertyId)).isTrue();
    }

    private Property load() {
        return properties.findById(propertyId).orElseThrow();
    }
}
