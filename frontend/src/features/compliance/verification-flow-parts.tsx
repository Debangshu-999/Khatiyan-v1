import { Text, View } from "react-native";
import { ShieldCheck, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { StatusIcon } from "@/components/status-icon";
import { ActionButton } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The pieces both identity checks are built from: the OTP check still running
 * for grants ordered before 2026-09-27, and the Aadhaar App check that
 * replaced it.
 */

/**
 * The card's top row. The mark leads, the way out closes. No back control at
 * any step: it would promise a previous one that no longer exists.
 */
export function CheckHeader({ label, onClose }: { label: string; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <ShieldCheck color={colors.muted} size={18} strokeWidth={2} />
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 17 }}>{label}</Text>
      <AnimatedPressable
        accessibilityLabel={`Close ${label.toLowerCase()}`}
        accessibilityRole="button"
        hitSlop={10}
        onPress={onClose}
        style={{
          alignItems: "center",
          backgroundColor: colors.neutralSoft,
          borderCurve: "continuous",
          borderRadius: 999,
          height: 32,
          justifyContent: "center",
          width: 32,
        }}
      >
        <X color={colors.ink} size={17} strokeWidth={2.4} />
      </AnimatedPressable>
    </View>
  );
}

/** One numbered point, in the shared filled-badge style. Title optional. */
export function InstructionPoint({
  body,
  number,
  title,
}: {
  body: string;
  number: number;
  title?: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.borderStrong,
          borderRadius: 999,
          height: 22,
          justifyContent: "center",
          marginTop: 1,
          width: 22,
        }}
      >
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 11 }}>{number}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        {title ? (
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>{title}</Text>
        ) : null}
        <Text style={[type.description, { color: colors.muted }]}>{body}</Text>
      </View>
    </View>
  );
}

/** A centred heading for a step that asks one question. */
export function StepTitle({ children }: { children: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, textAlign: "center" }}>
      {children}
    </Text>
  );
}

/** A centred supporting line under a step title or above a button. */
export function StepCaption({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.caption, { color: colors.muted, lineHeight: 18, textAlign: "center" }]}>{children}</Text>;
}

/**
 * How an attempt ended.
 *
 * <p>The attempts left are said plainly, because they decide whether the
 * tenant tries now or goes to get the owner to fix something first.
 */
export function CheckResult({
  attemptsLeft,
  message,
  onClose,
  onRetry,
  onVerified,
  title,
  verified,
}: {
  attemptsLeft: number;
  message: string;
  onClose: () => void;
  onRetry: () => void;
  onVerified: () => void;
  /** Overrides the default "Not verified" heading, e.g. for a session that closed. */
  title?: string;
  verified: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const canRetry = !verified && attemptsLeft > 0;
  return (
    <View style={{ alignItems: "center", gap: spacing.md, paddingTop: spacing.xs }}>
      {/* The app's one status mark: a filled disc with the glyph knocked out,
          the same shape a toast and a refusal use. */}
      <StatusIcon size={38} tone={verified ? "success" : "error"} />

      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, textAlign: "center" }}>
        {verified ? "Identity verified" : (title ?? (attemptsLeft > 0 ? "Not verified" : "No attempts left"))}
      </Text>

      <Text
        style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted,
          textAlign: "center" }}
      >
        {message}
      </Text>

      {!verified ? (
        <Text style={[type.description, { color: colors.muted, textAlign: "center" }]}>
          {attemptsLeft > 0
            ? `${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left`
            : "Ask the property owner to add more attempts."}
        </Text>
      ) : null}

      <View style={{ alignSelf: "stretch", gap: spacing.sm }}>
        {canRetry ? <ActionButton label="Try again" onPress={onRetry} /> : null}

        {/* Quiet when it sits under a retry: a second solid button would make
            the two look like equal choices when one is the point. */}
        <AnimatedPressable
          accessibilityRole="button"
          onPress={verified ? onVerified : onClose}
          style={{
            alignItems: "center",
            backgroundColor: canRetry ? "transparent" : colors.ink,
            borderColor: canRetry ? colors.borderStrong : colors.ink,
            borderCurve: "continuous",
            borderRadius: 14,
            borderWidth: 1,
            paddingVertical: spacing.md,
          }}
        >
          <Text style={{ color: canRetry ? colors.ink : colors.surface, fontFamily: fonts.sansBold, fontSize: 15 }}>
            {verified ? "Done" : canRetry ? "Not now" : "Close"}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

/**
 * The server's sentence, when it sent one.
 *
 * <p>Its refusals are written for the person reading them, where a generic
 * fallback is not something a tenant can act on.
 */
export function errorMessage(e: unknown, fallback: string) {
  const data = (e as { data?: { message?: string } } | undefined)?.data;
  return data?.message && data.message.trim().length > 0 ? data.message : fallback;
}
