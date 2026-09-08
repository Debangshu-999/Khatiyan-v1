import { ActivityIndicator, Text, View } from "react-native";
import { ArrowRight, CalendarDays } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { type BillingCycle } from "@/store/services/billing-api";
import {
  useListMyPaymentIntentsQuery,
  type PaymentIntent,
  type PaymentIntentStatus,
} from "@/store/services/payment-intent-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Every payment attempt made on one bill, and the way to finish an open one.
 *
 * <p>
 * Per bill, not per stay. "Did my payment go through" is always asked about a
 * particular bill, and attempts on the others are noise — so this is keyed by
 * the cycle and fetched when the sheet opens rather than carried around by the
 * list behind it.
 *
 * <p>
 * <b>Nothing is filtered out.</b> A cancelled or rejected attempt is precisely
 * what explains a bill that still reads as unpaid, so the failures stay on the
 * record next to the successes.
 */
export function BillPaymentIntentsSheet({
  cycle,
  onClose,
  onResolve,
}: {
  cycle: BillingCycle;
  onClose: () => void;
  /** Hands an unanswered attempt back to the screen, which owns the decision modal. */
  onResolve: (intent: PaymentIntent) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const attemptsQuery = useListMyPaymentIntentsQuery(cycle.id);
  const attempts = attemptsQuery.data ?? [];

  return (
    <SheetShell dismissOnDrag onClose={onClose} title="Payment attempts">
      {/* The code alone, unlabelled. It is the only thing that could be under
          this title, and "Bill" in front of it was a word doing no work.

          No negative top margin to tighten it against the title either: this is
          the ScrollView's first child, so pulling it up slides it under the
          header row and clips the top of the code. */}
      <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 15 }}>
        {cycle.referenceCode}
      </Text>

      {attemptsQuery.isLoading ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : attempts.length === 0 ? (
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18, paddingVertical: spacing.md }]}>
          No payments have been started for this bill yet. Anything you pay through the app is recorded here.
        </Text>
      ) : (
        attempts.map((attempt) => (
          <PaymentAttemptCard attempt={attempt} key={attempt.id} onResolve={onResolve} />
        ))
      )}
    </SheetShell>
  );
}

/**
 * How each attempt reads to the tenant who made it.
 *
 * <p>
 * Not {@code humanizeToken(status)}. The stored names are written from the
 * app's point of view — "OWNER_REJECTED" tells a tenant they did something
 * wrong, when the ordinary cause is an owner who has not found the credit yet.
 */
const ATTEMPT_DISPLAY: Record<PaymentIntentStatus, { label: string; note: string; tone: AttemptTone }> = {
  CREATED: {
    label: "Not answered",
    note: "You opened this payment but never told us how it went.",
    tone: "warning",
  },
  TENANT_CANCELLED: {
    label: "Cancelled",
    note: "You said this payment did not go through.",
    tone: "neutral",
  },
  TENANT_CONFIRMED: {
    label: "Awaiting review",
    note: "With the property to check against their account.",
    tone: "warning",
  },
  OWNER_VERIFIED: {
    label: "Verified",
    note: "The property found this payment and marked the bill paid.",
    tone: "success",
  },
  OWNER_REJECTED: {
    label: "Not matched",
    note: "The property could not find this payment. Contact them with your reference.",
    tone: "danger",
  },
};

type AttemptTone = "success" | "warning" | "neutral" | "danger";

function PaymentAttemptCard({
  attempt,
  onResolve,
}: {
  attempt: PaymentIntent;
  onResolve: (intent: PaymentIntent) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const display = ATTEMPT_DISPLAY[attempt.status];
  // The last thing that happened to it, not when it started — a tenant reading
  // a decision wants the date of the decision.
  const stampedAt = attempt.ownerDecidedAt ?? attempt.tenantDecidedAt ?? attempt.createdAt;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <AttemptStatusPill label={display.label} tone={display.tone} />
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, marginLeft: "auto" }}>
          <CalendarDays color={colors.muted} size={14} strokeWidth={2.3} />
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontSize: 13 }}>
            {formatDate(stampedAt)}
          </Text>
        </View>
      </View>

      {/* A rule under the header, then the amount fenced off from the sentence
          by a second one. The figure is what a tenant scans for down a column
          of attempts, and it has to be findable without reading the prose. */}
      <View
        style={{
          borderTopColor: colors.border,
          borderTopWidth: 1,
          flexDirection: "row",
          gap: spacing.md,
          marginTop: spacing.sm,
          paddingTop: spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 }}>
            {display.note}
          </Text>
          {attempt.tenantReferenceText ? (
            <Text style={[type.caption, { color: colors.kicker }]}>
              Ref <Text style={{ fontFamily: fonts.mono }}>{attempt.tenantReferenceText}</Text>
            </Text>
          ) : null}
          {attempt.proofImageUrls.length > 0 ? (
            <Text style={[type.caption, { color: colors.kicker }]}>Screenshot attached</Text>
          ) : null}
        </View>

        <View
          style={{
            borderLeftColor: colors.border,
            borderLeftWidth: 1,
            justifyContent: "center",
            paddingLeft: spacing.md,
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.3 }}>
            {formatMoney(attempt.amountPaise)}
          </Text>
        </View>
      </View>

      {/* Only an unanswered attempt has anything left to do. A confirmed one is
          with the owner and a decided one is closed — offering "Resolve" there
          would promise an action that does not exist. */}
      {attempt.status === "CREATED" ? (
        <View style={{ alignItems: "flex-start", marginTop: spacing.md }}>
          <AnimatedPressable
            accessibilityLabel="Resolve this payment attempt"
            accessibilityRole="button"
            onPress={() => onResolve(attempt)}
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 999,
              flexDirection: "row",
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
            }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 15 }}>Resolve</Text>
            <ArrowRight color={colors.onPrimary} size={17} strokeWidth={2.4} />
          </AnimatedPressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The attempts list's own pill: a filled dot, then the status in caps.
 *
 * <p>
 * Not the shared {@code StatusPill}, which is deliberately dotless. These rows
 * carry no icon and no colour anywhere else, so the dot is the only thing
 * separating one card's state from the next at a glance — and the shared pill
 * stays as it is rather than growing an option for one screen.
 */
function AttemptStatusPill({ label, tone }: { label: string; tone: AttemptTone }) {
  const { colors, fonts } = useTheme();
  const palette = {
    success: { background: colors.successSoft, dot: colors.successText, text: colors.successText },
    warning: { background: colors.warningSoft, dot: colors.warning, text: colors.warningText },
    neutral: { background: colors.neutralSoft, dot: colors.muted, text: colors.neutralText },
    danger: { background: colors.dangerSoft, dot: colors.danger, text: colors.danger },
  }[tone];

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: palette.background,
        borderRadius: 999,
        flexDirection: "row",
        // Sizes to its label and nothing more, so the date stays pinned to the
        // right edge instead of being pushed off it.
        flexShrink: 0,
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
      }}
    >
      <View style={{ backgroundColor: palette.dot, borderRadius: 999, height: 8, width: 8 }} />
      <Text
        numberOfLines={1}
        style={{
          color: palette.text,
          fontFamily: fonts.sansBold,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function formatMoney(amountPaise: number) {
  return `₹${(amountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date(value));
}
