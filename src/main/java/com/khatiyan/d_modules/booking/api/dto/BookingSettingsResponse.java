package com.khatiyan.d_modules.booking.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.booking.model.BookingAssignmentMode;
import com.khatiyan.d_modules.booking.model.BookingSettings;
import com.khatiyan.d_modules.booking.service.BookingPolicy;

/**
 * The owner's booking settings.
 *
 * @param configured          false until the owner saves them once. Until then
 *                            the property takes no booking requests, and the
 *                            other values are what the form opens on.
 * @param minimumAdvanceDays  the soonest a move-in may be asked for
 * @param maximumAdvanceDays  the furthest. Fixed, with the minimum: the screen
 *                            says them and offers nothing to change
 * @param datePushMaximumDays how far a confirmed date may move, once. With the
 *                            maximum, the furthest a booking reaches (28 days).
 *                            Nothing further ahead exists in v1 (user, 2026-10-18)
 * @param version             sent back as If-Match on a save. Null until
 *                            configured.
 */
public record BookingSettingsResponse(
        UUID propertyId,
        boolean configured,
        boolean tokenRequired,
        Long tokenAmountPaise,
        Boolean tokenRefundable,
        int maximumAdvanceDays,
        boolean showFutureVacancies,
        BookingAssignmentMode assignmentMode,
        boolean includeOwnerInTurns,
        int minimumAdvanceDays,
        int datePushMaximumDays,
        Long version) {

    public static BookingSettingsResponse of(BookingSettings settings) {
        return new BookingSettingsResponse(settings.getPropertyId(), true, settings.isTokenRequired(),
                settings.getTokenAmountPaise(), settings.getTokenRefundable(), settings.getMaximumAdvanceDays(),
                settings.isShowFutureVacancies(), settings.getAssignmentMode(), settings.isIncludeOwnerInTurns(),
                BookingPolicy.MINIMUM_MOVE_IN_DAYS,
                BookingPolicy.DATE_PUSH_MAX_DAYS, settings.getVersion());
    }

    /** What the form opens on before the owner has saved anything. */
    public static BookingSettingsResponse notConfigured(UUID propertyId) {
        return new BookingSettingsResponse(propertyId, false, true, null, null,
                BookingPolicy.DEFAULT_MAXIMUM_MOVE_IN_DAYS, true, BookingAssignmentMode.FIRST_VIEW, true,
                BookingPolicy.MINIMUM_MOVE_IN_DAYS,
                BookingPolicy.DATE_PUSH_MAX_DAYS, null);
    }
}
