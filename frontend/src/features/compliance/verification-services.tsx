import { useState } from "react";
import { Text, View } from "react-native";
import { CreditCard, Fingerprint, Info, Minus, Plus, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * A check the tenant performs on themselves, ordered by the owner.
 *
 * <p>The owner never handles the tenant's Aadhaar number or their OTP. They
 * choose which checks a tenancy needs and how many attempts to grant, and the
 * tenant does the checking from their own phone.
 */
export type VerificationServiceKey = "AADHAAR_OKYC" | "PAN";

export type VerificationService = {
  available: boolean;
  description: string;
  icon: ComponentType<LucideProps>;
  key: VerificationServiceKey;
  label: string;
  /** Dummy until the provider quotes us. */
  pricePaise: number;
  /** One word, for a row that has a figure beside it. */
  shortLabel: string;
};

export const VERIFICATION_SERVICES: VerificationService[] = [
  {
    available: true,
    description: "OTP based Aadhaar verification",
    icon: Fingerprint,
    key: "AADHAAR_OKYC",
    label: "Aadhaar verification",
    pricePaise: 1_500,
    shortLabel: "Aadhaar",
  },
  {
    // Not offered, and it must stay that way until the server has a
    // ServiceCode for it. Sending a code the enum does not carry does not fail
    // as a validation error — Jackson cannot read the enum, so the WHOLE body
    // becomes unreadable and the owner is told their request was malformed
    // with nothing naming the field.
    available: false,
    description: "PAN checked against the tax record",
    icon: CreditCard,
    key: "PAN",
    label: "PAN verification",
    pricePaise: 1_000,
    shortLabel: "PAN",
  },
];

/** How many attempts one service may be granted. */
export const MIN_ATTEMPTS = 1;
export const MAX_ATTEMPTS = 5;

/** Chosen services, each with the attempts granted to the tenant. */
export type VerificationOrder = Partial<Record<VerificationServiceKey, number>>;

export function orderTotalPaise(order: VerificationOrder) {
  return VERIFICATION_SERVICES.reduce(
    (total, service) => total + (order[service.key] ?? 0) * service.pricePaise,
    0,
  );
}

export function orderedServices(order: VerificationOrder) {
  return VERIFICATION_SERVICES.filter((service) => (order[service.key] ?? 0) > 0);
}

/**
 * The catalogue: pick what this tenancy needs.
 *
 * <p>Several may be chosen, not one, because a tenancy can need more than one
 * check and they are independent of each other. A chosen row is filled rather
 * than ticked — the row itself is the state, so it stays announced as a
 * checkbox to a screen reader while the eye reads a block of colour.
 */
export function VerificationServicePicker({
  onToggle,
  order,
}: {
  onToggle: (key: VerificationServiceKey) => void;
  order: VerificationOrder;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      {VERIFICATION_SERVICES.map((service) => {
        const picked = (order[service.key] ?? 0) > 0;
        return (
          <AnimatedPressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: picked, disabled: !service.available }}
            disabled={!service.available}
            key={service.key}
            onPress={() => onToggle(service.key)}
            style={{
              alignItems: "center",
              // Chosen rows are filled rather than ticked. With only two of
              // them the fill is read at a glance, where a checkbox asks the
              // eye to find a 22px mark on each row and compare.
              backgroundColor: picked ? colors.primarySoft : "transparent",
              borderColor: picked ? "transparent" : colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              flexDirection: "row",
              gap: spacing.sm,
              opacity: service.available ? 1 : 0.5,
              padding: spacing.md,
            }}
          >
            <View
              style={{
                alignItems: "center",
                // White once the row is filled, so the glyph keeps a ground of
                // its own instead of dissolving into the tint.
                backgroundColor: picked ? colors.surface : colors.neutralSoft,
                borderCurve: "continuous",
                borderRadius: radii.card,
                height: 36,
                justifyContent: "center",
                width: 36,
              }}
            >
              <service.icon color={colors.ink} size={18} strokeWidth={2} />
            </View>

            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15 }}>
                {service.label}
              </Text>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
                {service.available ? service.description : "Coming soon."}
              </Text>
            </View>

            {/* The price sits where a price sits: right-aligned against its own
                row, rather than trailing the description in a sentence. */}
            {service.available ? (
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
                {formatMoneyPaise(service.pricePaise)}
              </Text>
            ) : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/**
 * What has been ordered, with the attempts and what it will hold.
 *
 * <p>Reads as a basket on purpose: several lines, a quantity on each, and one
 * total at the bottom. The total is a CEILING rather than a charge — nothing is
 * set aside when checks are ordered, and an attempt the tenant never uses is
 * never paid for. That is the thing this panel has to make unmistakable.
 */
export function VerificationOrderSummary({
  onAttemptsChange,
  order,
}: {
  onAttemptsChange: (key: VerificationServiceKey, attempts: number) => void;
  order: VerificationOrder;
}) {
  const { colors, fonts, type } = useTheme();
  const [ruleOpen, setRuleOpen] = useState(false);
  const chosen = orderedServices(order);

  if (chosen.length === 0) {
    return null;
  }

  return (
    // The page's own gap on both sides of the seam, so the heading sits midway
    // between the two cards instead of riding low against the basket.
    <View style={{ gap: spacing.lg }}>
      {/* The heading is the seam between the catalogue above and the basket
          below, so it sits on the page between the two cards rather than
          inside either of them. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
        <Text
          style={[
            type.eyebrow,
            {
              backgroundColor: colors.primarySoft,
              borderCurve: "continuous",
              borderRadius: 999,
              color: colors.primaryDeep,
              overflow: "hidden",
              paddingHorizontal: spacing.md,
              paddingVertical: 5,
            },
          ]}
        >
          ADDED ITEMS
        </Text>
        <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
      </View>

      <Card style={{ gap: spacing.md }}>
        {/* Column headings, because three numbers in a row with no labels make a
            reader work out which is which from their size. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.muted, flex: 1 }]}>ITEM</Text>
          <Text style={[type.eyebrow, { color: colors.muted, textAlign: "center", width: 96 }]}>
            ATTEMPTS
          </Text>
          <Text style={[type.eyebrow, { color: colors.muted, minWidth: 64, textAlign: "right" }]}>
            TOTAL
          </Text>
        </View>

        {chosen.map((service) => {
          const attempts = order[service.key] ?? 1;
          return (
            <View
              key={service.key}
              style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
                  {service.label}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]}>
                  {formatMoneyPaise(service.pricePaise)} each
                </Text>
              </View>

              <View style={{ alignItems: "center", width: 96 }}>
                <AttemptStepper
                  attempts={attempts}
                  onChange={(next) => onAttemptsChange(service.key, next)}
                />
              </View>

              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.sansBold,
                  fontSize: 14,
                  minWidth: 64,
                  textAlign: "right",
                }}
              >
                {formatMoneyPaise(service.pricePaise * attempts)}
              </Text>
            </View>
          );
        })}

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          {/* The mark travels with the words it qualifies. Left floating in the
              gap it read as a note about the figure instead. */}
          <View style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: 2 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
              Total amount
            </Text>
            <AnimatedPressable
              accessibilityLabel="How service charges work"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setRuleOpen(true)}
              style={{ alignItems: "center", height: 22, justifyContent: "center", width: 22 }}
              tapLockMs={0}
            >
              <Info color={colors.kicker} size={15} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
            {formatMoneyPaise(orderTotalPaise(order))}
          </Text>
        </View>

        {ruleOpen ? (
          <HowItWorksSheet
            eyebrow="Service charges"
            onClose={() => setRuleOpen(false)}
            steps={[
              {
                body: "Nothing leaves your Service balance when you order checks. The total shown is the most this can come to.",
                title: "Nothing is taken up front",
              },
              {
                body: "Your balance is charged when the tenant actually runs a check, one attempt at a time.",
                title: "You pay per attempt used",
              },
              {
                body: "If the tenant passes on the first try, the attempts they did not use are never charged at all.",
                title: "Unused attempts cost nothing",
              },
              {
                body: "If every attempt fails, the tenant can ask you for more. Those are charged the same way.",
                title: "If the checks do not pass",
              },
            ]}
            title="How service charges work"
          />
        ) : null}
      </Card>
    </View>
  );
}

/** How many attempts this tenant gets before they have to ask for more. */
function AttemptStepper({
  attempts,
  onChange,
}: {
  attempts: number;
  onChange: (next: number) => void;
}) {
  const { colors, fonts } = useTheme();

  function StepButton({ disabled, icon: Icon, onPress }: { disabled: boolean; icon: ComponentType<LucideProps>; onPress: () => void }) {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={6}
        onPress={disabled ? undefined : onPress}
        style={{
          alignItems: "center",
          backgroundColor: colors.neutralSoft,
          borderRadius: 8,
          height: 28,
          justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
          width: 28,
        }}
        tapLockMs={0}
      >
        <Icon color={colors.ink} size={14} strokeWidth={2.6} />
      </AnimatedPressable>
    );
  }

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <StepButton
        disabled={attempts <= MIN_ATTEMPTS}
        icon={Minus}
        onPress={() => onChange(attempts - 1)}
      />
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sansBold,
          fontSize: 14,
          minWidth: 16,
          textAlign: "center",
        }}
      >
        {attempts}
      </Text>
      <StepButton
        disabled={attempts >= MAX_ATTEMPTS}
        icon={Plus}
        onPress={() => onChange(attempts + 1)}
      />
    </View>
  );
}
