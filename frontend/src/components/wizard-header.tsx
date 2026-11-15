import { Text, View } from "react-native";
import { ArrowLeft, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { StepProgress } from "@/components/step-progress";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The top of a multi-step form: where you are, and the two ways out.
 *
 * <p>Shared by tenant onboarding and property registration, which are the same
 * shape — a long form cut into steps that has to say how far along it is. It
 * was written once inside onboarding; a second copy would have drifted on the
 * first change to either.
 *
 * <p><b>Back and close are different things.</b> Back steps within the form;
 * close leaves it. They used to be the same call, which made one of the two a
 * trap. They look alike — the same small grey disc — because they sit either
 * side of the title and read as a pair; what separates them is what they do.
 */
export function WizardHeader({
  accentWord,
  onBack,
  onClose,
  step,
  title,
  tone = "soft",
  totalSteps,
}: {
  /** Rendered in blue after the title. Blue as TEXT is fine; as a fill it is not. */
  accentWord?: string;
  /** Absent on the first step, where there is nothing to go back to. */
  onBack?: () => void;
  onClose: () => void;
  /** Zero-based. Null hides the bar — for a result screen, which is not a step. */
  step: number | null;
  title: string;
  /** "deep": white type on PinnedWizardHeader's deep blue panel (user, 2026-11-08). */
  tone?: "deep" | "soft";
  totalSteps: number;
}) {
  const { colors, fonts, type } = useTheme();
  const deep = tone === "deep";

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        {/* Both slots keep their width even when empty, so the title stays
            centred on the first and last steps instead of drifting left. */}
        <View style={{ width: 40 }}>
          {onBack ? <DiscButton deep={deep} icon={ArrowLeft} label="Back" onPress={onBack} /> : null}
        </View>

        <Text
          numberOfLines={1}
          style={{ color: deep ? "#FFFFFF" : colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 19, textAlign: "center" }}
        >
          {title}
          {accentWord ? <Text style={{ color: deep ? "#BFD3FF" : colors.primary }}> {accentWord}</Text> : null}
        </Text>

        <View style={{ alignItems: "flex-end", width: 40 }}>
          <DiscButton deep={deep} icon={X} label="Close" onPress={onClose} />
        </View>
      </View>

      {step === null ? null : <StepProgress step={step} tone={tone} totalSteps={totalSteps} />}
    </View>
  );
}

function DiscButton({
  deep,
  icon: Icon,
  label,
  onPress,
}: {
  deep?: boolean;
  icon: typeof ArrowLeft;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: deep ? "rgba(255,255,255,0.18)" : colors.surfaceSunken,
        borderRadius: 999,
        height: 28,
        justifyContent: "center",
        width: 28,
      }}
    >
      <Icon color={deep ? "#FFFFFF" : colors.inkSoft} size={15} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}
