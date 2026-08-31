package com.khatiyan.d_modules.compliance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.compliance.model.AgreementPreamble;
import com.khatiyan.d_modules.compliance.model.ClauseParagraph;
import com.khatiyan.d_modules.compliance.model.ClauseSegment;
import com.khatiyan.d_modules.compliance.model.PartyBlock;

/**
 * The tenant's email is not on the deed. The landlord's is.
 *
 * <p>Worth a test of its own because it is baked into every document signed from
 * here on, and a deed cannot be corrected after the fact. A deed is fixed at
 * signing but an account is not: a tenant who changes their email afterwards
 * would leave the document asserting a contact that no longer reaches them.
 *
 * <p>The landlord survives that objection because their address must be VERIFIED
 * before onboarding can start at all, so it is a proved contact rather than
 * something an owner typed into a form.
 */
class PreambleEmailTest {

    private final PreambleTemplate template = new PreambleTemplate();

    @Test
    void theTenantsEmailIsNotPrinted() {
        AgreementPreamble preamble = render();

        assertThat(textOf(preamble.tenant()))
                .contains("Ravi Menon")
                .contains("+919007433360")
                .doesNotContain("Email")
                .doesNotContain("ravi@example.com");
    }

    @Test
    void theLandlordsEmailIsPrinted() {
        AgreementPreamble preamble = render();

        assertThat(textOf(preamble.landlord()))
                .contains("Email")
                .contains("owner@example.com");
    }

    /**
     * A template preview has no tenant yet, so every tenancy-supplied particular
     * renders as a named blank. The email must not come back as one of them —
     * a placeholder reading "Email" would tell an owner the deed asks for
     * something it no longer collects.
     */
    @Test
    void anUnknownTenantShowsNoEmailPlaceholderEither() {
        AgreementPreamble preamble = template.render(
                landlord(), PartyDetails.unknown(), premises(), facts(), null);

        assertThat(textOf(preamble.tenant()))
                .contains("Tenant's Name")
                .doesNotContain("Email");
    }

    /**
     * A named party resolves even when half its fields are missing.
     *
     * <p>The onboarding preview is watched while the form is still being filled
     * in, so a tenant with a name but no age yet must render as that name — not
     * fall back to placeholders because the rest is blank.
     */
    @Test
    void aPartlyKnownPartyStillPrintsWhatItHas() {
        PartyDetails partial = new PartyDetails(
                "Ravi Menon", null, null, "+919007433360", null, null, null, true);

        AgreementPreamble preamble = template.render(
                landlord(), partial, premises(), facts(), null);

        assertThat(textOf(preamble.tenant()))
                .contains("Ravi Menon")
                .contains("+919007433360")
                .doesNotContain("Tenant's Name");
    }

    private AgreementPreamble render() {
        return template.render(landlord(), tenant(), premises(), facts(), null);
    }

    private static String textOf(PartyBlock block) {
        StringBuilder text = new StringBuilder();
        for (ClauseParagraph paragraph : block.body()) {
            for (ClauseSegment segment : paragraph.segments()) {
                text.append(segment.text());
            }
        }
        return text.toString();
    }

    private static PartyDetails landlord() {
        return new PartyDetails(
                "Anita Rao", 47, "Female", "+919007433361", "owner@example.com",
                "4 Ulsoor Road, Bengaluru", "560042", true);
    }

    private static PartyDetails tenant() {
        return new PartyDetails(
                "Ravi Menon", 29, "Male", "+919007433360", "ravi@example.com",
                "12 Nandidurga Road, Bengaluru", "560046", true);
    }

    private static PremisesDetails premises() {
        return new PremisesDetails(
                "Sky PG", "Address", "Madhapur", "Hyderabad", "Telangana", "500046", "101", "Double sharing");
    }

    private static DeedFacts facts() {
        return new DeedFacts(
                LocalDate.of(2026, 6, 1),
                11,
                LocalDate.of(2027, 5, 1),
                12_000_00L,
                10_000_00L,
                false,
                "As per policy.",
                false,
                false,
                3,
                100_00L,
                "One month",
                null,
                List.of(),
                List.of(),
                List.of(),
                false);
    }
}
