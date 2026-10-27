package com.khatiyan.d_modules.lead.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitBookedBy;
import com.khatiyan.d_modules.mail.MailContent;
import com.khatiyan.d_modules.mail.MailContent.Button;
import com.khatiyan.d_modules.mail.MailContent.Detail;
import com.khatiyan.d_modules.mail.MailModule;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

/**
 * The visitor's mails about their visit (user, 2026-10-18): booked, moved,
 * cancelled, and how to go on after it. Always to the visitor, whichever side
 * acted, and only to a verified email. See
 * {@code docs/superpowers/specs/2026-10-18-visit-and-booking-mails-design.md}.
 *
 * <p>Queued in the transaction that changed the visit, under a key naming the
 * change, so each is sent once.
 */
@Component
public class VisitMails {

    private static final DateTimeFormatter LONG_DAY = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ENGLISH);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);
    private static final String MY_VISITS = "my-visits";

    private final MailModule mailModule;

    public VisitMails(MailModule mailModule) {
        this.mailModule = mailModule;
    }

    /** Booked, moved or cancelled: the mail for the change a push was just sent about. */
    void tell(Visit visit, PropertyResponse property, VisitBookedBy actedAs, NotificationSubtype subtype) {
        boolean byVisitor = actedAs == VisitBookedBy.TENANT;
        switch (subtype) {
            case VISIT_SCHEDULED -> mailModule.queue(visit.getProspectUserId(), "VISIT_SCHEDULED",
                    "visit-scheduled:" + visit.getId(), scheduled(visit, property, byVisitor));
            case VISIT_RESCHEDULED -> mailModule.queue(visit.getProspectUserId(), "VISIT_RESCHEDULED",
                    "visit-moved:" + visit.getId() + ":" + visit.getMovedAt().toEpochMilli(),
                    moved(visit, property, byVisitor));
            case VISIT_CANCELLED -> mailModule.queue(visit.getProspectUserId(), "VISIT_CANCELLED",
                    "visit-cancelled:" + visit.getId(), cancelled(visit, property, byVisitor));
            default -> {
                // No mail for the other visit notices: reminders stay push only (user, 2026-10-18).
            }
        }
    }

    /**
     * How to go on after the visit, three hours after check-in.
     *
     * @return false when there is no verified email to send it to
     */
    boolean afterVisit(Visit visit, PropertyResponse property, LocalDate bookUntil) {
        return mailModule.queue(visit.getProspectUserId(), "VISIT_AFTER", "visit-after:" + visit.getId(),
                after(visit, property, bookUntil));
    }

    boolean canMail(Visit visit) {
        return mailModule.canMail(visit.getProspectUserId());
    }

    static MailContent scheduled(Visit visit, PropertyResponse property, boolean byVisitor) {
        String name = property.name();
        return new MailContent(
                "Your visit to " + name + " is booked",
                longWhen(visit.getVisitDate(), visit.getSlotStart()) + " at " + name,
                "Your visit is booked",
                List.of(byVisitor
                        ? "You booked a visit to " + name + " on " + longWhen(visit.getVisitDate(), visit.getSlotStart()) + "."
                        : name + " booked a visit for you on " + longWhen(visit.getVisitDate(), visit.getSlotStart()) + "."),
                details(visit, property, "Date and time", longWhen(visit.getVisitDate(), visit.getSlotStart())),
                new Button("View your visit", MY_VISITS),
                List.of("When you arrive, open your visitor pass in My visits and show it at the property.",
                        "Plans changed? You can move or cancel the visit in My visits."));
    }

    static MailContent moved(Visit visit, PropertyResponse property, boolean byVisitor) {
        String name = property.name();
        String now = longWhen(visit.getVisitDate(), visit.getSlotStart());
        String before = visit.getMovedFromDate() == null || visit.getMovedFromSlotStartMinute() == null
                ? null
                : longWhen(visit.getMovedFromDate(), LocalTime.of(
                        visit.getMovedFromSlotStartMinute() / 60, visit.getMovedFromSlotStartMinute() % 60));
        List<Detail> details = new ArrayList<>(details(visit, property, "New date and time", now));
        details.add(1, new Detail("Was", before));
        return new MailContent(
                "Your visit to " + name + " was moved",
                "Now " + now,
                "Your visit was moved",
                List.of(byVisitor
                        ? "You moved your visit to " + name + ". It is now on " + now + "."
                        : name + " moved your visit. It is now on " + now + "."),
                details,
                new Button("View your visit", MY_VISITS),
                List.of("If the new time does not suit you, you can move or cancel the visit in My visits."));
    }

    static MailContent cancelled(Visit visit, PropertyResponse property, boolean byVisitor) {
        String name = property.name();
        String when = longWhen(visit.getVisitDate(), visit.getSlotStart());
        List<String> paragraphs = new ArrayList<>();
        paragraphs.add(byVisitor
                ? "You cancelled your visit to " + name + " on " + when + "."
                : name + " cancelled your visit on " + when + ".");
        if (!byVisitor && visit.getCancelReason() != null && !visit.getCancelReason().isBlank()) {
            paragraphs.add("Their reason: " + visit.getCancelReason().trim());
        }
        return new MailContent(
                "Your visit to " + name + " was cancelled",
                "The visit on " + when + " will not take place",
                "Your visit was cancelled",
                paragraphs,
                details(visit, property, "Was on", when),
                new Button("Open Khatiyan", MY_VISITS),
                List.of("While your enquiry is open, you can book another visit from the property's page."));
    }

    static MailContent after(Visit visit, PropertyResponse property, LocalDate bookUntil) {
        String name = property.name();
        return new MailContent(
                "Thanks for visiting " + name,
                "You can book a stay from the app until " + LONG_DAY.format(bookUntil),
                "Liked " + name + "?",
                List.of("Thanks for visiting " + name + " today. If it felt right, you can book a stay straight from"
                        + " the app, from this visit."),
                List.of(new Detail("Property", name),
                        new Detail("Address", address(property)),
                        new Detail("Visited", LONG_DAY.format(visit.getVisitDate())),
                        new Detail("Book by", LONG_DAY.format(bookUntil)),
                        new Detail("Visit", visit.getReferenceCode())),
                new Button("Book a stay", MY_VISITS),
                List.of("Open My visits and tap Book a stay on this visit.",
                        "Pick a room and a move-in date 3 to 21 days ahead.",
                        "The property answers, and you agree the rent before anything is due.",
                        "You can book from this visit until " + LONG_DAY.format(bookUntil) + "."));
    }

    private static List<Detail> details(Visit visit, PropertyResponse property, String whenLabel, String when) {
        return List.of(
                new Detail(whenLabel, when),
                new Detail("Property", property.name()),
                new Detail("Address", address(property)),
                new Detail("Visit", visit.getReferenceCode()));
    }

    /** "12 Lake Road, Salt Lake, Kolkata". Parts the owner left empty are skipped. */
    static String address(PropertyResponse property) {
        return Stream.of(property.address(), property.area(), property.city())
                .filter(part -> part != null && !part.isBlank())
                .map(String::trim)
                .distinct()
                .collect(Collectors.joining(", "));
    }

    /** "Sunday 5 October, 4:00 pm". */
    static String longWhen(LocalDate date, LocalTime time) {
        return LONG_DAY.format(date) + ", " + TIME.format(time).toLowerCase(Locale.ENGLISH);
    }
}
