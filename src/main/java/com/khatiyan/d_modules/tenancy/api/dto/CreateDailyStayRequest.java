package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.tenancy.model.GuestDetails;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Books a daily stay for a guest who will never open the app.
 *
 * <p>There is no phone lookup behind this and no account at the end of it. What
 * the owner fills in is a register entry — the same details a hotel desk takes —
 * and it is written straight onto the tenancy.
 *
 * <p>Monthly tenancies do not come through here. They carry an agreement, so
 * they go through the compliance module's onboarding request instead.
 */
public record CreateDailyStayRequest(
    @NotNull UUID propertyId,
    @NotNull UUID roomId,
    @NotNull LocalDate startDate,

    /** Checkout day. Required — a daily stay is priced by its length. */
    @NotNull(message = "Enter the checkout date") LocalDate plannedEndDate,

    @NotBlank(message = "Enter the guest's full name as it appears on their ID")
    @Size(max = 120) String guestName,

    @NotBlank(message = "Enter the guest's phone number")
    @Size(max = 15) String guestPhone,

    /**
     * The one field an owner may leave blank. A walk-in often has no reason to
     * give an email, and unlike the rest it is not part of identifying them.
     */
    @Email(message = "Enter a valid email address")
    @Size(max = 255) String guestEmail,

    @NotBlank(message = "Enter the guest's address")
    @Size(max = 500) String guestAddress,

    /**
     * Age as stated at check-in, not a date of birth. See {@link GuestDetails} —
     * a register records what it was told and never recomputes it.
     */
    @NotNull(message = "Enter the guest's age")
    @Min(value = 18, message = "The guest must be 18 or older")
    @Max(value = 120, message = "Enter a valid age") Integer guestAge,

    @NotNull(message = "Select the guest's gender") Gender guestGender,

    /**
     * The owner's declaration that they checked this guest's government photo
     * ID: the confirmation, which document, and its last four digits.
     *
     * <p>Required on a guest stay exactly as on a tenancy. Nobody signs an
     * agreement here, so this declaration is the whole of the owner's record
     * that they saw who they were letting a room to.
     */
    @NotNull(message = "Confirm you have checked the guest's ID proof and photograph before onboarding")
    @Valid IdCheckDeclarationInput idCheck
) {
    public GuestDetails toGuestDetails() {
        return new GuestDetails(guestName, guestPhone, guestEmail, guestAddress, guestAge, guestGender);
    }
}
