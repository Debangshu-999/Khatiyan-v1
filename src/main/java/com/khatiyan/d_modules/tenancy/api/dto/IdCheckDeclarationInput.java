package com.khatiyan.d_modules.tenancy.api.dto;

import com.khatiyan.d_modules.tenancy.model.IdDocumentType;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * The owner's statement that they checked this tenant's ID.
 *
 * <p>One object rather than three loose parameters because the three facts only
 * mean anything together. "I checked their ID" is not a checkable claim; "I
 * checked a passport ending 4417" is one the tenant can confirm or contradict.
 *
 * <p>Four digits and no more. Enough to tie the declaration to a specific
 * document, not enough to impersonate anybody with, and it is the fragment
 * UIDAI's own masking convention leaves visible.
 *
 * @param confirmed    {@code @AssertTrue}, not {@code @NotNull}: an unchecked
 *                     box must fail rather than merely be absent
 * @param documentType what the tenant chose to produce
 * @param lastFour     the last four digits of that document
 */
public record IdCheckDeclarationInput(
        @AssertTrue(message = "Confirm you have checked the tenant's ID proof and photograph before onboarding")
        boolean confirmed,

        @NotNull(message = "Select which government ID you checked")
        IdDocumentType documentType,

        @NotNull(message = "Enter the last four digits of that ID")
        @Pattern(regexp = "^[0-9]{4}$", message = "Enter exactly four digits")
        String lastFour) {
}
