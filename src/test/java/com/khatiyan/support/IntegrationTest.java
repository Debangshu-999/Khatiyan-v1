package com.khatiyan.support;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * Boots the real application context against a real PostgreSQL.
 *
 * <p><b>Why this exists.</b> Until now nothing in this project loaded the
 * Spring context in a test. Every suite is a plain Mockito unit test, so a
 * green build said the classes behaved and said nothing at all about whether
 * the application <em>starts</em> — a bean cycle, a migration that disagrees
 * with an entity, or a missing configuration property only ever surfaced on
 * somebody's own boot, after the tests had passed.
 *
 * <p><b>What it covers.</b> The container runs the real Flyway migrations and
 * the context comes up with {@code ddl-auto: validate}, so a mapping that has
 * drifted from the schema fails here rather than at startup. Scheduling is
 * disabled in {@code application-test.yml} — see the note there.
 *
 * <p><b>Cost.</b> One container for the whole run: the {@code @ServiceConnection}
 * container in {@link PostgresContainer} is static, so JUnit and Spring's
 * context cache start it once and every test annotated with this shares it.
 * Requires Docker to be running.
 *
 * <p>Written as the prerequisite for the Boot 4.1 upgrade and the intelligence
 * module, which both need a regression net that proves the app still boots —
 * see {@code docs/Spring AI/ai-intelligence-platform-spec.md} §6.1.
 */
@Documented
@Inherited
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@SpringBootTest
@ActiveProfiles("test")
@Import(PostgresContainer.class)
public @interface IntegrationTest {
}
