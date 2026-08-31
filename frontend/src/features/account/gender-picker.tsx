import { useState } from "react";
import { Modal, Text, View } from "react-native";
import { ChevronDown, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { PickerOptionRow } from "@/components/picker-option-row";
import type { Gender } from "@/store/services/auth-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export const GENDERS: Gender[] = ["MALE", "FEMALE", "TRANSGENDER", "OTHER", "UNDECLARED"];

export const GENDER_LABELS: Record<Gender, string> = {
  FEMALE: "Female",
  MALE: "Male",
  OTHER: "Others",
  TRANSGENDER: "Transgender",
  UNDECLARED: "Undeclared",
};

/**
 * Gender, as a single-choice field that opens a centred picker.
 *
 * <p>A row of chips forced every option onto the screen at once and wrapped to
 * two lines at five of them — which put the least-chosen answers in the most
 * prominent place a form has.
 *
 * <p>Centred rather than a bottom sheet: five short options are a decision, not
 * a list to scroll, and a sheet that covers half the screen for one tap is more
 * movement than the choice is worth.
 *
 * <p>{@code UNDECLARED} is on the list rather than left to a blank. Declining is
 * an answer somebody may want to give explicitly, and a form that only lets you
 * skip cannot tell the difference between that and not having got there yet.
 */
export function GenderPicker({
  label = "Gender",
  onChange,
  value,
}: {
  label?: string;
  onChange: (value: Gender | null) => void;
  value: Gender | null;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: colors.inkSoft }]}>{label}</Text>

      {/* The clear button is a SIBLING of the field, never a child: nested, its
          press bubbles to the field underneath and reopens the picker it just
          closed — and on web it is a button inside a button. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
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
          <Text
            style={{
              color: value ? colors.ink : colors.muted,
              flex: 1,
              fontFamily: value ? fonts.sansMedium : fonts.sans,
              fontSize: 14,
            }}
          >
            {value ? GENDER_LABELS[value] : "Select"}
          </Text>
          <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
        </AnimatedPressable>

        {value ? (
          <AnimatedPressable
            accessibilityLabel="Clear gender"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onChange(null)}
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
        <Modal
          animationType="fade"
          navigationBarTranslucent
          onRequestClose={() => setOpen(false)}
          statusBarTranslucent
          transparent
          visible
        >
          {/* Tapping the scrim closes it. A centred dialog with no visible
              dismiss needs one, and a five-option choice does not deserve a
              Cancel button taking up a sixth row. */}
          <AnimatedPressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={{
              alignItems: "center",
              backgroundColor: colors.overlay,
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: spacing.xl,
            }}
          >
            {/* Its own pressable so a tap on the card does not reach the scrim
                behind it and close the picker mid-decision. */}
            <AnimatedPressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.surface,
                borderCurve: "continuous",
                borderRadius: 14,
                overflow: "hidden",
                width: "100%",
              }}
            >
              <Text
                style={{
                  color: colors.muted,
                  fontFamily: fonts.display,
                  fontSize: 19,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                }}
              >
                Select gender
              </Text>

              {/* The same row every other picker in the app uses. Its hairline
                  runs above each option INCLUDING the first, which is what
                  separates the list from the heading above it. */}
              <View style={{ paddingHorizontal: spacing.lg }}>
                {GENDERS.map((option) => (
                  <PickerOptionRow
                    key={option}
                    label={GENDER_LABELS[option]}
                    onPress={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    selected={option === value}
                  />
                ))}
              </View>
            </AnimatedPressable>
          </AnimatedPressable>
        </Modal>
      ) : null}
    </View>
  );
}
