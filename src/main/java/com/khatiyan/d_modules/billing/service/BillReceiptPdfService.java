package com.khatiyan.d_modules.billing.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
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

        String billDetails = detailRow("Bill Number", cycle.referenceCode(), true)
                + detailRow("Bill Cycle", billTitle(cycle), false)
                + detailRow("Bill Date", date(cycle.createdAt()), false)
                + detailRow("Due Date", date(cycle.rentDueDate()), false)
                + detailRow("Bill Status", humanize(cycle.status().name()), false)
                + detailRow("Paid On", date(paidOn), false);
        String billTo = detailRow("Name", cycle.tenantNameSnapshot(), false)
                + detailRow("Tenancy ID", cycle.tenancyReferenceCode(), true)
                + detailRow("Phone", notBlank(cycle.tenantPhone()) ? phone(cycle.tenantPhone()) : null, false)
                + (notBlank(cycle.tenantEmail()) ? detailRow("Email", cycle.tenantEmail(), false) : "")
                + detailRow("Room No", cycle.roomNumber(), false);

        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE html>
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
              <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
              <style>
                @page { size: A4; margin: 30px 34px 32px; }
                * { box-sizing: border-box; font-family: "Inter", sans-serif; color: #0c1734; }
                body { background: #ffffff; margin: 0; }

                table.letterhead { border-collapse: collapse; table-layout: fixed; width: 100%%; }
                table.letterhead td { padding: 0; vertical-align: middle; }
                td.brand { width: 92px; }
                td.who { padding-left: 12px; }
                td.motto { text-align: center; width: 126px; }
                .property-name { font-size: 27px; font-weight: 700; line-height: 1.16; margin-bottom: 5px; }
                .line { color: #4f5d78; font-size: 10.5px; line-height: 1.48; }

                .brand-mark { margin: 0 auto; text-align: center; width: 78px; }
                .roof { border-bottom: 18px solid #b68418; border-left: 30px solid transparent; border-right: 30px solid transparent; height: 0; margin: 0 auto -8px; width: 0; }
                .house { background: #0c1734; height: 38px; margin: 0 auto; padding-top: 11px; text-align: center; width: 50px; }
                .window { background: #b68418; display: inline-block; height: 9px; margin: 0 2px; width: 9px; }
                .ground { background: #0c1734; height: 2px; margin: 3px auto 0; width: 68px; }
                .brand-caption { font-size: 5.5px; font-weight: 700; letter-spacing: .9px; margin-top: 4px; white-space: nowrap; }
                .motto-line { font-size: 8px; font-weight: 700; letter-spacing: 2.8px; line-height: 1.7; }
                .motto-rule { background: #b68418; height: 2px; margin: 5px auto 0; width: 36px; }

                h1.title { font-size: 31px; font-weight: 700; margin: 42px 0 30px; text-align: center; }

                table.party-layout { border-collapse: collapse; table-layout: fixed; width: 100%%; }
                table.party-layout td.party-cell { padding: 0 8px 0 0; vertical-align: top; width: 50%%; }
                table.party-layout td.party-cell.last { padding: 0 0 0 8px; }
                .box { border: 1px solid #c9dcf2; border-radius: 7px; overflow: hidden; }
                table.detail, table.grid { border-collapse: collapse; table-layout: fixed; width: 100%%; }
                table.detail th, table.grid th, .summary-head { background: #e6f1ff; font-size: 17px; font-weight: 700; padding: 13px 15px; text-align: left; }
                table.detail td { border-top: 1px solid #c9dcf2; font-size: 11.5px; padding: 10px 12px; vertical-align: middle; }
                table.detail td.label { background: #f0f6ff; color: #4f5d78; width: 39%%; }
                table.detail td.value { border-left: 1px solid #c9dcf2; font-weight: 700; overflow-wrap: break-word; width: 61%%; }
                table.detail td.code { font-size: 10.5px; white-space: nowrap; }

                .charges { margin-top: 26px; }
                table.grid th { border-right: 1px solid #c9dcf2; font-size: 15px; }
                table.grid th:last-child { border-right: 0; width: 34%%; }
                table.grid td { border-top: 1px solid #c9dcf2; font-size: 12px; padding: 11px 15px; }
                table.grid td.amt { width: 34%%; }

                .summary { margin-top: 22px; }
                .summary-head { border-bottom: 1px solid #c9dcf2; }
                .summary table.grid td.amt { text-align: right; }
                .summary table.grid tr.total td { font-size: 18px; font-weight: 700; padding-bottom: 15px; padding-top: 15px; }
                .summary table.grid tr.total td.amt { font-size: 25px; }

                .note { color: #4f5d78; font-size: 11px; margin-top: 28px; }
                .folio { color: #a7b0c0; font-size: 9px; margin-top: 28px; text-align: right; }
              </style>
            </head>
            <body>
              <table class="letterhead">
                <tr>
                  <td class="brand">
                    <div class="brand-mark">
                      <div class="roof"></div>
                      <div class="house"><span class="window"></span><span class="window"></span></div>
                      <div class="ground"></div>
                      <div class="brand-caption">COMFORT LIVES HERE</div>
                    </div>
                  </td>
                  <td class="who">
                    <div class="property-name">%s</div>
                    %s
                  </td>
                  <td class="motto">
                    <div class="motto-line">SAFE SPACES</div>
                    <div class="motto-line">HAPPIER DAYS</div>
                    <div class="motto-rule"></div>
                  </td>
                </tr>
              </table>

              <h1 class="title">Tenancy Bill Receipt</h1>

              <table class="party-layout">
                <tr>
                  <td class="party-cell">
                    <div class="box">
                      <table class="detail">
                        <tr><th colspan="2">Bill Details</th></tr>
                        %s
                      </table>
                    </div>
                  </td>
                  <td class="party-cell last">
                    <div class="box">
                      <table class="detail">
                        <tr><th colspan="2">Bill To</th></tr>
                        %s
                      </table>
                    </div>
                  </td>
                </tr>
              </table>

              <div class="box charges">
                <table class="grid">
                  <tr><th>Charges (Incl. Taxes)</th><th>Amount</th></tr>
                  %s
                </table>
              </div>

              <div class="box summary">
                <div class="summary-head">Summary</div>
                <table class="grid">
                  %s
                  %s
                </table>
              </div>

              %s
              <div class="folio">01</div>
            </body>
            </html>
            """.formatted(
                escape(blankToDash(letterhead.propertyName())),
                contact.toString(),
                billDetails,
                billTo,
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
        String rowClass = strong ? " class=\"total\"" : "";
        return "<tr" + rowClass + "><td>" + escape(label) + "</td><td class=\"amt\">"
                + escape(amount) + "</td></tr>";
    }

    private static String detailRow(String label, String value, boolean code) {
        return "<tr><td class=\"label\">" + escape(label) + "</td><td class=\"value"
                + (code ? " code" : "") + "\">" + escape(blankToDash(value)) + "</td></tr>";
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

    private static InputStream font(String path) {
        try {
            return new ClassPathResource(path).getInputStream();
        } catch (IOException ex) {
            throw new IllegalStateException("Receipt font missing from the classpath: " + path, ex);
        }
    }
}
