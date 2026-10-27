import { Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { RoundIconButton } from "@/components/month-selector";
import { formatSlotRange } from "@/features/enquiry/visit-time";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/**
 * Today's slots one at a time, stepped left and right like the month picker
 * on Billing (user, 2026-10-19). The slot's times in the middle, and under
 * them whether it is on now or still to come and how many are coming.
 */
export function SlotStepper({
  index,
  onChange,
  ongoing,
  slots,
  visitors,
}: {
  index: number;
  onChange: (index: number) => void;
  /** The shown slot has started. */
  ongoing: boolean;
  slots: { slotEnd: string; slotStart: string }[];
  /** Coming in the shown slot. */
  visitors: number;
}) {
  const { colors, fonts, type } = useTheme();
  const slot = slots[index];
  if (!slot) return null;
  // "9:00 am - 11:00 am" (user, 2026-10-19).
  const range = formatSlotRange(slot.slotStart, slot.slotEnd).replace(" to ", " - ");
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        justifyContent: "space-between",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      <RoundIconButton disabled={index <= 0} icon={ChevronLeft} label="Previous slot" onPress={() => onChange(index - 1)} />
      <View accessibilityLabel={`${range}, slot ${index + 1} of ${slots.length}`} style={{ alignItems: "center", flex: 1, gap: 2 }}>
        {/* The times alone, no clock beside them (user, 2026-10-19). */}
        <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>{range}</FitText>
        <Text style={[type.caption, { color: colors.muted }]}>
          <Text style={{ color: ongoing ? colors.successText : colors.warningText, fontFamily: fonts.sansBold }}>{ongoing ? "Ongoing" : "Upcoming"}</Text>
          {` · ${visitors === 0 ? "No visitors" : visitors === 1 ? "1 visitor" : `${visitors} visitors`}`}
        </Text>
      </View>
      <RoundIconButton disabled={index >= slots.length - 1} icon={ChevronRight} label="Next slot" onPress={() => onChange(index + 1)} />
    </View>
  );
}
