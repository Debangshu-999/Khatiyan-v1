import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowRight, BedDouble, Bell, Building2, IndianRupee, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FadeInView } from "@/components/fade-in-view";
import { saveHasSeenGetStarted } from "@/config/app-settings-storage";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function GetStartedScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();

  function continueToAuth() {
    void saveHasSeenGetStarted();
    router.replace("/auth");
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ backgroundColor: colors.background, flex: 1 }}>
      {/* Hero canvas — floating product chips around the brand mark. */}
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <FadeInView index={0}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.ink,
              borderRadius: 32,
              elevation: 6,
              height: 110,
              justifyContent: "center",
              shadowColor: colors.shadow,
              shadowOffset: { height: 10, width: 0 },
              shadowOpacity: 1,
              shadowRadius: 24,
              width: 110,
            }}
          >
            <Text
              style={{
                color: colors.onPrimary,
                fontFamily: fonts.display,
                fontSize: 56,
                fontStyle: "italic",
                fontWeight: "500",
                letterSpacing: -2,
              }}
            >
              K
            </Text>
          </View>
        </FadeInView>

        <View style={{ height: spacing.xxl }} />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center", paddingHorizontal: spacing.xl }}>
          <FloatingChip icon={IndianRupee} index={1} label="Rent collected" tone="green" />
          <FloatingChip icon={BedDouble} index={2} label="Room A-1 occupied" tone="warm" />
          <FloatingChip icon={Bell} index={3} label="Notice published" tone="blue" />
          <FloatingChip icon={Building2} index={4} label="2 properties" tone="neutral" />
        </View>
      </View>

      {/* Bottom sheet card with the pitch + CTA. */}
      <FadeInView index={2}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 28,
            elevation: 4,
            gap: spacing.md,
            margin: spacing.lg,
            padding: spacing.xl,
            shadowColor: colors.shadow,
            shadowOffset: { height: 8, width: 0 },
            shadowOpacity: 1,
            shadowRadius: 20,
          }}
        >
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 28,
              fontWeight: "500",
              letterSpacing: -0.5,
              lineHeight: 34,
              textAlign: "center",
            }}
            selectable
          >
            Simplify property management in one app
          </Text>
          <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
            Rent collection, tenancy tracking, maintenance and notices — everything your property needs, in one place.
          </Text>

          <AnimatedPressable
            accessibilityRole="button"
            onPress={continueToAuth}
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 999,
              flexDirection: "row",
              gap: spacing.sm,
              justifyContent: "center",
              marginTop: spacing.sm,
              minHeight: 56,
              paddingHorizontal: spacing.xl,
            }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 16, fontWeight: "800" }}>
              Get Started
            </Text>
            <ArrowRight color={colors.onPrimary} size={18} strokeWidth={2.4} />
          </AnimatedPressable>

          <AnimatedPressable accessibilityRole="button" onPress={continueToAuth} style={{ alignItems: "center", paddingVertical: spacing.xs }}>
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              Already have an account? <Text style={{ color: colors.primary, fontWeight: "800" }}>Sign in</Text>
            </Text>
          </AnimatedPressable>
        </View>
      </FadeInView>
    </SafeAreaView>
  );
}

function FloatingChip({
  icon: Icon,
  index,
  label,
  tone,
}: {
  icon: ComponentType<LucideProps>;
  index: number;
  label: string;
  tone: "blue" | "green" | "neutral" | "warm";
}) {
  const { colors, type } = useTheme();
  const accent =
    tone === "blue" ? colors.primary : tone === "green" ? colors.jade : tone === "warm" ? colors.accent : colors.inkSoft;
  const background =
    tone === "blue"
      ? colors.primarySoft
      : tone === "green"
        ? colors.jadeSoft
        : tone === "warm"
          ? colors.accentSoft
          : colors.surface;
  return (
    <FadeInView index={index}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: background,
          borderRadius: 999,
          elevation: 2,
          flexDirection: "row",
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          shadowColor: colors.shadow,
          shadowOffset: { height: 4, width: 0 },
          shadowOpacity: 1,
          shadowRadius: 10,
        }}
      >
        <Icon color={accent} size={15} strokeWidth={2.3} />
        <Text style={[type.caption, { color: colors.inkSoft, fontWeight: "700" }]} selectable>
          {label}
        </Text>
      </View>
    </FadeInView>
  );
}
