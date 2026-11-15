import { ModalTitleRule } from "@/components/modal-title-rule";
import { SheetCloseButton } from "@/components/help-modal-header";
import { ModalTitle } from "@/components/modal-title";
import { Image, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileDown, Mail, MapPin, Phone, X, type LucideIcon } from "lucide-react-native";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";

import { formatDate } from "@/features/owner/bill-views";
import { ActionButton, IconButton, humanizeToken } from "@/features/owner/owner-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
import { billTitle, bookingTokenPaise, type BillingCycle } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

const RECEIPT_NAVY = "#0C1734";
const RECEIPT_HEADER = "#E6F1FF";
const RECEIPT_LABEL = "#F0F6FF";
const RECEIPT_BORDER = "#C9DCF2";

/**
 * The property as the letterhead needs it.
 *
 * <p>Structural rather than {@code OwnerProperty}, because both sides of the
 * app print this document and the tenant never holds an owner's property — they
 * hold {@code TenantPropertySummary}, which carries the same address fields
 * minus the area. Everything optional so either shape fits without a mapper.
 */
export type ReceiptProperty = {
  address?: string | null;
  area?: string | null;
  city?: string | null;
  name: string;
  pincode?: string | null;
  state?: string | null;
};

/**
 * The lines a receipt should show.
 *
 * <p>Reverting a line does not delete it. `clear()` sets its amount to zero and
 * stamps it WAIVED, so the row survives as an audit trail of what was charged
 * and then taken back. A receipt is a statement of what is owed rather than that
 * trail, so a waived line has nothing to say on it — and printing "₹0.00" next
 * to a discount invites the reader to work out why it is there.
 *
 * <p><b>Zero amount is not the test.</b> A line settled from the deposit is also
 * worth zero on the bill and must still appear, because the money genuinely
 * moved — it came out of the deposit instead of the payable. Only WAIVED means
 * "this was undone", and only `clear()` ever sets it.
 */
function receiptLineItems(cycle: BillingCycle) {
  return cycle.lineItems.filter((item) => item.settlementAction !== "WAIVED");
}

/** Damage records encode their reference in the charge label; keep it on a separate line. */
function receiptChargeLabel(label: string): { label: string; reference?: string } {
  // The level is optional: a damage recorded with levels off has none (2026-11-07).
  const damage = /^Damage (DMG-\d{4}-\d+): (.+?)(?: \((D[123])\))?(, split \d+)?$/.exec(label);
  return damage ? { label: `Damage: ${damage[2]}${damage[3] ? ` - ${damage[3]}` : ""}${damage[4] ?? ""}`, reference: `(${damage[1]})` } : { label };
}

/**
 * The bill, as a document.
 *
 * <p>
 * One copy, printed for both sides. It used to live inside the owner's billing
 * screen, which meant the tenant's view of the same bill was a different layout
 * built from the same numbers — two papers for one transaction, and two places
 * for a change to be made in only one of them.
 */
export function BillReceiptDocument({
  contact,
  cycle,
  property,
}: {
  contact: { email: string | null; phone: string | null };
  cycle: BillingCycle;
  property: ReceiptProperty | null;
}) {
  const { colors, fonts, type } = useTheme();

  const address = property
    ? [property.address, property.area, property.city, property.state, property.pincode].filter(Boolean).join(", ")
    : "";
  // Same rule as the PDF: a reverted bill keeps its old paidAt, and "Unpaid"
  // beside a paid date is a contradiction a tenant screenshots.
  const paidOn = cycle.status === "PAID" ? cycle.paidAt : null;
  const extras = receiptLineItems(cycle).filter((item) => item.type === "EXTRA_CHARGE");
  const itemised = extras.reduce((sum, item) => sum + item.amountPaise, 0);
  const unitemised = cycle.extraChargePaise - itemised;
  // The first bill carries the starting deposit, and the cycle has no field
  // for it — it exists only as a DEPOSIT line, folded into the total. Reading
  // extras alone printed a subtotal of ₹11,600 above a total of ₹21,600, a
  // receipt that does not add up on its face.
  const deposits = receiptLineItems(cycle).filter((item) => item.type === "DEPOSIT");
  const depositTotal = deposits.reduce((sum, item) => sum + item.amountPaise, 0);
  const subtotal = cycle.baseAmountPaise + depositTotal + cycle.extraChargePaise + cycle.lateFeeAmountPaise;
  // Money received, not a discount, so its own row under it (2026-10-28), as the PDF prints it.
  const token = bookingTokenPaise(cycle);
  const title = receiptChargeLabel(billTitle(cycle));
  const damageCount = extras.filter((item) => receiptChargeLabel(item.label).reference).length;
  const billDetails: ReceiptDetail[] = [
    { code: true, label: "Bill Number", value: cycle.referenceCode },
    { label: cycle.category === "ONE_OFF" ? "Bill name" : "Bill Cycle", value: cycle.category === "ONE_OFF" && title.reference ? "Damage bill" : title.label },
    // The day the bill was made (user, 2026-11-13).
    { label: "Generated On", value: formatDate(cycle.createdAt) },
    { label: "Due Date", value: formatDate(cycle.rentDueDate) },
    { label: "Bill Status", value: humanizeToken(cycle.status) },
    { label: "Paid On", value: paidOn ? formatDate(paidOn) : "—" },
  ];
  const billedTo: ReceiptDetail[] = [
    { label: "Name", value: cycle.tenantNameSnapshot },
    { code: true, label: "Tenancy ID", value: cycle.tenancyReferenceCode ?? "—" },
    { label: "Phone", value: cycle.tenantPhone ? formatIndianPhone(cycle.tenantPhone) : "—" },
    ...(cycle.tenantEmail ? [{ label: "Email", value: cycle.tenantEmail }] : []),
    { label: "Room No", value: cycle.roomNumber ?? "—" },
  ];

  return (
    <View style={{ backgroundColor: colors.surface, gap: spacing.lg, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.lg }}>
      {/* The property's details on the left, the logo on the right (user, 2026-10-28). */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <FitText numberOfLines={2} style={{ color: RECEIPT_NAVY, fontFamily: fonts.display, fontSize: 19, lineHeight: 24 }}>
            {property?.name ?? "Tenancy bill"}
          </FitText>
          {/* Each line under its own icon, the icons on the name's left edge (user, 2026-10-18). */}
          {address ? <ReceiptContactLine icon={MapPin} lines={3} text={address} /> : null}
          {contact.phone ? <ReceiptContactLine icon={Phone} text={formatIndianPhone(contact.phone)} /> : null}
          {contact.email ? <ReceiptContactLine icon={Mail} lines={1} text={contact.email} /> : null}
        </View>

        <ReceiptBrandMark />
      </View>

      <Text style={{ color: RECEIPT_NAVY, fontFamily: fonts.display, fontSize: 23, lineHeight: 30, textAlign: "center" }}>
          Tenancy Bill Receipt
      </Text>

      <View style={{ alignItems: "stretch", flexDirection: "column", gap: spacing.sm }}>
        <ReceiptDetailTable rows={billDetails} title="Bill Details" />
        <ReceiptDetailTable rows={billedTo} title="Bill To" />
      </View>

      <View style={{ borderColor: RECEIPT_BORDER, borderRadius: 9, borderWidth: 1, overflow: "hidden" }}>
        <DocRow head amount="Amount" label="Charges (Incl. Taxes)" />
        {cycle.category !== "ONE_OFF" ? <DocRow amount={formatReceiptMoney(cycle.baseAmountPaise)} label="Base Rent" /> : null}
        {/* Under rent, where the bill itself orders it. */}
        {deposits.map((item) => (
          <DocRow amount={formatReceiptMoney(item.amountPaise)} key={item.id} label={item.label} />
        ))}
        {extras.map((item) => (
          <DocRow amount={formatReceiptMoney(item.amountPaise)} key={item.id} {...receiptChargeLabel(item.label)} />
        ))}
        {unitemised > 0 ? <DocRow amount={formatReceiptMoney(unitemised)} label="Extra charges" /> : null}
        <DocRow amount={formatReceiptMoney(cycle.lateFeeAmountPaise)} label="Late Fee" />
        <DocRow amount={`- ${formatReceiptMoney(cycle.discountAmountPaise)}`} label="Discount" />
        {token > 0 ? <DocRow amount={`- ${formatReceiptMoney(token)}`} label="Booking token received" /> : null}
      </View>

      <View style={{ borderColor: RECEIPT_BORDER, borderRadius: 9, borderWidth: 1, overflow: "hidden" }}>
        <ReceiptTableHeader title="Summary" />
        <DocRow amount={formatReceiptMoney(subtotal)} amountRight label="Subtotal" />
        <DocRow amount={formatReceiptMoney(cycle.totalAmountPaise)} amountRight label="Total Amount Due" strong />
      </View>

      {/* Damages raised together share one bill (user, 2026-11-07), so it says so. */}
      {damageCount > 1 ? (
        <Text style={[type.description, { color: colors.muted }]}>
          {`This bill covers ${damageCount} damages raised together. Each line is one damage, with its DMG code under it.`}
        </Text>
      ) : null}
      {paidOn ? null : (
        <Text style={[type.description, { color: colors.muted }]}>
          Please make the payment by the due date. Thank you for your support.
        </Text>
      )}
    </View>
  );
}

type ReceiptDetail = { code?: boolean; label: string; value: string };

function ReceiptDetailTable({ rows, title }: { rows: ReceiptDetail[]; title: string }) {
  const { fonts } = useTheme();
  return (
    <View style={{ alignSelf: "stretch", borderColor: RECEIPT_BORDER, borderRadius: 9, borderWidth: 1, minWidth: 0, overflow: "hidden" }}>
      <ReceiptTableHeader title={title} />
      {rows.map((row) => (
        <View key={row.label} style={{ borderTopColor: RECEIPT_BORDER, borderTopWidth: 1, flexDirection: "row", minHeight: 42 }}>
          {/* Sized for the full width: the tables stack now, they used to sit two abreast (user, 2026-11-07). */}
          <View style={{ backgroundColor: RECEIPT_LABEL, justifyContent: "center", paddingHorizontal: spacing.sm, paddingVertical: 8, width: "40%" }}>
            <FitText numberOfLines={2} style={{ color: RECEIPT_NAVY, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 }}>
              {row.label}
            </FitText>
          </View>
          <View style={{ borderLeftColor: RECEIPT_BORDER, borderLeftWidth: 1, flex: 1, justifyContent: "center", minWidth: 0, paddingHorizontal: spacing.sm, paddingVertical: 8 }}>
            <FitText
              minimumFontScale={0.65}
              numberOfLines={row.label === "Email" || row.label === "Bill name" ? 2 : 1}
              style={{ color: RECEIPT_NAVY, fontFamily: row.code ? fonts.mono : fonts.sansSemiBold, fontSize: row.code ? 12 : 13, lineHeight: 18 }}
            >
              {row.value}
            </FitText>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReceiptTableHeader({ title }: { title: string }) {
  const { fonts } = useTheme();
  return (
    <View style={{ backgroundColor: RECEIPT_HEADER, justifyContent: "center", minHeight: 38, paddingHorizontal: spacing.sm, paddingVertical: 7 }}>
      <Text style={{ color: RECEIPT_NAVY, fontFamily: fonts.display, fontSize: 16, lineHeight: 21 }}>
        {title}
      </Text>
    </View>
  );
}

function DocRow({
  amount,
  amountRight,
  head,
  label,
  reference,
  strong,
}: {
  amount: string;
  amountRight?: boolean;
  head?: boolean;
  label: string;
  reference?: string;
  strong?: boolean;
}) {
  const { fonts } = useTheme();
  return (
    <View style={{ backgroundColor: head ? RECEIPT_HEADER : "#FFFFFF", borderTopColor: RECEIPT_BORDER, borderTopWidth: head ? 0 : 1, flexDirection: "row", minHeight: strong ? 58 : 44 }}>
      <View style={{ borderRightColor: RECEIPT_BORDER, borderRightWidth: head ? 1 : 0, flex: 2, justifyContent: "center", paddingHorizontal: spacing.sm, paddingVertical: 7 }}>
        <FitText numberOfLines={2} style={{ color: RECEIPT_NAVY, fontFamily: strong || head ? fonts.sansBold : fonts.sans, fontSize: strong ? 16 : head ? 14 : 13, lineHeight: strong ? 21 : 18 }}>
          {label}
        </FitText>
        {reference ? <FitText numberOfLines={1} style={{ color: RECEIPT_NAVY, fontFamily: fonts.mono, fontSize: 11, lineHeight: 15, marginTop: 2 }}>{reference}</FitText> : null}
      </View>
      <View style={{ flex: 1, justifyContent: "center", minWidth: 0, paddingHorizontal: spacing.sm, paddingVertical: 7 }}>
        <FitText
          minimumFontScale={0.65}
          numberOfLines={1}
          style={{ color: RECEIPT_NAVY, fontFamily: strong || head ? fonts.sansBold : fonts.sans, fontSize: strong ? 22 : head ? 14 : 13, lineHeight: strong ? 28 : 18, textAlign: amountRight ? "right" : "left" }}
        >
          {amount}
        </FitText>
      </View>
    </View>
  );
}

// The real logo with its tagline cropped off (2026-10-28): at this size "Your Property, Our
// Platform" came out a few pixels tall and blurred. The mark and the wordmark are the same image.
const RECEIPT_LOGO = require("../../../assets/icons/brand/logo-light-no-tagline.png");

/** The Khatiyan logo, the real image (user, 2026-10-18). A receipt is paper, so always the light one. */
function ReceiptBrandMark() {
  return <Image accessibilityLabel="Khatiyan" resizeMode="contain" source={RECEIPT_LOGO} style={{ height: 64, width: 75 }} />;
}

/** One contact line under the property name: its icon, then the text, wrapped lines kept clear of the icon. */
function ReceiptContactLine({ icon: Icon, lines, text }: { icon: LucideIcon; lines?: number; text: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 4, marginTop: 2 }}>
      <View style={{ height: 17, justifyContent: "center" }}>
        <Icon color={RECEIPT_NAVY} size={12} strokeWidth={2.2} />
      </View>
      <FitText numberOfLines={lines} style={[type.caption, { color: colors.inkSoft, flex: 1, fontSize: 12, lineHeight: 17 }]}>
        {text}
      </FitText>
    </View>
  );
}

function formatReceiptMoney(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(paise / 100);
}

/**
 * The receipt, in a bottom sheet.
 *
 * <p>
 * Not {@link SheetShell}. The shell pads its body by {@code spacing.lg} on both
 * sides, and this document runs to the paper's edges — the letterhead band is
 * the shape it is because it does. Cancelling that gutter with a negative
 * margin was tried and pushes the document wider than the ScrollView, which
 * clips: the letterhead's right-hand marks came back sliced in half.
 *
 * <p>
 * {@code onDownload} owns what happens after the tap, closing the sheet or not
 * as it sees fit. It used to close here, which meant a caller that wanted to
 * show progress on the button was showing it on a sheet already gone.
 */
export function BillReceiptSheet({
  contact,
  cycle,
  downloadLabel = "Download PDF",
  onClose,
  onDownload,
  property,
}: {
  /**
   * The contact printed on the letterhead.
   *
   * <p>The OWNER's, and only when the reader is the owner. A manager can reach
   * the billing screen too, and printing their personal number on the property's
   * receipt would hand a tenant the wrong person to chase. The tenant's own copy
   * passes nulls: their app does not hold the owner's contact details, and the
   * letterhead is honest with just the property on it.
   */
  contact: { email: string | null; phone: string | null };
  cycle: BillingCycle;
  /** So a caller can say "Preparing…" while the file is on its way. */
  downloadLabel?: string;
  onClose: () => void;
  onDownload?: () => void;
  property: ReceiptProperty | null;
}) {
  const propertyName = property?.name ?? null;
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <SheetCloseButton onClose={() => dismiss()} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "100%",
            // No side padding on the sheet itself. The receipt runs to both
            // edges, and cancelling the gutter with a negative margin instead
            // pushed the document wider than the ScrollView, which clips — the
            // letterhead's right-hand marks were sliced in half by it.
            //
            // The nav-bar inset is added rather than assumed away. Under
            // edge-to-edge the sheet's own bottom edge sits behind the gesture
            // bar, and spacing.lg alone left the download button half under it.
            paddingBottom: insets.bottom + spacing.lg,
            paddingTop: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Receipt{propertyName ? ` · ${propertyName}` : ""}
              </Text>
              <ModalTitle style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
                {cycle.referenceCode}
              </ModalTitle>
            </View>
            {/* Filled, like every other close in the app. A bare glyph beside
                the reference code read as punctuation after it rather than as
                something to aim at. */}
          </View>
          <ModalTitleRule flush inset={0} />

          {/* flexShrink, which React Native does NOT default to 1 the way the
              web does. Without it the ScrollView claims its full content height
              — a whole receipt — inside a column capped at 88% of the screen,
              and the download button below it was pushed off the bottom edge
              rather than the document being made scrollable. */}
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ flexShrink: 1 }}>
            <View style={{ gap: spacing.md }}>
              {/* The same document the PDF prints, in the same order. Looking
                  at a receipt and sending one should not show two different
                  papers — the owner is checking on screen what the tenant will
                  receive. */}
              <BillReceiptDocument contact={contact} cycle={cycle} property={property} />
            </View>
          </ScrollView>

          {onDownload ? (
            /* A ROW, even for one button. ActionButton is flex:1 so that a pair
               of them shares a row's width — in a column that same flex:1
               becomes flexBasis 0% on the vertical axis, the button contributes
               nothing to its parent's auto height, and it renders outside the
               box the sheet's bottom padding applies to. That is what put it
               under the navigation bar: the safe-area padding was there, the
               button just was not inside it. */
            <View style={{ flexDirection: "row", paddingHorizontal: spacing.lg }}>
              <ActionButton icon={FileDown} label={downloadLabel} onPress={onDownload} />
            </View>
          ) : null}
        </View>
      </View>}
    </BottomSheetModal>
  );
}
