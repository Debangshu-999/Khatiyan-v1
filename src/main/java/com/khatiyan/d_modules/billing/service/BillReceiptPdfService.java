package com.khatiyan.d_modules.billing.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleLineItemResponse;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.model.BillingCycleLineItemType;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.billing.model.BillingLineSettlementAction;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;

/**
 * Renders a tenancy bill receipt to PDF.
 *
 * <p>
 * <b>Why this is on the server.</b> The document used to be an HTML string built
 * in the app and handed to {@code expo-print}, whose web implementation is a
 * bare {@code window.print()} that ignores the markup entirely — a browser
 * printed the billing screen instead of the bill, and produced no file at all.
 * Generating here means one document, byte-identical whether the owner or the
 * tenant asked for it, and an ordinary file download on every platform.
 *
 * <p>
 * <b>The markup is XHTML, not HTML.</b> The renderer parses strictly: every tag
 * closes, every attribute is quoted, and there are no bare entities. That is
 * stricter than a browser and it is the point — a receipt that silently loses a
 * row because a tag was left open is worse than one that fails loudly.
 *
 * <p>
 * Inter is embedded rather than trusting the host's fonts, because the base-14
 * PDF fonts have no rupee sign: every amount on the page would render as a
 * missing-glyph box on a document whose entire purpose is amounts. It is also
 * the app's own typeface, so the paper matches the screen.
 */
@Service
public class BillReceiptPdfService {

    /** Dates are the tenant's, so they are read in the tenant's zone. */
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);

    private final String roadCloudsUri;
    private final String monumentUri;
    private final String flagUri;

    public BillReceiptPdfService() {
        this.roadCloudsUri = dataUri("receipt/roadclouds.png");
        this.monumentUri = dataUri("receipt/monument.png");
        this.flagUri = dataUri("receipt/flag.png");
    }

    /**
     * The receipt as PDF bytes.
     *
     * @param cycle the bill, already authorised by the caller
     * @param letterhead the property's own heading — name, address and the
     *     owner's contact. Never a manager's: a receipt carrying a staff
     *     member's personal number hands every tenant the wrong person to chase.
     */
    public byte[] render(BillingCycleResponse cycle, ReceiptLetterhead letterhead) {
        String xhtml = buildXhtml(cycle, letterhead);

        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.withHtmlContent(xhtml, null);
            builder.useFont(() -> font("receipt/fonts/Inter-Regular.ttf"), "Inter", 400, PdfRendererBuilder.FontStyle.NORMAL, true);
            builder.useFont(() -> font("receipt/fonts/Inter-Bold.ttf"), "Inter", 700, PdfRendererBuilder.FontStyle.NORMAL, true);
            builder.toStream(out);
            builder.run();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new ValidationException("The receipt could not be generated. Please try again.");
        }
    }

    /** The property heading, resolved by the caller from the property and owner. */
    public record ReceiptLetterhead(
        String propertyName,
        String address,
        String ownerPhone,
        String ownerEmail
    ) {}

    private String buildXhtml(BillingCycleResponse cycle, ReceiptLetterhead letterhead) {
        // Paid On only when the bill actually IS paid. A cycle reverted from
        // PAID keeps its old paidAt, and "Unpaid" beside a paid date on a
        // document about money is a contradiction a tenant screenshots.
        Instant paidOn = cycle.status() == BillingCycleStatus.PAID ? cycle.paidAt() : null;

        // Everything itemised, so the rows and the total tell the same story.
        // The template's three fixed rows alone would leave Subtotal and Total
        // disagreeing with what is printed above them.
        List<BillingCycleLineItemResponse> extras = cycle.lineItems().stream()
                .filter(item -> item.type() == BillingCycleLineItemType.EXTRA_CHARGE)
                .filter(item -> item.settlementAction() != BillingLineSettlementAction.WAIVED)
                .toList();
        long itemised = extras.stream().mapToLong(BillingCycleLineItemResponse::amountPaise).sum();
        long unitemised = cycle.extraChargePaise() - itemised;
        long subtotal = cycle.baseAmountPaise() + cycle.extraChargePaise() + cycle.lateFeeAmountPaise();

        StringBuilder charges = new StringBuilder();
        charges.append(row("Base Rent", money(cycle.baseAmountPaise()), false));
        for (BillingCycleLineItemResponse extra : extras) {
            charges.append(row(extra.label(), money(extra.amountPaise()), false));
        }
        if (unitemised > 0) {
            charges.append(row("Extra charges", money(unitemised), false));
        }
        charges.append(row("Late Fee", money(cycle.lateFeeAmountPaise()), false));
        charges.append(row("Discount", "- " + money(cycle.discountAmountPaise()), false));

        StringBuilder contact = new StringBuilder();
        if (notBlank(letterhead.address())) {
            contact.append("<div class=\"line\">").append(escape(letterhead.address())).append("</div>");
        }
        if (notBlank(letterhead.ownerPhone())) {
            contact.append("<div class=\"line\">").append(escape(phone(letterhead.ownerPhone()))).append("</div>");
        }
        if (notBlank(letterhead.ownerEmail())) {
            contact.append("<div class=\"line\">").append(escape(letterhead.ownerEmail())).append("</div>");
        }

        // The email line is dropped entirely when there is no VERIFIED address:
        // a label with nothing after it reads as a detail we failed to print
        // rather than one we do not hold.
        String tenantEmailLine = notBlank(cycle.tenantEmail())
                ? "<li>Email: <span class=\"val\">" + escape(cycle.tenantEmail()) + "</span></li>"
                : "";

        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE html>
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
              <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
              <style>
                @page { size: A4; margin: 0; }
                * { font-family: "Inter", sans-serif; color: #1f2124; }
                body { background: #ffffff; margin: 0; }

                table.band { background: #edefee; border-collapse: collapse; table-layout: fixed; width: 100%%; }
                table.band td { padding: 0; }
                td.art { padding-left: 10px; vertical-align: bottom; width: 200px; }
                td.who { padding: 30px 12px 26px; text-align: left; }
                td.marks { padding-bottom: 14px; padding-right: 20px; text-align: right; vertical-align: bottom; width: 84px; }
                td.marks img { margin-left: 8px; }
                .band h1 { font-size: 34px; font-weight: 700; margin: 0 0 8px; }
                .band .line { color: #3d4045; font-size: 12px; line-height: 1.55; }

                .sheet { padding: 40px 46px 46px; }
                h2.title { font-size: 27px; font-weight: 700; margin: 8px 0 34px; text-align: center; }

                table.parties { border: 1px solid #c9cccf; border-collapse: collapse; table-layout: fixed; width: 100%%; }
                table.parties td { border-right: 1px solid #c9cccf; padding: 20px 22px 26px; vertical-align: top; width: 50%%; }
                table.parties td.last { border-right: 0; }
                table.parties h3 { font-size: 22px; font-weight: 700; margin: 0 0 14px; }
                ul { list-style: none; margin: 0; padding-left: 0; }
                li { font-size: 12.5px; line-height: 2.05; }
                li .val { font-weight: 700; }
                /* Reference codes must not break: half of "BIL-2026-000186" on a
                   second line reads as two different numbers. */
                li .code { font-size: 11px; font-weight: 700; white-space: nowrap; }

                table.grid { border: 1px solid #c9cccf; border-collapse: collapse; margin-top: 34px; table-layout: fixed; width: 100%%; }
                table.grid td, table.grid th { border: 1px solid #c9cccf; font-size: 13px; padding: 13px 16px; text-align: left; }
                table.grid th { color: #9aa0a6; font-size: 12.5px; font-weight: 700; }
                table.grid td.amt { width: 50%%; }
                table.grid td.strong { font-weight: 700; }

                .note { font-size: 13px; margin-top: 40px; }
                .folio { color: #b6babe; font-size: 12px; margin-top: 46px; text-align: right; }
              </style>
            </head>
            <body>
              <table class="band">
                <tr>
                  <td class="art"><img alt="" height="70" src="%s" width="200" /></td>
                  <td class="who">
                    <h1>%s</h1>
                    %s
                  </td>
                  <td class="marks">
                    <img alt="" height="26" src="%s" width="26" />
                    <img alt="" height="26" src="%s" width="26" />
                  </td>
                </tr>
              </table>

              <div class="sheet">
                <h2 class="title">Tenancy Bill Receipt</h2>

                <table class="parties">
                  <tr>
                    <td>
                      <h3>Bill Details</h3>
                      <ul>
                        <li>Bill Number: <span class="code">%s</span></li>
                        <li>Bill Cycle: <span class="val">%s</span></li>
                        <li>Bill Date: <span class="val">%s</span></li>
                        <li>Due Date: <span class="val">%s</span></li>
                        <li>Bill Status: <span class="val">%s</span></li>
                        <li>Paid On: <span class="val">%s</span></li>
                      </ul>
                    </td>
                    <td class="last">
                      <h3>Bill To</h3>
                      <ul>
                        <li>Name: <span class="val">%s</span></li>
                        <li>Tenancy ID: <span class="code">%s</span></li>
                        <li>Phone: <span class="val">%s</span></li>
                        %s
                        <li>Room No: <span class="val">%s</span></li>
                      </ul>
                    </td>
                  </tr>
                </table>

                <table class="grid">
                  <tr><th>Charges(Incl.Taxes)</th><th>Amount</th></tr>
                  %s
                </table>

                <table class="grid">
                  %s
                  %s
                </table>

                %s
                <div class="folio">01</div>
              </div>
            </body>
            </html>
            """.formatted(
                roadCloudsUri,
                escape(blankToDash(letterhead.propertyName())),
                contact.toString(),
                monumentUri,
                flagUri,
                escape(cycle.referenceCode()),
                escape(billTitle(cycle)),
                date(cycle.createdAt()),
                date(cycle.rentDueDate()),
                escape(humanize(cycle.status().name())),
                date(paidOn),
                escape(blankToDash(cycle.tenantNameSnapshot())),
                escape(nullToEmpty(cycle.tenancyReferenceCode())),
                escape(notBlank(cycle.tenantPhone()) ? phone(cycle.tenantPhone()) : ""),
                tenantEmailLine,
                escape(nullToEmpty(cycle.roomNumber())),
                charges.toString(),
                row("Subtotal", money(subtotal), false),
                row("Total Amount Due", money(cycle.totalAmountPaise()), true),
                // Nothing to ask for once it is settled. Asking for payment on a
                // receipt for money already received is the line a tenant replies to.
                paidOn == null
                    ? "<div class=\"note\">Please make the payment by the due date. Thank you for your support.</div>"
                    : "");
    }

    private static String row(String label, String amount, boolean strong) {
        String cls = strong ? " class=\"strong\"" : "";
        return "<tr><td" + cls + ">" + escape(label) + "</td><td class=\"amt" + (strong ? " strong" : "") + "\">"
                + escape(amount) + "</td></tr>";
    }

    /** Rent cycles are numbered; a one-off bill takes its first line's label. */
    private static String billTitle(BillingCycleResponse cycle) {
        if (cycle.cycleNumber() != null) {
            return "Cycle " + cycle.cycleNumber();
        }
        return cycle.lineItems().isEmpty() ? "One-off bill" : cycle.lineItems().get(0).label();
    }

    private static String money(long paise) {
        // Grouped the Indian way — 12,34,567.00, not 1,234,567.00 — because the
        // reader is Indian and the app formats it that way everywhere else.
        String whole = String.valueOf(Math.abs(paise) / 100);
        String fraction = String.format("%02d", Math.abs(paise) % 100);
        StringBuilder grouped = new StringBuilder();
        int len = whole.length();
        for (int i = 0; i < len; i++) {
            grouped.append(whole.charAt(i));
            int fromEnd = len - 1 - i;
            if (fromEnd > 0 && (fromEnd == 3 || (fromEnd > 3 && (fromEnd - 3) % 2 == 0))) {
                grouped.append(',');
            }
        }
        return (paise < 0 ? "-₹" : "₹") + grouped + "." + fraction;
    }

    private static String phone(String raw) {
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() < 10) {
            return raw.trim();
        }
        String local = digits.substring(digits.length() - 10);
        return "+91 " + local.substring(0, 5) + " " + local.substring(5);
    }

    private static String date(LocalDate value) {
        return value == null ? "" : escape(DATE.format(value));
    }

    private static String date(Instant value) {
        return value == null ? "" : escape(DATE.format(value.atZone(IST).toLocalDate()));
    }

    private static String humanize(String token) {
        String[] parts = token.toLowerCase(Locale.ENGLISH).split("_");
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) {
                continue;
            }
            if (!out.isEmpty()) {
                out.append(' ');
            }
            out.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return out.toString();
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String blankToDash(String value) {
        return notBlank(value) ? value : "—";
    }

    /**
     * XML-escaped, including apostrophes.
     *
     * <p>Stricter than HTML escaping because the renderer parses XHTML: an
     * unescaped {@code &} in a property name is a parse error, not a stray
     * ampersand — and "Ram & Sons PG" is a perfectly ordinary property name.
     */
    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }

    /** Read once at startup — the artwork never changes between receipts. */
    private static String dataUri(String path) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(in.readAllBytes());
        } catch (IOException ex) {
            throw new IllegalStateException("Receipt artwork missing from the classpath: " + path, ex);
        }
    }

    private static InputStream font(String path) {
        try {
            return new ClassPathResource(path).getInputStream();
        } catch (IOException ex) {
            throw new IllegalStateException("Receipt font missing from the classpath: " + path, ex);
        }
    }
}
