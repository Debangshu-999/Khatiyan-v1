import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { useAppSelector } from "@/store/hooks";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function IndexRoute() {
  const auth = useAppSelector((state) => state.auth);
  const { colors, fonts, type } = useTheme();

  if (!auth.hydrated) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.background,
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
            borderRadius: 14,
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
              fontWeight: "500",
              letterSpacing: -1,
            }}
            selectable
          >
            K
          </Text>
        </View>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          Khatiyan · खतियान
        </Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={auth.accessToken ? "/(tabs)" : "/auth"} />;
}
