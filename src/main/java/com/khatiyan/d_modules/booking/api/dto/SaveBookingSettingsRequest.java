package com.khatiyan.d_modules.booking.api.dto;

import com.khatiyan.d_modules.booking.model.BookingAssignmentMode;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * The owner's booking settings for one property.
 *
 * @param tokenRequired       whether a token is taken to hold a bed
 * @param tokenAmountPaise    required while the token is on
 * @param tokenRefundable     whether it comes back when the tenant cancels.
 *                            Required while the token is on: it has no default
 * @param maximumAdvanceDays  not the owner's to set (user, 2026-10-10): the
 *                            window is fixed at 3 to 21 days. Left out by the
 *                            app. Any other number is refused
 * @param showFutureVacancies whether tenants also see beds an approved exit is
 *                            about to free
 * @param assignmentMode      who handles a new request: the first manager to
 *                            open it, or the next in turn. Left as it stands
 *                            when absent
 * @param includeOwnerInTurns whether the owner takes a turn of their own. Left
 *                            as it stands when absent
 */
public record SaveBookingSettingsRequest(
        @NotNull(message = "Choose whether to take a token")
        Boolean tokenRequired,

        @Positive(message = "The token amount must be greater than zero")
        Long tokenAmountPaise,

        Boolean tokenRefundable,

        Integer maximumAdvanceDays,

        @NotNull(message = "Choose which vacancies tenants see")
        Boolean showFutureVacancies,

        BookingAssignmentMode assignmentMode,

        Boolean includeOwnerInTurns) {

    /** Leaving who handles requests as it stands. */
    public SaveBookingSettingsRequest(Boolean tokenRequired, Long tokenAmountPaise, Boolean tokenRefundable,
            Integer maximumAdvanceDays, Boolean showFutureVacancies) {
        this(tokenRequired, tokenAmountPaise, tokenRefundable, maximumAdvanceDays, showFutureVacancies, null, null);
    }
}
