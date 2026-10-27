package com.khatiyan.d_modules.mail;

import java.util.List;
import java.util.Objects;

/**
 * What one mail says, in plain words. The mail module lays it out: the logo,
 * the heading, the paragraphs, a card of details, a button into the app, and
 * a few closing points.
 *
 * @param subject   the inbox line
 * @param preheader the grey line some inboxes show after the subject
 * @param heading   the big line at the top of the mail
 * @param paragraphs what happened, a sentence or two each
 * @param details   the facts, as label and value: property, date, reference code
 * @param button    the way into the app. Null for none
 * @param points    what to do next, one line each. Empty for none
 */
public record MailContent(
        String subject,
        String preheader,
        String heading,
        List<String> paragraphs,
        List<Detail> details,
        Button button,
        List<String> points) {

    public MailContent {
        Objects.requireNonNull(subject, "subject");
        Objects.requireNonNull(heading, "heading");
        preheader = preheader == null ? "" : preheader;
        paragraphs = paragraphs == null ? List.of() : List.copyOf(paragraphs);
        details = details == null ? List.of() : List.copyOf(details);
        points = points == null ? List.of() : List.copyOf(points);
    }

    /** One line of the details card. A blank value leaves the line out. */
    public record Detail(String label, String value) {
    }

    /**
     * A button that opens a screen of the app.
     *
     * @param label the words on it
     * @param path  the app's route, with any query: "my-visits",
     *              "my-booking-detail?requestId=..."
     */
    public record Button(String label, String path) {
    }
}
