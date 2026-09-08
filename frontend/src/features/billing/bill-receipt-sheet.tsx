import { Image, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileDown, X } from "lucide-react-native";

import { formatDate, formatMoney } from "@/features/owner/bill-views";
import { ActionButton, IconButton, humanizeToken } from "@/features/owner/owner-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
import { billTitle, type BillingCycle } from "@/store/services/billing-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const LETTERHEAD_ROAD_ART = require("../../../assets/workspace/RoadClouds_200x70.png");
const LETTERHEAD_MONUMENT_ART = require("../../../assets/workspace/monument_26x26.png");
const LETTERHEAD_FLAG_ART = require("../../../assets/workspace/flag_26x26.png");

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
  const subtotal = cycle.baseAmountPaise + cycle.extraChargePaise + cycle.lateFeeAmountPaise;

  return (
    /* No frame. The document is the thing being looked at, not a card on a
       page — an outline around it made it one item in a list of one. Its
       parents give it the full sheet width, so the letterhead band runs to
       both paper edges as it does in print. */
    <View>
      {/* The letterhead band, edge to edge. */}
      <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, flexDirection: "row", gap: spacing.sm, paddingLeft: 0, paddingRight: spacing.md, paddingVertical: spacing.md }}>
        <Image accessibilityIgnoresInvertColors resizeMode="contain" source={LETTERHEAD_ROAD_ART} style={{ height: 34, width: 96 }} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>
            {property?.name ?? "Tenancy bill"}
          </Text>
          {address ? <Text style={[type.caption, { color: colors.inkSoft, fontSize: 10, lineHeight: 14 }]}>{address}</Text> : null}
          {contact.phone ? <Text style={[type.caption, { color: colors.inkSoft, fontSize: 10, lineHeight: 14 }]}>{formatIndianPhone(contact.phone)}</Text> : null}
          {contact.email ? <Text numberOfLines={1} style={[type.caption, { color: colors.inkSoft, fontSize: 10, lineHeight: 14 }]}>{contact.email}</Text> : null}
        </View>

        <View style={{ gap: 3 }}>
          <Image accessibilityIgnoresInvertColors resizeMode="contain" source={LETTERHEAD_MONUMENT_ART} style={{ height: 18, width: 18 }} />
          <Image accessibilityIgnoresInvertColors resizeMode="contain" source={LETTERHEAD_FLAG_ART} style={{ height: 18, width: 18 }} />
        </View>
      </View>

      <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, textAlign: "center" }}>
          Tenancy Bill Receipt
        </Text>

        {/* Two boxes sharing one outline, divided by a single rule. */}
        <View style={{ borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, flexDirection: "row" }}>
          <View style={{ borderRightColor: colors.borderStrong, borderRightWidth: 1, flex: 1, gap: 4, minWidth: 0, padding: spacing.sm }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15, marginBottom: 2 }}>Bill Details</Text>
            <DocLine code label="Bill Number" value={cycle.referenceCode} />
            <DocLine label="Bill Cycle" value={billTitle(cycle)} />
            <DocLine label="Bill Date" value={formatDate(cycle.createdAt)} />
            <DocLine label="Due Date" value={formatDate(cycle.rentDueDate)} />
            <DocLine label="Bill Status" value={humanizeToken(cycle.status)} />
            <DocLine label="Paid On" value={paidOn ? formatDate(paidOn) : ""} />
          </View>
          <View style={{ flex: 1, gap: 4, minWidth: 0, padding: spacing.sm }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15, marginBottom: 2 }}>Bill To</Text>
            <DocLine label="Name" value={cycle.tenantNameSnapshot} />
            <DocLine code label="Tenancy ID" value={cycle.tenancyReferenceCode ?? ""} />
            <DocLine label="Phone" value={cycle.tenantPhone ? formatIndianPhone(cycle.tenantPhone) : ""} />
            {/* The whole line goes, not just its value. The server only sends a
                VERIFIED address, so an absent one means we have nothing we can
                stand behind — and "Email:" with a blank after it reads as a
                detail we failed to print rather than one we do not hold. */}
            {cycle.tenantEmail ? <DocLine label="Email" value={cycle.tenantEmail} /> : null}
            <DocLine label="Room No" value={cycle.roomNumber ?? ""} />
          </View>
        </View>

        {/* Every charge itemised, so the rows and the total agree. */}
        <View style={{ borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, overflow: "hidden" }}>
          <DocRow head amount="Amount" label="Charges(Incl.Taxes)" />
          <DocRow amount={formatMoney(cycle.baseAmountPaise)} label="Base Rent" />
          {extras.map((item) => (
            <DocRow amount={formatMoney(item.amountPaise)} key={item.id} label={item.label} />
          ))}
          {unitemised > 0 ? <DocRow amount={formatMoney(unitemised)} label="Extra charges" /> : null}
          <DocRow amount={formatMoney(cycle.lateFeeAmountPaise)} label="Late Fee" />
          <DocRow amount={`- ${formatMoney(cycle.discountAmountPaise)}`} label="Discount" />
        </View>

        <View style={{ borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, overflow: "hidden" }}>
          <DocRow amount={formatMoney(subtotal)} label="Subtotal" />
          <DocRow amount={formatMoney(cycle.totalAmountPaise)} label="Total Amount Due" strong />
        </View>

        {/* Dropped once the bill is settled. Asking for payment on a receipt
            for money already received is the line a tenant replies to. */}
        {paidOn ? null : (
          <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
            Please make the payment by the due date. Thank you for your support.
          </Text>
        )}
      </View>
    </View>
  );
}

/** One bulleted "Label: value" inside a party box. */
function DocLine({ code, label, value }: { code?: boolean; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Text style={[type.caption, { color: colors.muted, fontSize: 11, lineHeight: 16 }]}>
      {label}:{" "}
      {value ? (
        <Text
          style={{
            color: colors.ink,
            // Reference codes shrink rather than wrap: half of
            // "BIL-2026-000186" on a second line reads as a different number.
            fontFamily: code ? fonts.mono : fonts.sansSemiBold,
            fontSize: code ? 10 : 11,
          }}
        >
          {value}
        </Text>
      ) : null}
    </Text>
  );
}

/** One ruled row of the charges or totals grid. */
function DocRow({ amount, head, label, strong }: { amount: string; head?: boolean; label: string; strong?: boolean }) {
  const { colors, fonts, type } = useTheme();
  const tone = head ? colors.muted : colors.ink;
  return (
    <View style={{ borderTopColor: colors.borderStrong, borderTopWidth: head ? 0 : 1, flexDirection: "row" }}>
      <View style={{ borderRightColor: colors.borderStrong, borderRightWidth: 1, flex: 1, padding: spacing.sm }}>
        <Text numberOfLines={2} style={[type.caption, { color: tone, fontFamily: strong || head ? fonts.sansBold : fonts.sans, fontSize: 12 }]}>
          {label}
        </Text>
      </View>
      <View style={{ flex: 1, padding: spacing.sm }}>
        <Text numberOfLines={1} style={[type.caption, { color: tone, fontFamily: strong || head ? fonts.sansBold : fonts.sans, fontSize: 12 }]}>
          {amount}
        </Text>
      </View>
    </View>
  );
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
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "88%",
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
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
                {cycle.referenceCode}
              </Text>
            </View>
            {/* Filled, like every other close in the app. A bare glyph beside
                the reference code read as punctuation after it rather than as
                something to aim at. */}
            <IconButton accessibilityLabel="Close receipt" filled icon={X} onPress={onClose} />
          </View>

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
      </View>
    </Modal>
  );
}
