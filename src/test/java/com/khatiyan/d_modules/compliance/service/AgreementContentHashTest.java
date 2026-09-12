package com.khatiyan.d_modules.compliance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementPreamble;
import com.khatiyan.d_modules.compliance.model.ClauseParagraph;
import com.khatiyan.d_modules.compliance.model.ClauseSegment;
import com.khatiyan.d_modules.compliance.model.MainClauseType;
import com.khatiyan.d_modules.compliance.model.MiscClauseType;
import com.khatiyan.d_modules.compliance.model.PartyBlock;
import com.khatiyan.support.IntegrationTest;

/**
 * The agreement content hash must never move. This is the tripwire.
 *
 * <p><b>What breaks if it does.</b> Accepting a deed stores the SHA-256 of its
 * serialised preamble and clauses, and that hash is what binds a signature to
 * the exact words the tenant saw. Change the serialisation by one byte and
 * every already-signed agreement stops verifying — silently, because nothing
 * recomputes an old hash until someone asks whether a signature is still valid,
 * which is exactly when a wrong answer costs the most.
 *
 * <p><b>Why now.</b> This is hazard #1 of the Spring Boot 4.1 upgrade
 * (see {@code docs/Spring AI/ai-intelligence-platform-spec.md} §6.2). Boot 4
 * ships Jackson 3, and the hash rides on a Jackson mapper: property order,
 * inclusion rules, how an enum or a boolean is written. The spec's instruction
 * is to pin the hash <em>before</em> touching the upgrade, so the byte that
 * moves is caught by a red test rather than discovered in production.
 *
 * <p><b>Why it boots the context.</b> The hash mapper is
 * {@code objectMapper.copy().setSerializationInclusion(NON_NULL)} — a copy of
 * the <em>application's</em> mapper, so it inherits every module and every
 * setting Boot's auto-configuration puts there. Building a plain
 * {@code new ObjectMapper()} in a unit test would pin a mapper nobody uses and
 * pass happily through a change that broke the real one. Autowiring the real
 * service is the only version of this test that means anything.
 *
 * <p><b>If this fails after the upgrade,</b> do not update the constant. The
 * constant is the contract. Restore the old serialisation — keeping the hash
 * mapper on Jackson 2 explicitly is the documented remedy.
 */
@IntegrationTest
@DisplayName("the agreement content hash")
class AgreementContentHashTest {

    /**
     * Recorded 2026-09-12 on Boot 3.3.5 / Jackson 2, before any upgrade work.
     */
    private static final String PINNED_HASH =
            "1cb3d0f9fbafe1d0cef4dbcaa0dbd8c99c841bbaee9542737dbea88d7043af4e";

    @Autowired private TenancyAgreementService service;

    @Test
    @DisplayName("is unchanged for a known deed")
    void hashHasNotMoved() {
        String hash = hashOf(fixedPreamble(), fixedClauses());

        assertThat(hash)
                .as("The serialisation of a signed agreement has changed. Every hash "
                        + "already stored against an accepted deed is now wrong. Fix the "
                        + "serialisation, do not update this constant.")
                .isEqualTo(PINNED_HASH);
    }

    @Test
    @DisplayName("is stable across repeated runs of the same deed")
    void hashIsDeterministic() {
        // Cheap, and it catches the one failure mode the pinned constant cannot:
        // a serialisation whose order varies run to run would still match the
        // constant sometimes. It has to match every time.
        assertThat(hashOf(fixedPreamble(), fixedClauses()))
                .isEqualTo(hashOf(fixedPreamble(), fixedClauses()));
    }

    @Test
    @DisplayName("changes when a single character of the deed changes")
    void hashRespondsToContent() {
        AgreementPreamble tampered = new AgreementPreamble(
                "TENANCY AGREEMENT.",
                fixedPreamble().execution(),
                fixedPreamble().landlord(),
                fixedPreamble().tenant(),
                fixedPreamble().recitals());

        assertThat(hashOf(tampered, fixedClauses())).isNotEqualTo(PINNED_HASH);
    }

    private String hashOf(AgreementPreamble preamble, List<AgreementClause> clauses) {
        // Through the proxy, not at it. The autowired bean is a transactional
        // AOP proxy whose own fields are never populated, so reflecting a
        // private method straight onto it reads a null hashMapper and throws
        // rather than hashing anything.
        TenancyAgreementService target = AopTestUtils.getTargetObject(service);
        return ReflectionTestUtils.invokeMethod(target, "contentHash", preamble, clauses);
    }

    /**
     * A deed that exercises every shape the real one contains.
     *
     * <p>Deliberately includes a null-valued clause field (a MAIN clause leaves
     * {@code miscType} null and vice versa), because {@code NON_NULL} inclusion
     * is the specific setting the hash mapper pins — a change there shows up
     * only on a fixture that has nulls to drop.
     */
    private static AgreementPreamble fixedPreamble() {
        return new AgreementPreamble(
                "TENANCY AGREEMENT",
                List.of(ClauseParagraph.text("Executed on this day at Kolkata.")),
                new PartyBlock(
                        "LANDLORD",
                        "Owner",
                        List.of(ClauseParagraph.of(
                                ClauseSegment.plain("Name: "),
                                ClauseSegment.marked("Ashirvad Home Stays")))),
                new PartyBlock(
                        "TENANT",
                        "Occupant",
                        List.of(ClauseParagraph.of(
                                ClauseSegment.plain("Name: "),
                                ClauseSegment.placeholder("Tenant name")))),
                List.of(
                        ClauseParagraph.text("WHEREAS the landlord is the lawful owner."),
                        ClauseParagraph.bullet("AND WHEREAS the tenant wishes to occupy.")));
    }

    private static List<AgreementClause> fixedClauses() {
        return List.of(
                AgreementClause.main(
                        MainClauseType.RENT,
                        "Rent",
                        List.of(
                                ClauseParagraph.of(
                                        ClauseSegment.plain("The monthly rent is "),
                                        ClauseSegment.marked("Rs. 12,000")),
                                ClauseParagraph.bullet("Payable in advance.")),
                        1),
                AgreementClause.misc(MiscClauseType.PROPERTY_CONDITION_ON_VACATING, 2),
                AgreementClause.custom("House rules", "No loud music after 10pm.", 3));
    }
}
