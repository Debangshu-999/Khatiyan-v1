package com.khatiyan.d_modules.mail.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

import com.khatiyan.d_modules.mail.MailContent;

/**
 * Lays a {@link MailContent} out as a mail: an HTML part for mail apps that
 * show one, and a plain-text part for those that do not.
 *
 * <p>Built the way mail has to be built: tables, styles written on each tag,
 * no web fonts, nothing that needs a script. The logo travels inside the mail
 * ({@code cid:logo}), so no inbox has to fetch it. Every value is escaped.
 */
@Component
public class MailRenderer {

    static final String LOGO_CID = "logo";

    private static final String PAGE = "#F3F5F9";
    private static final String CARD = "#FFFFFF";
    private static final String INK = "#0F172A";
    private static final String MUTED = "#64748B";
    private static final String BORDER = "#E5E7EB";
    private static final String PRIMARY = "#3F6ED8";
    private static final String DETAILS = "#F8FAFC";
    private static final String FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

    private final String openUrl;

    public MailRenderer(@Value("${app.mail.open-url:http://localhost:8080/api/v1/open}") String openUrl) {
        this.openUrl = openUrl;
    }

    public record Rendered(String subject, String html, String text) {
    }

    public Rendered render(MailContent mail) {
        return new Rendered(mail.subject(), html(mail), text(mail));
    }

    /** The link a button opens: a page of ours that hands the route to the app. */
    String linkTo(String path) {
        return openUrl + "?to=" + URLEncoder.encode(path, StandardCharsets.UTF_8);
    }

    private String html(MailContent mail) {
        StringBuilder body = new StringBuilder();
        body.append(cell("<img src=\"cid:" + LOGO_CID + "\" width=\"72\" height=\"72\" alt=\"Khatiyan\""
                + " style=\"display:block;border:0;width:72px;height:72px\">", "padding:28px 32px 8px"));
        body.append(cell("<h1 style=\"margin:0;font-family:" + FONT + ";font-size:22px;line-height:30px;color:" + INK
                + ";font-weight:700\">" + esc(mail.heading()) + "</h1>", "padding:12px 32px 4px"));
        for (String paragraph : mail.paragraphs()) {
            body.append(cell("<p style=\"margin:0;font-family:" + FONT + ";font-size:15px;line-height:23px;color:" + INK
                    + "\">" + esc(paragraph) + "</p>", "padding:10px 32px 0"));
        }
        String details = detailsTable(mail);
        if (!details.isEmpty()) {
            body.append(cell(details, "padding:20px 32px 0"));
        }
        if (mail.button() != null) {
            body.append(cell(button(mail.button()), "padding:24px 32px 0"));
        }
        if (!mail.points().isEmpty()) {
            StringBuilder points = new StringBuilder("<p style=\"margin:0 0 6px;font-family:" + FONT
                    + ";font-size:13px;line-height:18px;color:" + MUTED + ";font-weight:700;text-transform:uppercase;"
                    + "letter-spacing:0.6px\">What happens next</p>");
            for (String point : mail.points()) {
                points.append("<p style=\"margin:0 0 6px;font-family:").append(FONT)
                        .append(";font-size:14px;line-height:21px;color:").append(INK).append("\">&#8226;&nbsp; ")
                        .append(esc(point)).append("</p>");
            }
            body.append(cell(points.toString(), "padding:24px 32px 0"));
        }
        body.append(cell("<p style=\"margin:0;font-family:" + FONT + ";font-size:12px;line-height:18px;color:" + MUTED
                + "\">You are getting this because of a visit or a booking you have on Khatiyan. This mail is sent"
                + " automatically, so replies are not read.</p>", "padding:28px 32px 28px"));

        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>" + esc(mail.subject()) + "</title></head>"
                + "<body style=\"margin:0;padding:0;background:" + PAGE + "\">"
                // The preheader: shown in the inbox list, hidden in the mail.
                + "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:" + PAGE + "\">"
                + esc(mail.preheader()) + "</div>"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\""
                + " style=\"background:" + PAGE + "\"><tr><td align=\"center\" style=\"padding:24px 12px\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\""
                + " style=\"max-width:560px;background:" + CARD + ";border:1px solid " + BORDER
                + ";border-radius:12px\">" + body + "</table>"
                + "</td></tr></table></body></html>";
    }

    private String detailsTable(MailContent mail) {
        StringBuilder rows = new StringBuilder();
        for (MailContent.Detail detail : mail.details()) {
            if (detail.value() == null || detail.value().isBlank()) {
                continue;
            }
            rows.append("<tr><td style=\"padding:8px 16px;font-family:").append(FONT)
                    .append(";font-size:13px;line-height:19px;color:").append(MUTED)
                    .append(";white-space:nowrap;vertical-align:top\">").append(esc(detail.label()))
                    .append("</td><td style=\"padding:8px 16px;font-family:").append(FONT)
                    .append(";font-size:14px;line-height:19px;color:").append(INK)
                    .append(";font-weight:600;text-align:right;vertical-align:top\">").append(esc(detail.value()))
                    .append("</td></tr>");
        }
        if (rows.isEmpty()) {
            return "";
        }
        return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\""
                + " style=\"background:" + DETAILS + ";border:1px solid " + BORDER + ";border-radius:10px;"
                + "padding:6px 0\">" + rows + "</table>";
    }

    private String button(MailContent.Button button) {
        String href = esc(linkTo(button.path()));
        return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>"
                + "<td style=\"background:" + PRIMARY + ";border-radius:10px\">"
                + "<a href=\"" + href + "\" style=\"display:inline-block;padding:13px 24px;font-family:" + FONT
                + ";font-size:15px;line-height:20px;color:#FFFFFF;font-weight:700;text-decoration:none;"
                + "border-radius:10px\">" + esc(button.label()) + "</a></td></tr></table>";
    }

    private static String cell(String content, String padding) {
        return "<tr><td style=\"" + padding + "\">" + content + "</td></tr>";
    }

    private String text(MailContent mail) {
        StringBuilder out = new StringBuilder();
        out.append(mail.heading()).append("\n\n");
        for (String paragraph : mail.paragraphs()) {
            out.append(paragraph).append("\n\n");
        }
        for (MailContent.Detail detail : mail.details()) {
            if (detail.value() != null && !detail.value().isBlank()) {
                out.append(detail.label()).append(": ").append(detail.value()).append('\n');
            }
        }
        if (!mail.details().isEmpty()) {
            out.append('\n');
        }
        if (mail.button() != null) {
            out.append(mail.button().label()).append(": ").append(linkTo(mail.button().path())).append("\n\n");
        }
        if (!mail.points().isEmpty()) {
            out.append("What happens next\n");
            for (String point : mail.points()) {
                out.append("- ").append(point).append('\n');
            }
            out.append('\n');
        }
        out.append("You are getting this because of a visit or a booking you have on Khatiyan."
                + " This mail is sent automatically, so replies are not read.\n");
        return out.toString();
    }

    private static String esc(String value) {
        return HtmlUtils.htmlEscape(value == null ? "" : value, StandardCharsets.UTF_8.name());
    }
}
