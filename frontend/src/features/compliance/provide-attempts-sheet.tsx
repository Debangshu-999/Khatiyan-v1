import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ShieldCheck, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/compliance/verification-flow-parts";
import {
  MAX_ATTEMPTS,
  MIN_ATTEMPTS,
  VERIFICATION_SERVICES,
  VerificationOrderSummary,
  orderedServices,
  type VerificationOrder,
  type VerificationServiceKey,
} from "@/features/compliance/verification-services";
import { ActionButton, formatMoneyPaise } from "@/features/owner/owner-ui";
import {
  useGetPendingStayChecksQuery,
  useProvideVerificationAttemptsMutation,
} from "@/store/services/compliance-api";
import type { VerificationGrant } from "@/store/services/verification-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The owner gives a pending stay's tenant more verification attempts (owner's
 * decision, 2026-09-27). A tenant who runs out is told to contact the owner,
 * and this is where the owner answers. No request flow.
 *
 * <p>Only the checks this tenant was given at onboarding, each with where it
 * stands. Only one they have not passed and have no attempts left for can be
 * picked: a top-up for someone who ran out, never a
 * new order and never extra tries on top of unused ones. The server enforces
 * the same. The tenant is notified when attempts are added.
 */
export function ProvideAttemptsSheet({
  onClose,
  tenancyId,
}: {
  onClose: () => void;
  tenancyId: string;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const checksQuery = useGetPendingStayChecksQuery(tenancyId);
  const [provide, provideState] = useProvideVerificationAttemptsMutation();
  const [order, setOrder] = useState<VerificationOrder>({});
  // A refusal (balance limits, a check that changed meanwhile) interrupts.
  // Nothing in the sheet fixes it by retyping.
  const [refusal, setRefusal] = useState<string | null>(null);

  // The latest check per service this tenant was given. Nothing else is
  // listed: a service they were never given is not theirs to top up.
  const given = [
    ...new Map(
      (checksQuery.data ?? [])
        .filter((grant) => grant.status !== "CANCELLED")
        .map((grant) => [grant.serviceCode, grant] as const),
    ).values(),
  ];
  const chosen = orderedServices(order);
  const anyToppable = given.some((grant) => toppable(grant));

  function toggle(key: VerificationServiceKey) {
    setOrder((current) => {
      const next = { ...current };
      if ((next[key] ?? 0) > 0) {
        delete next[key];
        return next;
      }
      next[key] = MIN_ATTEMPTS;
      return next;
    });
  }

  function setAttempts(key: VerificationServiceKey, attempts: number) {
    setOrder((current) => ({ ...current, [key]: Math.min(Math.max(attempts, MIN_ATTEMPTS), MAX_ATTEMPTS) }));
  }

  async function add() {
    try {
      await provide({
        tenancyId,
        verification: chosen.map((service) => ({ attempts: order[service.key] ?? MIN_ATTEMPTS, serviceCode: service.key })),
      }).unwrap();
      toast.success("Attempts added. The tenant has been notified.");
      onClose();
    } catch (e) {
      setRefusal(errorMessage(e, "The attempts could not be added. Try again in a moment."));
    }
  }

  return (
    <SheetShell onClose={onClose} title="Provided verification">
      <View style={{ gap: spacing.md }}>
        <Text style={[type.description, { color: colors.muted }]}>
          Attempts can be added to a check given to this tenant once they have none left.
        </Text>

        {checksQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : given.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {given.map((grant) => {
              const service = catalogueEntry(grant);
              return (
                <CheckRow
                  canPick={toppable(grant)}
                  grant={grant}
                  icon={service?.icon ?? ShieldCheck}
                  key={grant.id}
                  label={service?.label ?? "Identity check"}
                  onToggle={() => service && toggle(service.key)}
                  picked={service ? (order[service.key] ?? 0) > 0 : false}
                  pricePaise={service?.pricePaise ?? null}
                />
              );
            })}
          </View>
        ) : (
          <Text style={[type.description, { color: colors.muted }]}>No checks were given to this tenant.</Text>
        )}

        <VerificationOrderSummary onAttemptsChange={setAttempts} order={order} />

        <ActionButton
          disabled={chosen.length === 0 || provideState.isLoading}
          label={provideState.isLoading ? "Adding…" : "Add attempts"}
          onPress={() => void add()}
        />
        {!checksQuery.isLoading && given.length > 0 && !anyToppable ? (
          <Text style={[type.description, { color: colors.muted, textAlign: "center" }]}>
            No check needs more attempts right now.
          </Text>
        ) : null}
      </View>

      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </SheetShell>
  );
}

/** The catalogue entry behind a check, when it is still offered. The retired OTP check has none. */
function catalogueEntry(grant: VerificationGrant) {
  return VERIFICATION_SERVICES.find((service) => service.key === grant.serviceCode && service.available) ?? null;
}

/** Offered, not passed, and out of attempts: the only check that can be topped up. */
function toppable(grant: VerificationGrant) {
  return catalogueEntry(grant) !== null && grant.status !== "VERIFIED" && grant.attemptsRemaining === 0;
}

/** One check this tenant was given: where it stands, and whether it can be topped up now. */
function CheckRow({
  canPick,
  grant,
  icon: Icon,
  label,
  onToggle,
  picked,
  pricePaise,
}: {
  canPick: boolean;
  grant: VerificationGrant;
  icon: ComponentType<LucideProps>;
  label: string;
  onToggle: () => void;
  picked: boolean;
  pricePaise: number | null;
}) {
  const { colors, fonts, type } = useTheme();

  const status =
    grant.status === "VERIFIED"
      ? "Verified"
      : grant.attemptsRemaining === 0
        ? "No attempts left"
        : `${grant.attemptsRemaining} ${grant.attemptsRemaining === 1 ? "attempt" : "attempts"} left`;
  const statusColor = grant.status === "VERIFIED" ? colors.jade : canPick ? colors.danger : colors.muted;

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked, disabled: !canPick }}
      disabled={!canPick}
      onPress={onToggle}
      style={{
        alignItems: "center",
        // The same selection as the onboarding picker: a chosen row is filled.
        backgroundColor: picked ? colors.primarySoft : "transparent",
        borderColor: picked ? "transparent" : colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: picked ? colors.surface : colors.neutralSoft,
          borderCurve: "continuous",
          borderRadius: radii.card,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Icon color={colors.ink} size={18} strokeWidth={2} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15 }}>{label}</Text>
        <Text style={[type.caption, { color: statusColor, lineHeight: 17 }]}>{status}</Text>
      </View>

      {canPick && pricePaise !== null ? (
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{formatMoneyPaise(pricePaise)}</Text>
      ) : null}
    </AnimatedPressable>
  );
}
