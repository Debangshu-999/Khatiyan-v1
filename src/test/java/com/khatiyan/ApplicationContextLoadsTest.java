package com.khatiyan;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.support.IntegrationTest;

/**
 * The one test that says the application starts.
 *
 * <p>Everything else in this project is a Mockito unit test, which means the
 * build has never once answered the question every other check assumes: does
 * the thing boot? A bean cycle, an entity that has drifted from its table, a
 * migration folder missing from {@code flyway.locations}, a required property
 * with no default — all of them pass a green suite and fail on startup.
 *
 * <p>It asserts almost nothing on purpose. Reaching the assertions at all means
 * every bean was constructed, all {@code flyway.locations} applied cleanly in
 * order, and Hibernate validated every mapping against the schema they
 * produced. That is the whole point of it.
 */
@IntegrationTest
@DisplayName("the application context")
class ApplicationContextLoadsTest {

    @Autowired private ApplicationContext context;
    @Autowired private DataSource dataSource;

    @Test
    @DisplayName("starts, with every bean built and every mapping validated")
    void contextLoads() {
        assertThat(context).isNotNull();
        assertThat(context.getBeanDefinitionCount()).isPositive();
    }

    @Test
    @DisplayName("has run every migration folder listed in flyway.locations")
    void migrationsApplied() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        Integer failed = jdbc.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success = false", Integer.class);
        assertThat(failed).isZero();

        // A folder left out of flyway.locations is silently skipped — the app
        // then fails at startup with "missing table" rather than at migration
        // time, which is a confusing place to learn about it. Every module's
        // schema being present is the readable version of that check.
        Integer schemas = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.schemata
                WHERE schema_name IN ('auth', 'property', 'tenancy', 'billing', 'notice', 'concern')
                """, Integer.class);
        assertThat(schemas).isEqualTo(6);
    }
}
