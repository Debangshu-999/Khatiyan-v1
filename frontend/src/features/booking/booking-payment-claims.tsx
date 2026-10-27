import { Text, View } from "react-native";
import { CalendarDays, CheckCircle2, CircleX, Clock3 } from "lucide-react-native";

import { PaymentClaimsIcon } from "@/components/artwork-icon";
import { Card } from "@/components/card";
import { PaymentMethodIcon } from "@/features/billing/payment-method-toggle";
import { METHOD_LABEL, PROOF_FIELD } from "@/features/billing/payment-methods";
import { bookingDateLabel } from "@/features/booking/booking-ui";
import { TokenProofImages } from "@/features/booking/token-verify-sheet";
import { NoticeBar } from "@/features/owner/owner-ui";
import type { BookingToken } from "@/store/services/booking-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The same read-only claim record for the tenant and property, with proof kept beside its own response. */
export function BookingPaymentClaims({ token }: { token: Pick<BookingToken, "claims"> }) {
  const { colors, fonts, type } = useTheme();
  if (!token.claims.length) return null;
  return <Card style={{ gap: spacing.md, padding: spacing.md }}>
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <PaymentClaimsIcon size={27} />
      <Text style={[type.display, { color: colors.ink, flex: 1, fontSize: 19 }]}>Payment claims</Text>
    </View>
    {token.claims.map((claim) => {
      const result = claim.answer === "RECEIVED"
        ? { label: "Token received", color: colors.successText, icon: CheckCircle2 }
        : claim.answer === "NOT_RECEIVED"
          ? { label: "Not received", color: colors.danger, icon: CircleX }
          : { label: "Pending", color: colors.warningText, icon: Clock3 };
      const ResultIcon = result.icon;
      const referenceLabel = claim.method === "CASH" || claim.method === "OTHER" ? "Reference" : PROOF_FIELD[claim.method].shortLabel;
      return <View key={claim.sequence} style={{ backgroundColor: colors.neutralSoft, borderRadius: radii.card, gap: spacing.sm, padding: spacing.sm }}>
        <View style={{ alignItems: "center", columnGap: spacing.sm, flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs }}>
          <View style={{ alignItems: "center", flexBasis: 130, flexDirection: "row", flexGrow: 1, gap: spacing.xs, minWidth: 0 }}>
            <PaymentMethodIcon method={claim.method} size={20} />
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>{METHOD_LABEL[claim.method]}{claim.paidAtDesk ? " at the desk" : ""}</Text>
          </View>
          <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.pill, flexDirection: "row", gap: 5, paddingHorizontal: spacing.xs, paddingVertical: 5 }}>
            <ResultIcon color={result.color} size={14} strokeWidth={2} />
            <Text style={{ color: result.color, fontFamily: fonts.sansBold, fontSize: 11 }}>{result.label}</Text>
          </View>
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <CalendarDays color={colors.muted} size={15} strokeWidth={1.9} />
          <Text style={[type.description, { color: colors.muted, flex: 1 }]}>Submitted {bookingDateLabel(claim.claimedAt, true)}</Text>
        </View>
        {claim.reference ? <View style={{ backgroundColor: colors.surface, borderRadius: radii.sm, gap: spacing.xxs, padding: spacing.sm }}>
          <Text style={[type.description, { color: colors.muted }]}>{referenceLabel}</Text>
          <Text selectable style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{claim.reference}</Text>
        </View> : null}
        {claim.proofImageUrls?.length ? <View style={{ backgroundColor: colors.surface, borderRadius: radii.sm, gap: spacing.xs, padding: spacing.sm }}>
          <Text style={[type.description, { color: colors.muted, fontFamily: fonts.sansSemiBold }]}>Payment proof</Text>
          <TokenProofImages urls={claim.proofImageUrls} />
        </View> : null}
        {claim.answer && claim.answeredAt ? <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <ResultIcon color={result.color} size={15} strokeWidth={1.9} />
          <Text style={[type.description, { color: colors.muted, flex: 1 }]}>{claim.answer === "RECEIVED" ? "Verified" : "Checked"} {bookingDateLabel(claim.answeredAt, true)}</Text>
        </View> : null}
        {claim.answerReason ? <NoticeBar title="Verification response" message={claim.answerReason} tone="danger" /> : null}
      </View>;
    })}
  </Card>;
}
