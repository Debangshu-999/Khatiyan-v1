package com.khatiyan.d_modules.booking.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.khatiyan.d_modules.booking.model.BookingEndCause;
import com.khatiyan.d_modules.booking.model.BookingParty;
import com.khatiyan.d_modules.booking.model.BookingRequest;
import com.khatiyan.d_modules.booking.model.BookingTokenStatus;
import com.khatiyan.d_modules.mail.MailContent;
import com.khatiyan.d_modules.mail.MailContent.Button;
import com.khatiyan.d_modules.mail.MailContent.Detail;

/**
 * What the tenant's booking mails say (user, 2026-10-18). Words only: when
 * each is sent is {@link BookingTenantNotices}'s business.
 */
final class BookingMails {

    static final DateTimeFormatter LONG_DAY = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ENGLISH);

    private BookingMails() {
    }

    static MailContent confirmed(BookingRequest booking, String address, boolean tokenReceived) {
        String name = booking.getPropertyName();
        long token = tokenReceived ? tokenPaise(booking) : 0;
        List<Detail> details = new ArrayList<>(List.of(
                new Detail("Move-in date", day(booking.getMoveInDate())),
                new Detail("Property", name),
                new Detail("Address", address),
                new Detail("Room", booking.getRoomNumber()),
                new Detail("Monthly rent", rupees(rent(booking))),
                new Detail("Deposit", rupees(booking.getDepositPaise()))));
        if (token > 0) {
            details.add(new Detail("Token paid", rupees(token)));
        }
        details.add(new Detail("Due on the day", rupees(dueOnTheDay(booking, token))));
        if (booking.getAgreementMonths() != null) {
            details.add(new Detail("Agreement", booking.getAgreementMonths() + (booking.getAgreementMonths() == 1 ? " month" : " months")));
        }
        details.add(new Detail("Booking", booking.getReferenceCode()));

        List<String> points = new ArrayList<>();
        points.add("Keep " + rupees(dueOnTheDay(booking, token)) + " ready for " + day(booking.getMoveInDate())
                + ": the deposit and the first month's rent" + (token > 0 ? ", less your token." : "."));
        points.add("On the move-in day the property starts your stay in the app. You then sign the rental"
                + " agreement in the app within three days.");
        if (token > 0) {
            points.add("Your token comes off your first bill.");
        }
        points.add("Need more time? You can move the move-in date once, by up to " + BookingPolicy.DATE_PUSH_MAX_DAYS
                + " days, until the day before.");
        return new MailContent(
                "Your booking at " + name + " is confirmed",
                "Move-in on " + day(booking.getMoveInDate()) + ", Room " + booking.getRoomNumber(),
                "Your booking is confirmed",
                List.of(name + " confirmed your booking. Your bed in Room " + booking.getRoomNumber()
                        + " is held for you from " + day(booking.getMoveInDate()) + "."),
                details,
                viewBooking(booking),
                points);
    }

    static MailContent dateMoved(BookingRequest booking, String address) {
        String name = booking.getPropertyName();
        return new MailContent(
                "Your move-in at " + name + " is now " + day(booking.getMoveInDate()),
                "Moved from " + day(booking.getOriginalMoveInDate()),
                "Your move-in date moved",
                List.of("You moved your move-in date at " + name + " from " + day(booking.getOriginalMoveInDate())
                        + " to " + day(booking.getMoveInDate()) + ".",
                        "A date can be moved once, so this one is now fixed."),
                List.of(new Detail("New move-in date", day(booking.getMoveInDate())),
                        new Detail("Was", day(booking.getOriginalMoveInDate())),
                        new Detail("Property", name),
                        new Detail("Address", address),
                        new Detail("Room", booking.getRoomNumber()),
                        new Detail("Booking", booking.getReferenceCode())),
                viewBooking(booking),
                List.of());
    }

    static MailContent moveInTomorrow(BookingRequest booking, String address, boolean tokenReceived) {
        String name = booking.getPropertyName();
        long token = tokenReceived ? tokenPaise(booking) : 0;
        return new MailContent(
                "You move in to " + name + " tomorrow",
                day(booking.getMoveInDate()) + ", Room " + booking.getRoomNumber(),
                "You move in tomorrow",
                List.of("Your move-in day at " + name + " is tomorrow, " + day(booking.getMoveInDate()) + "."),
                List.of(new Detail("Move-in date", day(booking.getMoveInDate())),
                        new Detail("Property", name),
                        new Detail("Address", address),
                        new Detail("Room", booking.getRoomNumber()),
                        new Detail("Due on the day", rupees(dueOnTheDay(booking, token))),
                        new Detail("Booking", booking.getReferenceCode())),
                viewBooking(booking),
                List.of("Keep " + rupees(dueOnTheDay(booking, token)) + " ready: the deposit and the first month's rent"
                                + (token > 0 ? ", less your token." : "."),
                        "The property starts your stay in the app on the day. You then sign the rental agreement"
                                + " in the app within three days."));
    }

    static MailContent cancelled(BookingRequest booking, String address, BookingTokenStatus token) {
        String name = booking.getPropertyName();
        List<String> paragraphs = new ArrayList<>();
        BookingEndCause cause = booking.getEndCause();
        if (cause == BookingEndCause.BOOKED_ELSEWHERE) {
            paragraphs.add("Your booking at " + name + " was withdrawn because you confirmed a booking at another property.");
        } else if (cause == BookingEndCause.BED_NOT_READY) {
            paragraphs.add("Your booking at " + name + " ended because the bed was still not free.");
        } else if (booking.getCancelledBy() == BookingParty.TENANT) {
            paragraphs.add("You cancelled your booking at " + name + ".");
        } else {
            paragraphs.add(name + " cancelled your booking.");
            if (booking.getCancelReason() != null && !booking.getCancelReason().isBlank()) {
                paragraphs.add("Their reason: " + booking.getCancelReason().trim());
            }
        }
        if (token == BookingTokenStatus.REFUND_DUE) {
            paragraphs.add("Your token of " + rupees(tokenPaise(booking)) + " is refundable. The property refunds it to you directly.");
        } else if (token == BookingTokenStatus.KEPT && booking.getTenancyId() != null) {
            // Onboarded first: the token was the property's from then (user, 2026-10-28).
            paragraphs.add("Your token of " + rupees(tokenPaise(booking)) + " is non refundable, as you were onboarded before the agreement ended.");
        } else if (token == BookingTokenStatus.KEPT) {
            paragraphs.add("Your token of " + rupees(tokenPaise(booking)) + " is non refundable, as the property's refund rule says.");
        } else if (token == BookingTokenStatus.DECISION_PENDING) {
            paragraphs.add("The property will decide whether your token of " + rupees(tokenPaise(booking)) + " is refunded.");
        }
        return new MailContent(
                "Your booking at " + name + " was cancelled",
                "Booking " + booking.getReferenceCode(),
                "Your booking was cancelled",
                paragraphs,
                List.of(new Detail("Property", name),
                        new Detail("Address", address),
                        new Detail("Room", booking.getRoomNumber()),
                        new Detail("Move-in date was", day(booking.getMoveInDate())),
                        new Detail("Booking", booking.getReferenceCode())),
                viewBooking(booking),
                token == BookingTokenStatus.REFUND_DUE
                        ? List.of("Khatiyan does not handle refunds. Contact the property about your refund.")
                        : List.of());
    }

    static MailContent expired(BookingRequest booking, String address) {
        String name = booking.getPropertyName();
        return new MailContent(
                "Your booking request at " + name + " expired",
                "Booking " + booking.getReferenceCode(),
                "Your booking request expired",
                List.of(booking.getAgreedAt() == null
                        ? "Your booking request at " + name + " ran out before the rent was agreed."
                        : "Your booking at " + name + " ran out because the token was not marked paid in time."),
                List.of(new Detail("Property", name),
                        new Detail("Address", address),
                        new Detail("Room", booking.getRoomNumber()),
                        new Detail("Booking", booking.getReferenceCode())),
                new Button("Open Khatiyan", "my-bookings"),
                List.of("While your visit's booking window is open, you can send a new request from My visits."));
    }

    static MailContent bedNotReady(BookingRequest booking, String address) {
        String name = booking.getPropertyName();
        return new MailContent(
                "Your bed at " + name + " is not free yet",
                "Room " + booking.getRoomNumber() + ", move-in today",
                "Your bed is not free yet",
                List.of("Today is your move-in day at " + name + ", but the bed in Room " + booking.getRoomNumber()
                        + " is still occupied. The property has been asked to free it."),
                List.of(new Detail("Move-in date", day(booking.getMoveInDate())),
                        new Detail("Property", name),
                        new Detail("Address", address),
                        new Detail("Room", booking.getRoomNumber()),
                        new Detail("Booking", booking.getReferenceCode())),
                viewBooking(booking),
                List.of("Your booking stays confirmed while the property frees the bed.",
                        "If it is still not free after " + BookingPolicy.BED_NOT_READY_EXTRA_DAYS
                                + " days, you can take another bed there or cancel, from your booking in the app."));
    }

    private static Button viewBooking(BookingRequest booking) {
        return new Button("View your booking", "my-booking-detail?requestId=" + booking.getId());
    }

    private static long rent(BookingRequest booking) {
        return booking.getAgreedRentPaise() != null ? booking.getAgreedRentPaise() : booking.getCurrentRentPaise();
    }

    private static long tokenPaise(BookingRequest booking) {
        return booking.getTokenDuePaise() != null ? booking.getTokenDuePaise() : booking.getTokenAmountPaise();
    }

    /** The deposit and the first month, less a token that was paid: the same sum the booking screen shows. */
    static long dueOnTheDay(BookingRequest booking, long tokenPaid) {
        return booking.getDepositPaise() + rent(booking) - tokenPaid;
    }

    static String day(LocalDate date) {
        return date == null ? null : LONG_DAY.format(date);
    }

    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("EEE d MMM, h:mm a", Locale.ENGLISH);

    /** "Tue 21 Oct, 6:00 pm", in India's time. */
    static String dayTime(java.time.Instant at) {
        return at == null ? null : DAY_TIME.format(at.atZone(BookingPolicy.ZONE)).replace("AM", "am").replace("PM", "pm");
    }

    /** "₹21,600", grouped the Indian way: "₹1,25,000". Paise only when there are some. */
    static String rupees(long paise) {
        long rupees = Math.abs(paise) / 100;
        long rest = Math.abs(paise) % 100;
        String digits = Long.toString(rupees);
        StringBuilder grouped = new StringBuilder();
        if (digits.length() <= 3) {
            grouped.append(digits);
        } else {
            String head = digits.substring(0, digits.length() - 3);
            for (int i = 0; i < head.length(); i++) {
                if (i > 0 && (head.length() - i) % 2 == 0) {
                    grouped.append(',');
                }
                grouped.append(head.charAt(i));
            }
            grouped.append(',').append(digits.substring(digits.length() - 3));
        }
        return (paise < 0 ? "-" : "") + "₹" + grouped + (rest == 0 ? "" : "." + String.format(Locale.ROOT, "%02d", rest));
    }
}
