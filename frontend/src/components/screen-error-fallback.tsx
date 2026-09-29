import { Pressable, Text, View } from "react-native";
import { RotateCcw, TriangleAlert } from "lucide-react-native";
import type { ErrorBoundaryProps } from "expo-router";

import { themes } from "@/theme/colors";
import { radii, spacing } from "@/theme/spacing";
import { fonts, type } from "@/theme/typography";

/**
 * Shown instead of a crash when a screen throws while rendering.
 *
 * <p>The usual cause is data shaped differently than its type claims — the
 * backend omits null fields entirely, so a field the type says is present can be
 * absent for one particular record. Those faults are data-dependent, which is
 * why they look random and rarely reproduce. Retrying re-renders the route, so a
 * transient one clears without restarting the app.
 */
/**
 * No hooks that need the app's providers (2026-09-29). This is the root
 * layout's ErrorBoundary, and Expo Router draws it OUTSIDE the root layout,
 * so the Redux store is not there. It used useTheme(), which reads the store,
 * and crashed on every screen error with "could not find react-redux context
 * value", hiding the real error behind its own.
 */
export function ScreenErrorFallback({ error, retry }: ErrorBoundaryProps) {
  const colors = themes.light;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.background,
        flex: 1,
        gap: spacing.md,
        justifyContent: "center",
        padding: spacing.lg,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderCurve: "continuous",
          borderRadius: 18,
          height: 56,
          justifyContent: "center",
          width: 56,
        }}
      >
        <TriangleAlert color={colors.ink} size={40} strokeWidth={2.2} />
      </View>

      <Text
        style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, textAlign: "center" }}
      >
        This screen ran into a problem
      </Text>

      <Text style={[type.description, { color: colors.muted, textAlign: "center" }]}>
        Nothing you did caused this and no data was lost. Try again, or go back and reopen the screen.
      </Text>

      {/* Kept visible on purpose: while the app is in development this is the
          only place the message surfaces without a terminal attached. */}
      {__DEV__ && error?.message ? (
        <Text style={[type.caption, { color: colors.danger, textAlign: "center" }]}>
          {error.message}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={{
          alignItems: "center",
          alignSelf: "stretch",
          backgroundColor: colors.primary,
          borderRadius: radii.md,
          flexDirection: "row",
          gap: spacing.xs,
          justifyContent: "center",
          minHeight: 48,
        }}
      >
        <RotateCcw color={colors.onPrimary} size={18} strokeWidth={2.2} />
        <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 15 }}>Try again</Text>
      </Pressable>
    </View>
  );
}
