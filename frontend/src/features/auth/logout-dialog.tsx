import { Text, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { CenterModal } from "@/components/center-modal";
import { ModalTitle } from "@/components/modal-title";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The log out ask (user, 2026-11-14), laid out like the alerts prompt: a big door
 * with an arrow stepping out of it in the middle, the title and one line under it,
 * then Cancel and Log out side by side. Back cancels; a tap outside does not.
 */
export function LogoutDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { colors, fonts, type } = useTheme();
  return (
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={onCancel} statusBarTranslucent transparent visible>
      {/* A darker dim than the app's standard, for this one (user, 2026-11-09). */}
      <View style={{ alignItems: "center", backgroundColor: "rgba(2, 6, 23, 0.72)", flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            // Squarer corners, the card's own (user, 2026-11-15; was 28).
            borderRadius: radii.card,
            gap: spacing.md,
            maxWidth: 380,
            paddingBottom: spacing.lg,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
            width: "100%",
          }}
        >
          {/* The door alone, no rings round it, and the title close under it (user, 2026-11-15). */}
          <View style={{ alignItems: "center", justifyContent: "center", marginBottom: -spacing.xs }}>
            <ExitDoor3D size={84} />
          </View>

          <View style={{ alignItems: "center", gap: 6 }}>
            <ModalTitle style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.4, textAlign: "center" }}>
              Log out?
            </ModalTitle>
            <Text style={[type.modalDescription, { color: colors.muted, textAlign: "center" }]}>
              This will end your current session. All your data is saved and will be available when you sign in again.
            </Text>
          </View>

          {/* Side by side (user, 2026-11-14): the way out on the left, the action on the right. */}
          <View style={{ alignSelf: "stretch", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onCancel}
              style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.primary, borderCurve: "continuous", borderRadius: 14, borderWidth: 1.5, flex: 1, justifyContent: "center", minHeight: 50 }}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 15.5 }}>Cancel</Text>
            </AnimatedPressable>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={{ alignItems: "center", backgroundColor: colors.danger, borderCurve: "continuous", borderRadius: 14, flex: 1, justifyContent: "center", minHeight: 50 }}
            >
              <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 15.5 }}>Log out</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </CenterModal>
  );
}

/** A wooden door ajar with a coral arrow stepping out, drawn with depth like the alerts bell. */
function ExitDoor3D({ size }: { size: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <Defs>
        <LinearGradient id="exitFrame" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#C98A5A" />
          <Stop offset="1" stopColor="#8E5A3A" />
        </LinearGradient>
        <LinearGradient id="exitDoor" x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0" stopColor="#B87447" />
          <Stop offset="1" stopColor="#E3A877" />
        </LinearGradient>
        <LinearGradient id="exitArrow" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FF9A6B" />
          <Stop offset="1" stopColor="#E0502A" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="30" cy="60" fill="rgba(0, 0, 0, 0.14)" rx="20" ry="2.6" />
      {/* The frame, and the dark room beyond the open door. */}
      <Rect fill="url(#exitFrame)" height="50" rx="3" width="34" x="10" y="8" />
      <Rect fill="#2B2340" height="44" rx="1.5" width="28" x="13" y="12" />
      <Path d="M13 12 L28 16 L28 59 L13 56 Z" fill="url(#exitDoor)" />
      <Path d="M15.5 20 L25.5 22.6 L25.5 33 L15.5 31 Z M15.5 37 L25.5 38.6 L25.5 50 L15.5 48.6 Z" fill="rgba(255, 255, 255, 0.16)" />
      <Circle cx="24.5" cy="36.5" fill="#FFD12E" r="1.6" />
      {/* The arrow, out through the doorway. */}
      <Path d="M30 30 H46 V24.5 L57 34 L46 43.5 V38 H30 Z" fill="url(#exitArrow)" />
      <Path d="M31.5 31.5 H46" stroke="rgba(255, 255, 255, 0.5)" strokeLinecap="round" strokeWidth="1.4" />
    </Svg>
  );
}
