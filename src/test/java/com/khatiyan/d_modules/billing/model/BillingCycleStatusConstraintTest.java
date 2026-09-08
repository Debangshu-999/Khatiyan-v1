package com.khatiyan.d_modules.billing.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

/**
 * Every {@link BillingCycleStatus} constant must be admitted by the database's
 * status CHECK constraint.
 *
 * <p>
 * <b>Why this test exists.</b> The status list is written down twice — once as a
 * Java enum, once as a {@code CHECK (status IN (...))} in a migration — and only
 * the Java copy is checked at build time. Adding a constant and forgetting the
 * migration compiles, passes every other test, and then fails in production the
 * first time a row reaches the new state, as a
 * {@code DataIntegrityViolationException} thrown at flush rather than anything
 * that names the real problem.
 *
 * <p>
 * That has now happened twice: V6062 added UPCOMING after V6057 introduced it,
 * and V6128 added CONFIRMATION_PENDING after V6124 introduced it — the second
 * one breaking a tenant's "Yes, I paid" for every bill in the app. This reads
 * the migrations rather than the database, so it needs no Spring context and
 * runs in the ordinary suite.
 */
class BillingCycleStatusConstraintTest {

    private static final Path MIGRATIONS = Path.of("src/main/resources/db/migration/billing");

    /**
     * Matches the constraint wherever it is defined — inside the original
     * CREATE TABLE or in a later ADD CONSTRAINT — and captures the value list.
     */
    private static final Pattern STATUS_CHECK = Pattern.compile(
            "chk_billing_cycles_status\\s+CHECK\\s*\\(\\s*status\\s+IN\\s*\\(([^)]*)\\)",
            Pattern.CASE_INSENSITIVE);

    @Test
    void everyStatusIsAdmittedByTheLatestCheckConstraint() throws IOException {
        String admitted = latestStatusCheckList();

        for (BillingCycleStatus status : BillingCycleStatus.values()) {
            assertThat(admitted)
                    .as("BillingCycleStatus.%s is missing from chk_billing_cycles_status. "
                            + "Add a migration that drops and re-adds the constraint with it.", status)
                    .contains("'" + status.name() + "'");
        }
    }

    /**
     * The constraint as it stands after every migration has run.
     *
     * <p>
     * Files are ordered by version, not by name: plain string ordering puts
     * V6062 after V6124, which would test a constraint two states out of date
     * and pass while production was broken.
     */
    private String latestStatusCheckList() throws IOException {
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            List<Path> byVersion = files
                    .filter(path -> path.getFileName().toString().endsWith(".sql"))
                    .sorted(Comparator.comparingInt(BillingCycleStatusConstraintTest::version))
                    .toList();

            String found = null;
            for (Path file : byVersion) {
                Matcher matcher = STATUS_CHECK.matcher(Files.readString(file));
                // The LAST match within a file too: a migration may drop and
                // re-add in one go, and the re-add is the one that survives.
                while (matcher.find()) {
                    found = matcher.group(1);
                }
            }

            assertThat(found)
                    .as("No chk_billing_cycles_status definition found under %s", MIGRATIONS)
                    .isNotNull();
            return found;
        }
    }

    private static int version(Path file) {
        Matcher matcher = Pattern.compile("^V(\\d+)__").matcher(file.getFileName().toString());
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : 0;
    }
}
