import { ModalTitle } from "@/components/modal-title";
import { Image, View } from "react-native";
import { X } from "lucide-react-native";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useTheme } from "@/theme/use-theme";

export function HelpModalHeader({ title = "How it works" }: { title?: string }) {
  const { colors, fonts } = useTheme();
  const heading = /^how\b.*\bworks?$/i.test(title.trim()) ? title : "How it works";
  return <View style={{ alignItems: "center", gap: 12, paddingBottom: 4 }}>
    <Image source={require("../../assets/images/workspace/how-it-works-lightbulb.png")} style={{ width: 64, height: 80 }} resizeMode="contain" accessible={false} />
    <ModalTitle accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, textAlign: "center" }}>{heading}</ModalTitle>
  </View>;
}

/**
 * The ×. Above a bottom sheet it floats on the scrim; `corner` puts it inside a
 * centred card's top right corner instead, on a sunken disc so it shows on the
 * white (user, 2026-10-28: centred How it works modals, app-wide).
 */
export function HelpModalClose({ corner = false, onClose }: { corner?: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  if (corner) {
    return <AnimatedPressable accessibilityLabel="Close explanation" accessibilityRole="button" hitSlop={8} onPress={onClose} style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 18, height: 36, justifyContent: "center", position: "absolute", right: 12, top: 12, width: 36, zIndex: 1 }}>
      <X color={colors.ink} size={20} />
    </AnimatedPressable>;
  }
  return <AnimatedPressable accessibilityLabel="Close explanation" accessibilityRole="button" onPress={onClose} style={{ alignSelf: "center", marginBottom: 14, backgroundColor: colors.surface, borderRadius: 23, width: 46, height: 46, alignItems: "center", justifyContent: "center" }}>
    <X color={colors.ink} size={23} />
  </AnimatedPressable>;
}
