import { useState } from "react";
import { Platform, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarDays, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The oldest birth date the picker will offer. */
const EARLIEST = new Date(1920, 0, 1);

/**
 * Date of birth, as a picker rather than a typed string.
 *
 * <p>Typing it meant an owner had to guess the format, and "17/04/1995" against
 * an ISO field is a silent failure — the value simply never parses and the deed
 * prints no age. A picker cannot produce an unparseable date.
 *
 * <p>The value on the wire stays `YYYY-MM-DD`, which is what the API takes.
 * The field shows it the way a person reads a date.
 *
 * <p>`maximumDate` is today: a birth date in the future is not a mistake worth
 * validating for afterwards when the control can simply refuse to offer it.
 */
export function DateOfBirthField({
  disabled,
  label = "Date of birth",
  onChange,
  value,
}: {
  disabled?: boolean;
  label?: string;
  /** ISO `YYYY-MM-DD`, or empty to clear. */
  onChange: (value: string) => void;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  const parsed = value ? new Date(`${value}T00:00:00`) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: colors.inkSoft }]}>{label}</Text>

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <AnimatedPressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={{
            alignItems: "center",
            backgroundColor: disabled ? colors.surfaceSunken : colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: 10,
            borderWidth: 1,
            flex: 1,
            flexDirection: "row",
            gap: spacing.sm,
            minHeight: 46,
            paddingHorizontal: spacing.md,
          }}
        >
          <CalendarDays color={colors.muted} size={17} strokeWidth={2} />
          <Text
            style={{
              color: valid ? colors.ink : colors.muted,
              flex: 1,
              fontFamily: valid ? fonts.sansMedium : fonts.sans,
              fontSize: 14,
            }}
          >
            {valid
              ? valid.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
              : "Select"}
          </Text>
        </AnimatedPressable>

        {valid && !disabled ? (
          <AnimatedPressable
            accessibilityLabel="Clear date of birth"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onChange("")}
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 999,
              height: 32,
              justifyContent: "center",
              width: 32,
            }}
          >
            <X color={colors.inkSoft} size={15} strokeWidth={2.6} />
          </AnimatedPressable>
        ) : null}
      </View>

      {open ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={new Date()}
          minimumDate={EARLIEST}
          mode="date"
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            // Android fires once and dismisses itself; iOS keeps the spinner up
            // and reports every scroll, so it is closed by the caller's own
            // interaction rather than here.
            if (Platform.OS === "android") {
              setOpen(false);
            }
            if (event.type === "dismissed" || !selected) {
              return;
            }
            // Formatted from the LOCAL date parts, not toISOString(). The latter
            // converts to UTC first, so a date picked in IST before 5:30am comes
            // back as the previous day.
            const month = String(selected.getMonth() + 1).padStart(2, "0");
            const day = String(selected.getDate()).padStart(2, "0");
            onChange(`${selected.getFullYear()}-${month}-${day}`);
          }}
          value={valid ?? new Date(2000, 0, 1)}
        />
      ) : null}

      {/* iOS keeps the spinner mounted, so it needs a way out that is not a
          date selection — otherwise the only way to dismiss it is to pick one. */}
      {open && Platform.OS === "ios" ? (
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setOpen(false)}
          style={{ alignItems: "center", paddingVertical: spacing.xs }}
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>Done</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}
