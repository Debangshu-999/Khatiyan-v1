import { Image, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FadeInView } from "@/components/fade-in-view";
import { saveHasSeenGetStarted } from "@/config/app-settings-storage";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const WELCOME_ASSET = require("../assets/auth/welcome.png");

export default function GetStartedScreen() {
  const router = useRouter();
  const { colors, fonts, isDark } = useTheme();

  function continueToAuth() {
    void saveHasSeenGetStarted();
    router.replace("/auth");
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
      <LinearGradient
        colors={isDark ? ["#05070B", "#0A0D14", "#111827"] : ["#F8FBFF", "#EEF4FF", "#FFFFFF"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.xl }}>
          <FadeInView index={0}>
            <View style={{ alignItems: "center", gap: spacing.lg, paddingTop: spacing.xl }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.72)",
                  borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.84)",
                  borderCurve: "continuous",
                  borderRadius: 999,
                  borderWidth: 1,
                  height: 238,
                  justifyContent: "center",
                  overflow: "hidden",
                  width: 238,
                }}
              >
                <Image resizeMode="contain" source={WELCOME_ASSET} style={{ height: 214, width: 214 }} />
              </View>

              <View style={{ alignItems: "center", gap: spacing.sm }}>
                <Text
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.brand,
                    fontSize: 32,
                    fontWeight: "800",
                    letterSpacing: -0.8,
                    lineHeight: 38,
                    textAlign: "center",
                  }}
                >
                  Welcome to Khatiyan
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: fonts.sansMedium,
                    fontSize: 14.5,
                    lineHeight: 22,
                    maxWidth: 300,
                    textAlign: "center",
                  }}
                >
                  Manage your stay, property, payments, notices and support from one calm workspace.
                </Text>
              </View>
            </View>
          </FadeInView>

          <FadeInView index={1}>
            <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={continueToAuth}
                style={{
                  borderCurve: "continuous",
                  borderRadius: 18,
                  overflow: "hidden",
                }}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDeep]}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 58 }}
                >
                  <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 16, }}>Get Started</Text>
                  <ArrowRight color="#FFFFFF" size={18} strokeWidth={2.5} />
                </LinearGradient>
              </AnimatedPressable>

              <AnimatedPressable accessibilityRole="button" onPress={continueToAuth} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
                <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 13.5, }}>
                  Already have an account? <Text style={{ color: colors.primary, fontWeight: "900" }}>Sign in</Text>
                </Text>
              </AnimatedPressable>
            </View>
          </FadeInView>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}
