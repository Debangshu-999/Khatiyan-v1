import { Text, View } from "react-native";
import { RotateCcw, TriangleAlert } from "lucide-react-native";
import type { ErrorBoundaryProps } from "expo-router";

import { ActionButton } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Shown instead of a crash when a screen throws while rendering.
 *
 * <p>The usual cause is data shaped differently than its type claims — the
 * backend omits null fields entirely, so a field the type says is present can be
 * absent for one particular record. Those faults are data-dependent, which is
 * why they look random and rarely reproduce. Retrying re-renders the route, so a
 * transient one clears without restarting the app.
 */
export function ScreenErrorFallback({ error, retry }: ErrorBoundaryProps) {
  const { colors, fonts, type } = useTheme();

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

      <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
        Nothing you did caused this and no data was lost. Try again, or go back and reopen the screen.
      </Text>

      {/* Kept visible on purpose: while the app is in development this is the
          only place the message surfaces without a terminal attached. */}
      {__DEV__ && error?.message ? (
        <Text style={[type.caption, { color: colors.danger, textAlign: "center" }]}>
          {error.message}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", width: "100%" }}>
        <ActionButton icon={RotateCcw} label="Try again" onPress={() => void retry()} />
      </View>
    </View>
  );
}
