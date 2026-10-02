import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { HelpModalClose, HelpModalHeader } from "@/components/help-modal-header";

import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { spacing } from "@/theme/spacing";
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
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <HelpModalClose onClose={() => dismiss()} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "76%",
            padding: spacing.lg,
          }}
        >
          <HelpModalHeader title={title} />

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 24, paddingTop: 12, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
            {steps.map((step, index) => (
              <View
                key={step.title}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}
              >
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: "#F3EDF8",
                      borderRadius: 999,
                      height: 34,
                      justifyContent: "center",
                      width: 34,
                    }}
                  >
                    <Text style={{ color: "#70458B", fontFamily: fonts.sansMedium, fontSize: 16 }}>
                      {index + 1}
                    </Text>
                  </View>
                <View style={{ flex: 1, paddingTop: 3 }}>
                <Text style={[type.modalDescription, { color: colors.ink }]}>
                  {step.body}
                </Text>
                {step.extra ? <View style={{ marginTop: spacing.xs }}>{step.extra}</View> : null}
                </View>
              </View>
            ))}
          </ScrollView>


        </View>
      </View>}
    </BottomSheetModal>
  );
}
