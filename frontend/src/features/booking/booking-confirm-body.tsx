import { ModalTitle } from "@/components/modal-title";
import { Text, View } from "react-native";
import { CircleCheck, Info } from "lucide-react-native";

import { bookingDateLabel } from "@/features/booking/booking-ui";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/**
 * The body of the Confirm booking sheet, laid out as the user's own image of
 * it (2026-10-11): a green tick, "Confirm booking?" and where, the three terms
 * being agreed side by side in one ruled box, and what accepting does in a
 * blue band. The image's small last line, for what accepting does not do, was
 * taken out on the user's word the same day.
 *
 * <p>Both sides' accept draws this, each with its own words. The sheet's shell
 * carries no title for it, since the heading is here, centred under the tick.
 * The two buttons, Not now and Confirm booking, belong to the sheet.
 */
export function BookingConfirmBody({ agreementMonths, moveInDate, notice, place, rentPaise }: {
  /** Null for an agreement with no fixed term. */
  agreementMonths: number | null;
  moveInDate: string;
  /** What accepting does. It says so truthfully where a token is still to be paid. */
  notice: string;
  /** The property and the room. */
  place: string;
  rentPaise: number;
}) {
  const { colors, fonts, type } = useTheme();
  const label = [type.description, { color: colors.muted }];
  const value = { color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 } as const;
  const rule = <View style={{ alignSelf: "stretch", backgroundColor: colors.border, width: 1 }} />;
  return (
    <View style={{ gap: spacing.md }}>
      {/* The sheet has no title row for this, so the tick starts just under the grabber (user, 2026-10-11). */}
      <View style={{ alignItems: "center", gap: spacing.xs, paddingTop: spacing.xs }}>
        <CircleCheck color={colors.jade} size={56} strokeWidth={1.6} />
        <ModalTitle accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, textAlign: "center" }}>Confirm booking?</ModalTitle>
        <Text style={[type.modalDescription, { color: colors.muted, textAlign: "center" }]}>{place}</Text>
      </View>
      <View style={{ borderColor: colors.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <FitText numberOfLines={1} style={label}>Monthly rent</FitText>
          <FitText numberOfLines={1} minimumFontScale={0.75} style={value}>{formatMoneyPaise(rentPaise)}</FitText>
        </View>
        {rule}
        <View style={{ flex: 1.2, gap: 4, minWidth: 0 }}>
          <FitText numberOfLines={1} style={label}>Move-in</FitText>
          <FitText numberOfLines={1} minimumFontScale={0.75} style={value}>{bookingDateLabel(moveInDate)}</FitText>
        </View>
        {rule}
        <View style={{ flex: 1.3, gap: 4, minWidth: 0 }}>
          <FitText numberOfLines={1} minimumFontScale={0.75} style={label}>{agreementMonths == null ? "Agreement" : "Definite agreement"}</FitText>
          <FitText numberOfLines={1} minimumFontScale={0.75} style={value}>{agreementMonths == null ? "Indefinite" : `${agreementMonths} month${agreementMonths === 1 ? "" : "s"}`}</FitText>
        </View>
      </View>
      {/* The notice board's own blue, with the sentence itself in blue as the image has it. A little smaller
          than a notice board: tighter padding, a smaller mark and smaller words (user, 2026-10-11). */}
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderCurve: "continuous", borderRadius: radii.card, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.sm + spacing.xs, paddingVertical: spacing.sm }}>
        <Info color={colors.primary} size={18} strokeWidth={2} />
        <Text style={{ color: colors.primaryDeep, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 }}>{notice}</Text>
      </View>
    </View>
  );
}
