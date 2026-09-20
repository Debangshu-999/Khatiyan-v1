import { useEffect, useRef, type ComponentType } from "react";
import { Animated, Easing, ImageBackground, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { KeyRound, Lock, Mail, ShieldCheck, ShieldPlus, UserPlus, type LucideProps } from "lucide-react-native";

import { BRAND_LOGO_BACKGROUND, BrandLogo } from "@/components/brand-logo";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type AuthMode = "login" | "signup";
export type AuthStep = "entry" | "activate" | "setupOtp" | "setupPin" | "resetRequest" | "resetOtp" | "resetPin" | "emailLogin";

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
    case "activate":
      return {
        icon: ShieldPlus,
        tint: "jade",
        eyebrow: "Account setup",
        title: "Activate account",
        subtitle: "Your account was created for you. Confirm your number to set a PIN.",
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

const HERO_IMAGE = require("../../../assets/auth/hero-property.jpg");

/**
 * Opacity of the tint scrim laid over the photograph.
 *
 * <p>
 * High enough that white text and the step's colour identity both survive —
 * the band still reads blue on login, jade on setup, amber on PIN recovery —
 * while the building and sky stay legible underneath.
 */
const SCRIM_OPACITY = 0.58;

export function heroTintColor(copy: AuthHeroCopy, colors: { primary: string; jade: string; accent: string }) {
  return copy.tint === "jade" ? colors.jade : copy.tint === "accent" ? colors.accent : colors.primary;
}

/**
 * Full-bleed brand band at the very top of the auth screens: a photograph of
 * residential buildings under open sky, covered by a step-tinted scrim so the
 * band still reads blue on login, jade on account setup and amber on PIN
 * recovery. The Khatiyan logo floats on top in its own tile, and the content
 * sheet below overlaps it by {@link AUTH_SHEET_OVERLAP}.
 *
 * <p>
 * The logo replaced a step icon badge and a one-line tagline. The logo carries
 * its own tagline, so keeping the old line would have said two things at once.
 *
 * <p>
 * The photo replaced a hand-drawn SVG skyline: the illustration read as filler,
 * where a real building says what the product is about before a word is read.
 */
export function AuthHero({ copy }: { copy: AuthHeroCopy }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const tint = heroTintColor(copy, colors);

  const compact = windowHeight < 760;
  const tileSize = compact ? 124 : 148;
  const tilePadding = compact ? 6 : 8;

  // A single gentle float on the logo tile — quiet ambient motion.
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
        gap: compact ? spacing.md : spacing.lg,
        justifyContent: "center",
        // Taller than it needs to be for its content, on purpose: the band is
        // carrying a photograph now, and a shallow strip crops it to an
        // unreadable sliver. The sheet below still scrolls, so the extra height
        // costs nothing on small screens.
        minHeight: compact ? 210 : 260,
        overflow: "hidden",
        paddingBottom: (compact ? spacing.xl : spacing.xxl) + AUTH_SHEET_OVERLAP,
        paddingHorizontal: spacing.xl,
        paddingTop: insets.top + (compact ? spacing.lg : spacing.xl),
      }}
    >
      <ImageBackground
        source={HERO_IMAGE}
        resizeMode="cover"
        style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
      >
        {/* Tint scrim: keeps the step colour identity and guarantees contrast
            for the white tagline, whatever the photo is doing underneath. */}
        <View style={{ backgroundColor: tint, flex: 1, opacity: SCRIM_OPACITY }} />
        {/* Extra darkening at the floor so the sheet's rounded corners read
            against the band rather than dissolving into a bright patch. */}
        <LinearGradient
          colors={["rgba(0,0,0,0.22)", "transparent", "rgba(0,0,0,0.34)"]}
          locations={[0, 0.45, 1]}
          style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
        />
      </ImageBackground>

      <Animated.View
        style={{
          alignItems: "center",
          // The logo's own background, so the artwork has no visible edge
          // inside the tile. A tile rather than the bare image: the logo is a
          // flat picture, and laid straight onto the tinted photo its navy
          // wordmark would sink into the scrim.
          backgroundColor: isDark ? BRAND_LOGO_BACKGROUND.dark : BRAND_LOGO_BACKGROUND.light,
          borderCurve: "continuous",
          borderRadius: Math.round(tileSize * 0.18),
          elevation: 6,
          height: tileSize,
          justifyContent: "center",
          shadowColor: "#000000",
          shadowOffset: { height: 6, width: 0 },
          shadowOpacity: 0.22,
          shadowRadius: 14,
          transform: [{ translateY }],
          width: tileSize,
        }}
      >
        <BrandLogo size={tileSize - tilePadding * 2} />
      </Animated.View>
    </View>
  );
}
