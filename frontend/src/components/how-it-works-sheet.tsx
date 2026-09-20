import type { ReactNode } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type HowItWorksStep = {
  body: string;
  /**
   * Shown under the body, for a point that is clearer shown than described:
   * the billing status chips, drawn exactly as they appear on a bill.
   */
  extra?: ReactNode;
  title: string;
};

/**
 * A numbered explanation of how something works, behind an "i".
 *
 * <p>
 * <b>Steps, not paragraphs.</b> A rule an owner has to act on is read once and
 * remembered by its shape, so each one is a heading they can scan for and a
 * sentence or two underneath. The numbers are there because these are usually
 * ordered in time, and a reader who came in halfway needs to know where they
 * are in the sequence.
 *
 * <p>
 * Ends in a solid <b>Got it</b> rather than only a corner ×. The × is a
 * dismissal, "Got it" is an acknowledgement, and on a panel whose whole job is
 * to explain something it is the action the reader actually wants.
 *
 * <p>
 * Lifted out of the billing screen, which had the only copy, once payment
 * claims needed the same thing. Two hand-rolled versions of an explainer is how
 * the app ends up explaining itself in two different voices.
 */
export function HowItWorksSheet({
  eyebrow,
  onClose,
  steps,
  title,
}: {
  /** What is being explained, above the title. */
  eyebrow: string;
  onClose: () => void;
  steps: HowItWorksStep[];
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

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
            maxHeight: "85%",
            padding: spacing.lg,
          }}
        >
          <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>{eyebrow}</Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22 }}>
                {title}
              </Text>
            </View>
            {/* Aligned to the top of the heading block and lifted clear of it.
                Centred against a two-line title it drifted down beside the
                words rather than sitting in the corner it belongs in. */}
            <AnimatedPressable
              accessibilityLabel={`Close ${title.toLowerCase()}`}
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: colors.neutralSoft,
                borderCurve: "continuous",
                borderRadius: 999,
                height: 32,
                justifyContent: "center",
                marginTop: -spacing.xs,
                width: 32,
              }}
            >
              <X color={colors.ink} size={17} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {steps.map((step, index) => (
              <View
                key={step.title}
                style={{ backgroundColor: colors.surfaceSunken, borderRadius: radii.card, gap: 4, padding: spacing.md }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                  {/* A step deeper than the card it sits on. `neutralSoft` is
                      one point off `surfaceSunken`, so the disc was there in
                      the code and invisible on the screen. */}
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.borderStrong,
                      borderRadius: 999,
                      height: 22,
                      justifyContent: "center",
                      width: 22,
                    }}
                  >
                    <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 11 }}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>
                    {step.title}
                  </Text>
                </View>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  {step.body}
                </Text>
                {step.extra ? <View style={{ marginTop: spacing.xs }}>{step.extra}</View> : null}
              </View>
            ))}
          </ScrollView>

          {/* Every info panel ends in an acknowledgement, not just a corner ×. */}
          <AnimatedPressable
            accessibilityRole="button"
            onPress={onClose}
            style={{
              alignItems: "center",
              backgroundColor: colors.ink,
              borderCurve: "continuous",
              borderRadius: 14,
              justifyContent: "center",
              marginTop: spacing.sm,
              minHeight: 46,
            }}
          >
            <Text style={{ color: colors.surface, fontFamily: fonts.sansBold, fontSize: 15 }}>Got it</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}
