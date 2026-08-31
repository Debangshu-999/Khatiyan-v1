import { Text, View } from "react-native";
import { ArrowRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { StatusIcon } from "@/components/status-icon";
import type { OnboardingReadiness } from "@/store/services/compliance-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Onboarding is blocked until the property owner's profile can carry a deed.
 *
 * <p>A board rather than a modal. A modal is something you dismiss and carry on
 * past; this is a wall — there is nothing to do on the screen behind it until the
 * profile is fixed, so the screen should say so and stay saying it.
 *
 * <p>The gate is on the property's OWNER, not on whoever is looking, because the
 * owner is the party the agreement names as Landlord. So the copy names the
 * OWNER throughout and never says "you" or "your": the reader may well be a
 * manager, for whom "your profile" points at the wrong account entirely. One
 * phrasing that is true whoever is reading beats two that each fit half of them.
 *
 * <p>What differs is the action, not the words. An owner gets a button to their
 * own profile. A manager gets a message to pass on, because sending them to a
 * settings screen they cannot change would be a dead end dressed as an action.
 */
export function OnboardingGateBoard({
  onOpenProfile,
  readiness,
}: {
  onOpenProfile: () => void;
  readiness: OnboardingReadiness;
}) {
  const { colors, fonts, type } = useTheme();

  const actorIsOwner = readiness.actorIsOwner;
  const ownerName = readiness.ownerName?.trim();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 10,
        borderWidth: 1,
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xl,
      }}
    >
      <StatusIcon size={30} tone="warning" />

      <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 16, textAlign: "center" }}>
        The owner's profile is incomplete
      </Text>

      <Text style={[type.caption, { color: colors.muted, lineHeight: 20, textAlign: "center" }]}>
        The agreement names the property owner as the Landlord, so it needs the owner's full name, a
        verified email address and permanent address before a tenant can be onboarded.
      </Text>

      {actorIsOwner ? (
        <AnimatedPressable
          accessibilityRole="button"
          onPress={onOpenProfile}
          style={{
            alignItems: "center",
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 10,
            borderWidth: 1.5,
            flexDirection: "row",
            gap: spacing.xs,
            marginTop: spacing.xs,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
            Go to profile
          </Text>
          <ArrowRight color={colors.ink} size={16} strokeWidth={2.2} />
        </AnimatedPressable>
      ) : (
        /* A manager cannot edit the owner's account, so this is the whole of
           what they can do about it. Stated as the next step rather than as an
           apology for the block. */
        <View
          style={{
            alignSelf: "stretch",
            backgroundColor: colors.surfaceSunken,
            borderCurve: "continuous",
            borderRadius: 8,
            gap: 2,
            marginTop: spacing.xs,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
            Contact the owner
          </Text>
          <Text style={[type.caption, { color: colors.muted, lineHeight: 19 }]}>
            Ask {ownerName ? ownerName : "the owner"} to add these in their account settings. Onboarding
            stays blocked until they do.
          </Text>
        </View>
      )}
    </View>
  );
}
