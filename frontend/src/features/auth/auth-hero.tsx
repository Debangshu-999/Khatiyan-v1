import { useEffect, useRef, type ComponentType } from "react";
import { Animated, Easing, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Rect } from "react-native-svg";
import { KeyRound, Lock, Mail, ShieldCheck, ShieldPlus, UserPlus, type LucideProps } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type AuthMode = "login" | "signup";
export type AuthStep = "entry" | "setupOtp" | "setupPin" | "resetRequest" | "resetOtp" | "resetPin" | "emailLogin";

type HeroTint = "primary" | "jade" | "accent";

export type AuthHeroCopy = {
  icon: ComponentType<LucideProps>;
  tint: HeroTint;
  eyebrow: string;
  title: string;
  subtitle: string;
};

/** How far the content sheet overlaps up onto the band (rounded-corner reveal). */
export const AUTH_SHEET_OVERLAP = 26;

/** All step/mode-dependent hero content in one place, so copy edits are one-stop. */
export function authHeroCopy(step: AuthStep, mode: AuthMode, context: { resetPhone: string; signupPhone: string }): AuthHeroCopy {
  switch (step) {
    case "emailLogin":
      return {
        icon: Mail,
        tint: "primary",
        eyebrow: "Verified email access",
        title: "Email sign-in",
        subtitle: "We'll send a one-time code to your verified email.",
      };
    case "setupOtp":
      return {
        icon: ShieldCheck,
        tint: "jade",
        eyebrow: "Secure your account",
        title: "Verify your code",
        // Empty: the "Sent to +91 … ✎" row inside the step is the sub-line.
        subtitle: "",
      };
    case "setupPin":
      return {
        icon: ShieldPlus,
        tint: "jade",
        eyebrow: "Secure your account",
        title: "Set your PIN",
        subtitle: "Choose a 6-digit PIN to secure your account.",
      };
    case "resetRequest":
      return {
        icon: Lock,
        tint: "accent",
        eyebrow: "PIN recovery",
        title: "Reset PIN",
        subtitle: "We'll text a one-time code to reset your PIN.",
      };
    case "resetOtp":
      return {
        icon: Lock,
        tint: "accent",
        eyebrow: "PIN recovery",
        title: "Verify reset OTP",
        // Empty: the "Sent to +91 … ✎" row inside the step is the sub-line.
        subtitle: "",
      };
    case "resetPin":
      return {
        icon: Lock,
        tint: "accent",
        eyebrow: "PIN recovery",
        title: "Choose new PIN",
        subtitle: "Pick a new 6-digit PIN to secure your account.",
      };
    default:
      return mode === "login"
        ? {
            icon: KeyRound,
            tint: "primary",
            eyebrow: "PIN access",
            title: "Welcome back",
            subtitle: "Sign in to manage your stays and properties.",
          }
        : {
            icon: UserPlus,
            tint: "jade",
            eyebrow: "Start with Khatiyan",
            title: "Create account",
            subtitle: "Join Khatiyan to manage tenancies the simple way.",
          };
  }
}

const ART_W = 400;
const ART_H = 110;

export function heroTintColor(copy: AuthHeroCopy, colors: { primary: string; jade: string; accent: string }) {
  return copy.tint === "jade" ? colors.jade : copy.tint === "accent" ? colors.accent : colors.primary;
}

/**
 * Full-bleed brand band at the very top of the auth screens (Swiggy-style):
 * solid step-tinted background running edge-to-edge under the status bar, a
 * floating white icon badge, the brand tagline in white, and the skyline
 * illustration as a subtle white texture along the band floor. The content
 * sheet below overlaps it by {@link AUTH_SHEET_OVERLAP} with rounded corners.
 */
export function AuthHero({ copy }: { copy: AuthHeroCopy }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const Icon = copy.icon;
  const tint = heroTintColor(copy, colors);

  const compact = windowHeight < 760;
  const badgeSize = compact ? 56 : 64;

  // A single gentle float on the icon badge — quiet ambient motion.
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { duration: 2600, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true }),
        Animated.timing(float, { duration: 2600, easing: Easing.inOut(Easing.quad), toValue: 0, useNativeDriver: true }),
      ]),
    );
    bob.start();
    return () => bob.stop();
  }, [float]);
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [2, -3] });

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: tint,
        gap: compact ? spacing.sm : spacing.md,
        overflow: "hidden",
        paddingBottom: (compact ? spacing.lg : spacing.xl) + AUTH_SHEET_OVERLAP,
        paddingHorizontal: spacing.xl,
        paddingTop: insets.top + (compact ? spacing.md : spacing.lg),
      }}
    >
      {/* Skyline texture in translucent white, pinned to the band floor. */}
      <Svg
        height="100%"
        width="100%"
        preserveAspectRatio="xMaxYMax slice"
        style={{ position: "absolute" }}
        viewBox={`0 0 ${ART_W} ${ART_H}`}
      >
        <Circle cx={40} cy={26} fill="#FFFFFF" opacity={0.16} r={11} />
        <Circle cx={90} cy={14} fill="#FFFFFF" opacity={0.12} r={2.6} />
        <Circle cx={352} cy={18} fill="#FFFFFF" opacity={0.12} r={3} />

        <Rect fill="#FFFFFF" height={44} opacity={0.08} rx={4} width={30} x={10} y={ART_H - 44} />
        <Rect fill="#FFFFFF" height={62} opacity={0.08} rx={4} width={36} x={58} y={ART_H - 62} />
        <Rect fill="#FFFFFF" height={38} opacity={0.08} rx={4} width={28} x={128} y={ART_H - 38} />
        <Rect fill="#FFFFFF" height={52} opacity={0.12} rx={5} width={36} x={30} y={ART_H - 52} />
        <Rect fill="#FFFFFF" height={72} opacity={0.12} rx={5} width={42} x={92} y={ART_H - 72} />

        <Rect fill="#FFFFFF" height={54} opacity={0.08} rx={4} width={34} x={250} y={ART_H - 54} />
        <Rect fill="#FFFFFF" height={70} opacity={0.08} rx={4} width={40} x={306} y={ART_H - 70} />
        <Rect fill="#FFFFFF" height={46} opacity={0.08} rx={4} width={30} x={368} y={ART_H - 46} />
        <Rect fill="#FFFFFF" height={60} opacity={0.12} rx={5} width={38} x={276} y={ART_H - 60} />
        <Rect fill="#FFFFFF" height={80} opacity={0.12} rx={5} width={44} x={332} y={ART_H - 80} />

        {[0, 1].map((col) =>
          [0, 1, 2].map((row) => (
            <Rect fill="#FFFFFF" height={5} key={`wl-${col}-${row}`} opacity={0.22} rx={1.2} width={6} x={100 + col * 14} y={ART_H - 62 + row * 15} />
          )),
        )}
        {[0, 1].map((col) =>
          [0, 1, 2].map((row) => (
            <Rect fill="#FFFFFF" height={5} key={`wr-${col}-${row}`} opacity={0.22} rx={1.2} width={6} x={340 + col * 15} y={ART_H - 70 + row * 16} />
          )),
        )}
      </Svg>

      <Animated.View
        style={{
          alignItems: "center",
          backgroundColor: "#FFFFFF",
          borderCurve: "continuous",
          borderRadius: Math.round(badgeSize * 0.32),
          elevation: 6,
          height: badgeSize,
          justifyContent: "center",
          shadowColor: "#000000",
          shadowOffset: { height: 6, width: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 12,
          transform: [{ translateY }],
          width: badgeSize,
        }}
      >
        <Icon color={tint} size={Math.round(badgeSize * 0.5)} strokeWidth={2.1} />
      </Animated.View>

      <Text
        style={{
          color: "#FFFFFF",
          fontFamily: fonts.sans,
          fontSize: compact ? 15 : 16.5,
          fontWeight: "800",
          lineHeight: compact ? 21 : 23,
          maxWidth: 320,
          textAlign: "center",
        }}
        selectable
      >
        One place for your stays, rent{"\n"}and properties.
      </Text>
    </View>
  );
}
