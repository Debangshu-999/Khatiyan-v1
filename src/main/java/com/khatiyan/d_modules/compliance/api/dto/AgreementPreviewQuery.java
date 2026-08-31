package com.khatiyan.d_modules.compliance.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.compliance.model.AgreementTemplate;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Past;
import com.khatiyan.a_auth.model.Gender;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * What the onboarding screen needs to show the deed it is about to create.
 *
 * <p>Carries the room and the term as well as the money, because the deed states
 * both: the period clause prints the term's dates, and the furniture clause lists
 * the room's fittings. A preview missing them would differ from the document
 * actually produced, in exactly the two clauses a tenant is most likely to check.
 *
 * @param template the owner's clause selection for THIS stay; null falls back to
 *                 the property's stored default, which is what the screen sends
 *                 before anyone starts dropping clauses
 */
public record AgreementPreviewQuery(
        @NotNull UUID propertyId,
        UUID roomId,
        @PositiveOrZero Long rentAmountPaise,
        @PositiveOrZero Long depositAmountPaise,
        LocalDate startDate,
        Integer validityMonths,
        String earlyExitRule,
        AgreementTemplate template,

        /**
         * Who the deed will name as Tenant, as far as the wizard knows so far.
         *
         * <p>Null on the settings screen, which has no tenant — that path still
         * renders the block as named placeholders. On the onboarding path the
         * form has already collected these, and a preview that showed
         * "Tenant's Name" underlined while the owner had just typed the name
         * two steps earlier was showing them a document that was not the one
         * about to be issued.
         */
        @Valid TenantPreviewInput tenant,

        /**
         * Render this as the PROPERTY's template rather than one tenancy's deed.
         *
         * <p>Every value onboarding supplies becomes a named placeholder, and the
         * term is taken from the template's own defaults rather than from this
         * query — a settings screen has a default term but no tenant, no room and
         * no rent to state.
         *
         * <p>Exists because the settings screen previews the owner's UNSAVED
         * draft: it cannot use the saved-template preview on the settings
         * response, and without this flag it fell through to the tenancy path,
         * which read a term the screen never sends and so rendered every
         * agreement as indefinite.
         */
        boolean templateOnly) {

    /**
     * The tenant's particulars as typed into the onboarding form.
     *
     * <p>Nothing is required. A preview is meant to be watchable while a form
     * is being filled in, so each field resolves as it is answered and the rest
     * stay placeholders — refusing the whole preview because the PIN code is
     * half typed would be the opposite of useful.
     */
    public record TenantPreviewInput(
            @Size(max = 120) String fullName,
            @Size(max = 15) String phone,
            @Size(max = 300) String permanentAddress,
            @Size(max = 6) String permanentAddressPincode,
            @Past(message = "Date of birth must be in the past") LocalDate dateOfBirth,
            Gender gender) {
    }
}
