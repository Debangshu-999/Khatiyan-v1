package com.khatiyan.d_modules.booking.model;

import java.util.List;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.service.BookingHandlerRules;
import com.khatiyan.d_modules.booking.service.BookingPolicy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * The owner's booking settings for one property.
 *
 * <p>No row means the owner has not set bookings up, and the property takes no
 * requests. That is deliberate: a tenant is shown the token and its refund
 * answer before they ask, so there must be an answer to show.
 *
 * <p>A change applies to requests sent afterwards. What an open request was
 * shown is frozen on the request.
 */
@Entity
@Table(name = "settings", schema = "booking")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingSettings extends BaseEntity {

    @Id
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "token_required", nullable = false)
    private boolean tokenRequired;

    /** Kept while the token is switched off, so switching it back on restores it. */
    @Column(name = "token_amount_paise")
    private Long tokenAmountPaise;

    /** Whether the token comes back when the tenant is the one who cancels. */
    @Column(name = "token_refundable")
    private Boolean tokenRefundable;

    @Column(name = "maximum_advance_days", nullable = false)
    private int maximumAdvanceDays;

    /** Whether tenants also see beds that an approved exit is about to free. */
    @Column(name = "show_future_vacancies", nullable = false)
    private boolean showFutureVacancies;

    @Enumerated(EnumType.STRING)
    @Column(name = "assignment_mode", nullable = false, length = 20)
    private BookingAssignmentMode assignmentMode;

    /** Whether the owner takes a turn of their own where the system takes turns. */
    @Column(name = "include_owner_in_turns", nullable = false)
    private boolean includeOwnerInTurns;

    /** Who got the last turn. The next goes to whoever follows them now. */
    @Column(name = "last_assigned_user_id")
    private UUID lastAssignedUserId;

    // long_advance_charge and long_advance_monthly_paise (V6218) are no longer
    // read: the charge for bookings 28+ days ahead was dropped for v1 (user,
    // 2026-10-18). The columns stay, unmapped, as migrations are immutable.

    @Column(name = "updated_by_user_id", nullable = false)
    private UUID updatedByUserId;

    private BookingSettings(UUID propertyId) {
        this.propertyId = propertyId;
        this.assignmentMode = BookingAssignmentMode.FIRST_VIEW;
        // The owner takes a turn unless they opt out (user, 2026-10-11). It was the other way round.
        this.includeOwnerInTurns = true;
    }

    public static BookingSettings forProperty(UUID propertyId) {
        return new BookingSettings(propertyId);
    }

    /**
     * @param tokenAmountPaise required while the token is on. Left alone when
     *                         null and the token is off.
     * @param tokenRefundable  the owner's yes or no. It has no default: while
     *                         the token is on the owner must choose.
     * @param assignmentMode   who handles a new request. Left as it stands
     *                         when null.
     */
    public void apply(boolean tokenRequired, Long tokenAmountPaise, Boolean tokenRefundable,
            Integer maximumAdvanceDays, boolean showFutureVacancies, BookingAssignmentMode assignmentMode,
            Boolean includeOwnerInTurns, UUID byUserId) {
        if (tokenAmountPaise != null && tokenAmountPaise <= 0) {
            throw new ValidationException("The token amount must be greater than zero.");
        }
        // What was set before stands until it is replaced, so a token switched
        // off and on again comes back as it was.
        Long amount = tokenAmountPaise != null ? tokenAmountPaise : this.tokenAmountPaise;
        Boolean refundable = tokenRefundable != null ? tokenRefundable : this.tokenRefundable;
        if (tokenRequired && amount == null) {
            throw new ValidationException("Enter the token amount.");
        }
        if (tokenRequired && refundable == null) {
            throw new ValidationException("Choose whether the token is refundable when the tenant cancels.");
        }
        this.tokenRequired = tokenRequired;
        this.tokenAmountPaise = amount;
        this.tokenRefundable = refundable;
        this.maximumAdvanceDays = BookingPolicy.requireMaximumAdvanceDays(maximumAdvanceDays);
        this.showFutureVacancies = showFutureVacancies;
        if (assignmentMode != null) {
            this.assignmentMode = assignmentMode;
        }
        if (includeOwnerInTurns != null) {
            this.includeOwnerInTurns = includeOwnerInTurns;
        }
        this.updatedByUserId = byUserId;
    }

    /**
     * Takes the next turn and remembers who got it. The row must be locked
     * for the rest of the transaction: two requests arriving together would
     * otherwise read the same last turn and both go to the same person.
     *
     * @return the handler, or null when nobody is in the order
     */
    public UUID takeNextTurn(List<UUID> order) {
        UUID next = BookingHandlerRules.nextTurn(order, lastAssignedUserId);
        if (next != null) {
            this.lastAssignedUserId = next;
        }
        return next;
    }

    /** The rule a request sent now is shown, and carries from then on. */
    public BookingTokenTerms tokenTerms() {
        return tokenRequired
                ? BookingTokenTerms.of(tokenAmountPaise, tokenRefundable)
                : BookingTokenTerms.waived();
    }
}
