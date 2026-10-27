package com.khatiyan.d_modules.booking.service;

import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Set;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.model.BookingMoveInAction;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingStatus;

/**
 * Pure move-in rules, not authorisation (user's rules, 2026-10-10).
 *
 * <p><b>Before the day,</b> the tenant may push the move-in date once, to a
 * later day, until the end of the day before it.
 *
 * <p><b>A person converts a booking, when the tenant arrives.</b> Nothing
 * creates a stay by itself: onboarding needs the tenant's ID checked and their
 * address taken in person. Anyone who may onboard at the property may do it,
 * not only the booking's handler. Never before the move-in date.
 *
 * <p><b>A bed that is not ready is the property's to fix.</b> It gets the
 * move-in day and three more. After that the tenant chooses: keep waiting,
 * take another bed the property offers, or leave with the token owed back.
 * <p><b>Changed 2026-10-27 (user):</b> "did not arrive" opens the day after
 * the move-in date (two days until 2026-10-28), bed free or not, and the handler decides the token there.
 * A bed still occupied on the day can be swapped by the handler at once for a
 * free one (MOVE_TO_ANOTHER_BED), so the tenant standing there can move in.
 */
public final class BookingMoveInRules {

    private BookingMoveInRules() {
    }

    /**
     * What the rules need to know about a booking on a given day.
     *
     * @param converted  a stay has already been created from the booking
     * @param bedReady   the booked bed is free for this person now. False
     *                   while whoever is leaving it has not gone
     * @param datePushed the tenant has already moved the move-in date once
     * @param bedOffered the property has offered another bed and the tenant
     *                   has not answered
     */
    public record State(BookingStatus status, boolean converted, LocalDate moveInDate, LocalDate today,
            boolean bedReady, boolean datePushed, boolean bedOffered) {

        /** The property's extra days are up and the bed is still not ready: the tenant chooses. */
        boolean choiceOpen() {
            return !bedReady && today.isAfter(moveInDate.plusDays(BookingPolicy.BED_NOT_READY_EXTRA_DAYS));
        }
    }

    /**
     * @param mayOnboard       the reader, on the property's side, may onboard
     *                         tenants there
     * @param managementMayAct the reader, on the property's side, is the owner
     *                         or the booking's handler
     */
    public static Set<BookingMoveInAction> allowedActions(State booking, BookingParty actor, boolean mayOnboard,
            boolean managementMayAct) {
        if (booking.status() != BookingStatus.CONFIRMED || booking.converted() || actor == null) {
            return Set.of();
        }
        EnumSet<BookingMoveInAction> allowed = EnumSet.noneOf(BookingMoveInAction.class);
        if (booking.today().isBefore(booking.moveInDate())) {
            if (actor == BookingParty.TENANT && !booking.datePushed()) {
                allowed.add(BookingMoveInAction.PUSH_DATE);
            }
        } else if (actor == BookingParty.MANAGEMENT) {
            if (mayOnboard && booking.bedReady()) {
                allowed.add(BookingMoveInAction.CONVERT);
            }
            if (managementMayAct && !booking.today().isBefore(
                    booking.moveInDate().plusDays(BookingPolicy.DID_NOT_ARRIVE_AFTER_DAYS))) {
                allowed.add(BookingMoveInAction.CLOSE_DID_NOT_ARRIVE);
            }
            if (managementMayAct && !booking.bedReady()) {
                allowed.add(BookingMoveInAction.MOVE_TO_ANOTHER_BED);
            }
            if (managementMayAct && booking.choiceOpen()) {
                allowed.add(BookingMoveInAction.OFFER_ANOTHER_BED);
            }
        } else if (booking.choiceOpen()) {
            allowed.add(BookingMoveInAction.LEAVE_BED_NOT_READY);
            if (booking.bedOffered()) {
                allowed.add(BookingMoveInAction.ACCEPT_ANOTHER_BED);
                allowed.add(BookingMoveInAction.DECLINE_ANOTHER_BED);
            }
        }
        return Set.copyOf(allowed);
    }

    public static void require(BookingMoveInAction action, State booking, BookingParty actor, boolean mayOnboard,
            boolean managementMayAct) {
        if (!allowedActions(booking, actor, mayOnboard, managementMayAct).contains(action)) {
            throw new ValidationException(whyNot(action, booking));
        }
    }

    /** The reason a person is given. One sentence, and the first thing that is actually in the way. */
    static String whyNot(BookingMoveInAction action, State booking) {
        if (booking.converted()) {
            return "This booking has already been converted into a stay.";
        }
        if (booking.status() == BookingStatus.AWAITING_TOKEN) {
            return "This booking is not confirmed yet. Record its token first.";
        }
        if (booking.status() != BookingStatus.CONFIRMED) {
            return "This booking is no longer open.";
        }
        LocalDate moveInDate = booking.moveInDate();
        boolean beforeTheDay = booking.today().isBefore(moveInDate);
        if (action == BookingMoveInAction.PUSH_DATE) {
            return beforeTheDay
                    ? "The move-in date has been changed once already."
                    : "The move-in date can be changed only until the day before it.";
        }
        if (beforeTheDay) {
            return "This booking is for " + moveInDate + ". Nothing can be done about moving in before that day.";
        }
        LocalDate propertysLastDay = moveInDate.plusDays(BookingPolicy.BED_NOT_READY_EXTRA_DAYS);
        return switch (action) {
            case PUSH_DATE -> throw new IllegalStateException("answered above");
            case CONVERT -> "The booked bed is not free yet. The person leaving it has not moved out.";
            case CLOSE_DID_NOT_ARRIVE -> "This can be marked as not arrived from "
                    + moveInDate.plusDays(BookingPolicy.DID_NOT_ARRIVE_AFTER_DAYS) + ".";
            case MOVE_TO_ANOTHER_BED -> "The booked bed is free. There is no need to move them.";
            case LEAVE_BED_NOT_READY -> booking.bedReady()
                    ? "Your bed is ready. To leave, cancel the booking."
                    : "The property has until " + propertysLastDay
                            + " to free the bed. After that you can leave with your token owed back.";
            case OFFER_ANOTHER_BED -> booking.bedReady()
                    ? "The booked bed is ready. There is no need to offer another."
                    : "Another bed can be offered after " + propertysLastDay + ", if the booked bed is still not free.";
            case ACCEPT_ANOTHER_BED, DECLINE_ANOTHER_BED -> booking.choiceOpen()
                    ? "The property has not offered another bed."
                    : booking.bedReady() ? "Your bed is ready." : "The property has until " + propertysLastDay
                            + " to free the bed you booked.";
        };
    }

    // ---- The forms that take the facts one by one ------------------------------
    // For the steps that do not turn on a date push or an offered bed: converting,
    // closing a no-show, and leaving.

    public static Set<BookingMoveInAction> allowedActions(BookingStatus status, boolean converted,
            LocalDate moveInDate, LocalDate today, boolean bedReady, BookingParty actor, boolean mayOnboard,
            boolean managementMayAct) {
        return allowedActions(new State(status, converted, moveInDate, today, bedReady, true, false), actor,
                mayOnboard, managementMayAct);
    }

    public static void require(BookingMoveInAction action, BookingStatus status, boolean converted,
            LocalDate moveInDate, LocalDate today, boolean bedReady, BookingParty actor, boolean mayOnboard,
            boolean managementMayAct) {
        require(action, new State(status, converted, moveInDate, today, bedReady, true, false), actor, mayOnboard,
                managementMayAct);
    }

    static String whyNot(BookingMoveInAction action, BookingStatus status, boolean converted, LocalDate moveInDate,
            LocalDate today, boolean bedReady) {
        return whyNot(action, new State(status, converted, moveInDate, today, bedReady, true, false));
    }
}
