import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { loadAppSettings } from "@/config/app-settings-storage";
import { useAppSelector } from "@/store/hooks";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function IndexRoute() {
  const auth = useAppSelector((state) => state.auth);
  const { colors, fonts, type } = useTheme();
  const [onboarding, setOnboarding] = useState<"loading" | "seen" | "new">("loading");

  useEffect(() => {
    let mounted = true;
    void loadAppSettings().then((settings) => {
      if (mounted) {
        setOnboarding(settings.hasSeenGetStarted ? "seen" : "new");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!auth.hydrated || onboarding === "loading") {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.authSurface,
          flex: 1,
          gap: spacing.lg,
          justifyContent: "center",
          padding: spacing.xl,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            height: 64,
            justifyContent: "center",
            width: 64,
          }}
        >
          <Text
            style={{
              color: colors.primary,
              fontFamily: fonts.display,
              fontSize: 32,
              fontStyle: "italic",
              letterSpacing: -1,
            }}
          >
            K
          </Text>
        </View>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          Khatiyan · खतियान
        </Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (auth.accessToken) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href={onboarding === "new" ? "/get-started" : "/auth"} />;
}
