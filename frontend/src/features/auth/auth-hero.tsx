import { type ComponentType } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  ShieldPlus,
  UserPlus,
  type LucideProps,
} from "lucide-react-native";

import {
  AuthStory,
  STORY_HEIGHT,
  STORY_WIDTH,
} from "@/features/auth/auth-story";

export type AuthMode = "login" | "signup";
export type AuthStep =
  | "entry"
  | "activate"
  | "setupOtp"
  | "setupPin"
  | "resetRequest"
  | "resetOtp"
  | "resetPin"
  | "emailLogin";

type HeroTint = "primary" | "jade" | "accent";

export type AuthHeroCopy = {
  icon: ComponentType<LucideProps>;
  tint: HeroTint;
  eyebrow: string;
  title: string;
  subtitle: string;
};

/** How far the form sheet overlaps up onto the band, so its rounded top sits on the picture. */
export const AUTH_SHEET_OVERLAP = 30;

/** All step/mode-dependent hero content in one place, so copy edits are one-stop. */
export function authHeroCopy(
  step: AuthStep,
  mode: AuthMode,
  context: { resetPhone: string; signupPhone: string },
): AuthHeroCopy {
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
        subtitle: "Your account was created for you by the property team.",
      };
    case "setupOtp":
      return {
        icon: ShieldCheck,
        tint: "jade",
        eyebrow: "Secure your account",
        title: "Verify your code",
        subtitle: "Enter the 6-digit OTP sent to verify your number.",
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
        subtitle: "Enter the 6-digit OTP sent to verify your number.",
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

export function heroTintColor(
  copy: AuthHeroCopy,
  colors: { primary: string; jade: string; accent: string },
) {
  return copy.tint === "jade"
    ? colors.jade
    : copy.tint === "accent"
      ? colors.accent
      : colors.primary;
}

/** The band never grows past this width's height, so a wide web window keeps a sane band. */
const STORY_MAX_WIDTH = 480;

/**
 * Full-bleed band at the very top of the auth screens: the sign-in story (user,
 * 2026-11-14), a short stop-motion of what the app does that plays once and then
 * stays as a still with the app icon risen over the PG. It replaced a tinted
 * photograph with the logo in a tile. The band is as tall as the story's stage at
 * the screen's width, plus the status bar it runs under, and the form sheet below
 * overlaps its floor by {@link AUTH_SHEET_OVERLAP}.
 */
/** `screen` names the auth screen, so the story plays on each screen's first visit. */
export function AuthHero({
  copy: _copy,
  screen,
}: {
  copy: AuthHeroCopy;
  screen: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const height = Math.round(
    insets.top +
      (Math.min(width, STORY_MAX_WIDTH) * STORY_HEIGHT) / STORY_WIDTH,
  );

  return (
    <View
      accessibilityLabel="Khatiyan: find a stay, visit, move in, pay rent, meals, notices and concerns, all in one app"
      accessibilityRole="image"
      style={{
        backgroundColor: "#DCEAFE",
        height,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <AuthStory
        height={height}
        screen={screen}
        topInset={insets.top}
        width={width}
      />
    </View>
  );
}
