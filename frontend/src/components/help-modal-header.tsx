import { Image, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useTheme } from "@/theme/use-theme";

export function HelpModalHeader({ title = "How it works" }: { title?: string }) {
  const { colors, fonts } = useTheme();
  const heading = /^how\b.*\bworks?$/i.test(title.trim()) ? title : "How it works";
  return <View style={{ alignItems: "center", gap: 12, paddingBottom: 4 }}>
    <Image source={require("../../assets/images/workspace/how-it-works-lightbulb.png")} style={{ width: 64, height: 80 }} resizeMode="contain" accessible={false} />
    <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, textAlign: "center" }}>{heading}</Text>
  </View>;
}

export function HelpModalClose({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  return <AnimatedPressable accessibilityLabel="Close explanation" accessibilityRole="button" onPress={onClose} style={{ alignSelf: "center", marginBottom: 14, backgroundColor: colors.surface, borderRadius: 23, width: 46, height: 46, alignItems: "center", justifyContent: "center" }}>
    <X color={colors.ink} size={23} />
  </AnimatedPressable>;
}
