import { useEffect, useRef, type ComponentType } from "react";
import { Animated, Easing, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { KeyRound, Lock, Mail, ShieldCheck, UserPlus, type LucideProps } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type AuthMode = "login" | "signup";
export type AuthStep = "entry" | "setupOtp" | "resetRequest" | "resetOtp" | "resetPin" | "emailLogin";

type HeroTint = "primary" | "jade" | "accent";

export type AuthHeroCopy = {
  icon: ComponentType<LucideProps>;
  tint: HeroTint;
  eyebrow: string;
  title: string;
  subtitle: string;
};

/** All step/mode-dependent hero content in one place, so copy edits are one-stop. */
export function authHeroCopy(step: AuthStep, mode: AuthMode, context: { resetPhone: string }): AuthHeroCopy {
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
        title: "Set your PIN",
        subtitle: "Verify the code we sent, then choose a 6-digit PIN.",
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
        subtitle: `Enter the code sent to +91 ${context.resetPhone}.`,
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

const EMBLEM_SIZE = 172;

/**
 * Hero block above the auth card: a generative emblem — tinted glow, slowly
 * rotating dashed orbit with satellite dots, a floating icon disc and two
 * decorative sparks — followed by the editorial eyebrow / title / subtitle.
 * Pure vector + animation, no image assets.
 */
export function AuthHero({ copy }: { copy: AuthHeroCopy }) {
  const { colors, fonts, isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const Icon = copy.icon;
  const tint = copy.tint === "jade" ? colors.jade : copy.tint === "accent" ? colors.accent : colors.primary;
  const tintSoft = copy.tint === "jade" ? colors.jadeSoft : copy.tint === "accent" ? colors.accentSoft : colors.primarySoft;

  // Zoomed / small displays report a short effective viewport; shrink the
  // emblem and type so the whole auth screen fits without scrolling.
  const compact = windowHeight < 760;
  const scale = compact ? 0.72 : 1;
  const emblemSize = Math.round(EMBLEM_SIZE * scale);
  const titleSize = compact ? 27 : 34;

  // One slow continuous orbit + a gentle vertical float, both on the native
  // driver — ambient motion, never demanding attention.
  const orbit = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(orbit, { duration: 26000, easing: Easing.linear, toValue: 1, useNativeDriver: true }),
    );
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { duration: 2600, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true }),
        Animated.timing(float, { duration: 2600, easing: Easing.inOut(Easing.quad), toValue: 0, useNativeDriver: true }),
      ]),
    );
    spin.start();
    bob.start();
    return () => {
      spin.stop();
      bob.stop();
    };
  }, [orbit, float]);

  const rotate = orbit.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [3, -5] });

  const half = emblemSize / 2;
  const orbitInset = Math.round(14 * scale);

  return (
    <View style={{ alignItems: "center", gap: compact ? spacing.sm : spacing.md }}>
      <View style={{ alignItems: "center", height: emblemSize, justifyContent: "center", width: emblemSize }}>
        {/* Soft tinted glow washing out from the centre. */}
        <Svg height={emblemSize} width={emblemSize} style={{ position: "absolute" }}>
          <Defs>
            <RadialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tint} stopOpacity={isDark ? 0.32 : 0.22} />
              <Stop offset="0.7" stopColor={tint} stopOpacity={isDark ? 0.1 : 0.07} />
              <Stop offset="1" stopColor={tint} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={half} cy={half} fill="url(#hero-glow)" r={half} />
        </Svg>

        {/* Rotating dashed orbit with two satellite dots. */}
        <Animated.View style={{ height: emblemSize, position: "absolute", transform: [{ rotate }], width: emblemSize }}>
          <Svg height={emblemSize} width={emblemSize}>
            <Circle
              cx={half}
              cy={half}
              fill="none"
              r={half - orbitInset}
              stroke={tint}
              strokeDasharray="3 10"
              strokeLinecap="round"
              strokeOpacity={0.55}
              strokeWidth={2}
            />
            <Circle cx={half} cy={orbitInset} fill={tint} r={4.5 * scale} />
            <Circle cx={half + (half - orbitInset) * 0.7071} cy={half + (half - orbitInset) * 0.7071} fill={colors.accent} r={3 * scale} />
          </Svg>
        </Animated.View>

        {/* Floating icon disc. */}
        <Animated.View
          style={{
            alignItems: "center",
            backgroundColor: isDark ? colors.surfaceRaised : "#FFFFFF",
            borderColor: tintSoft,
            borderCurve: "continuous",
            borderRadius: 999,
            borderWidth: 2,
            elevation: 10,
            height: Math.round(96 * scale),
            justifyContent: "center",
            shadowColor: tint,
            shadowOffset: { height: 10, width: 0 },
            shadowOpacity: isDark ? 0.45 : 0.25,
            shadowRadius: 18,
            transform: [{ translateY }],
            width: Math.round(96 * scale),
          }}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: tintSoft,
              borderRadius: 999,
              height: Math.round(72 * scale),
              justifyContent: "center",
              width: Math.round(72 * scale),
            }}
          >
            <Icon color={tint} size={Math.round(34 * scale)} strokeWidth={2.1} />
          </View>
        </Animated.View>

        {/* Editorial sparks — small four-point stars off the orbit. */}
        <Svg height={emblemSize} width={emblemSize} style={{ position: "absolute" }}>
          <Path
            d={sparkPath(emblemSize - 30 * scale, 34 * scale, 7 * scale)}
            fill={colors.accent}
            opacity={0.85}
          />
          <Path
            d={sparkPath(26 * scale, emblemSize - 40 * scale, 5 * scale)}
            fill={tint}
            opacity={0.7}
          />
        </Svg>
      </View>

      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ backgroundColor: colors.accent, height: 1, opacity: 0.5, width: 26 }} />
          <Text
            style={{
              color: colors.primary,
              fontFamily: fonts.sans,
              fontSize: 11,
              fontWeight: "900",
              letterSpacing: 1.8,
              textTransform: "uppercase",
            }}
            selectable
          >
            {copy.eyebrow}
          </Text>
          <View style={{ backgroundColor: colors.accent, height: 1, opacity: 0.5, width: 26 }} />
        </View>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={1}
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: titleSize,
            fontWeight: "800",
            letterSpacing: -0.8,
            lineHeight: titleSize + 5,
            textAlign: "center",
          }}
          selectable
        >
          {copy.title}
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontFamily: fonts.sans,
            fontSize: compact ? 13 : 14,
            fontWeight: "500",
            lineHeight: compact ? 19 : 21,
            maxWidth: 310,
            textAlign: "center",
          }}
          selectable
        >
          {copy.subtitle}
        </Text>
      </View>
    </View>
  );
}

// A four-point star (concave diamond) centred at (cx, cy).
function sparkPath(cx: number, cy: number, radius: number) {
  const inner = radius * 0.38;
  return [
    `M ${cx} ${cy - radius}`,
    `Q ${cx + inner} ${cy - inner} ${cx + radius} ${cy}`,
    `Q ${cx + inner} ${cy + inner} ${cx} ${cy + radius}`,
    `Q ${cx - inner} ${cy + inner} ${cx - radius} ${cy}`,
    `Q ${cx - inner} ${cy - inner} ${cx} ${cy - radius}`,
    "Z",
  ].join(" ");
}
