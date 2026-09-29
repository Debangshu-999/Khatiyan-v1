import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ClipboardCheck, FileSignature, MessageCircle, ShieldCheck } from "lucide-react-native";
import { useRouter } from "expo-router";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PinnedWizardHeader, usePinnedWizardHeader } from "@/components/pinned-wizard-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { StatusIcon } from "@/components/status-icon";
import { useToast } from "@/components/toast";
import { threadRoute } from "@/features/chat/thread-route";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import { AgreementAcceptanceView } from "@/features/compliance/agreement-acceptance-view";
import { AgreementDocument } from "@/features/compliance/agreement-document";
import { VERIFICATION_SERVICES } from "@/features/compliance/verification-services";
import { useGetMyAgreementQuery } from "@/store/services/compliance-api";
import { useOpenTeamThreadMutation } from "@/store/services/chat-api";
import {
  useListMyVerificationsQuery,
  useStartVerificationOtpMutation,
  useSubmitVerificationOtpMutation,
  type VerificationGrant,
} from "@/store/services/verification-api";
import { VerificationCheckFlow } from "@/features/compliance/verification-check-flow";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type StepKey = "agreement" | "verify" | "sign";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "agreement", label: "Agreement" },
  { key: "verify", label: "Verification" },
  { key: "sign", label: "Sign" },
];

/**
 * Everything a new tenant has to do, in the order they have to do it.
 *
 * <p>Three steps rather than one long screen, because they are three different
 * kinds of work: reading a contract, proving who you are, and signing. Reading
 * and verifying are freely navigable — someone may want to re-read a clause
 * while half way through — but signing waits until the checks the owner asked
 * for are done, which is the whole reason they were asked for.
 */
export function TenantOnboardingSteps({ propertyName }: { propertyName: string }) {
  const { colors, fonts, type } = useTheme();
  const agreementQuery = useGetMyAgreementQuery();
  // What the owner actually ordered. An empty list is the manual route: they
  // checked an ID themselves and there is nothing here for the tenant to do.
  const verificationQuery = useListMyVerificationsQuery();
  const [step, setStep] = useState<StepKey>("agreement");
  // Once the tenant has moved on from the agreement, it keeps its tick, even
  // when they come back to re-read it. It used to lose it on return, which
  // read as if reading it again had undone something.
  const [agreementRead, setAgreementRead] = useState(false);
  const [openCheck, setOpenCheck] = useState<VerificationGrant | null>(null);
  const header = usePinnedWizardHeader();
  const router = useRouter();
  const toast = useToast();
  const [openTeamThread, openTeamThreadState] = useOpenTeamThreadMutation();
  const openingChat = openTeamThreadState.isLoading;

  /** Out of attempts: the tenant reaches the owner in the stay's team chat. */
  async function contactOwner(tenancyId: string) {
    try {
      const opened = await openTeamThread(tenancyId).unwrap();
      if (opened.id) {
        router.push(
          threadRoute(
            opened.id,
            opened,
            "Property management team",
            "I have run out of Aadhaar verification attempts. Could you provide extra attempts?",
          ),
        );
      }
    } catch {
      toast.error("Could not open the chat. Try again in a moment.");
    }
  }

  /**
   * Moves between steps, closing whatever check was open.
   *
   * <p>A check left open while the tenant went back to re-read a clause used to
   * stay mounted and render underneath the agreement — an Aadhaar field at the
   * bottom of a contract.
   */
  function goToStep(next: StepKey) {
    setOpenCheck(null);
    if (step === "agreement" && next !== "agreement") {
      setAgreementRead(true);
    }
    setStep(next);
  }

  // Only this stay's checks. `/my` lists every check on the account, and one
  // left on an earlier stay must neither show here nor hold signing back.
  // A check with no tenancy id (a server from before 2026-09-27) is KEPT: an
  // empty list reads as "the owner checked the ID by hand", so dropping checks
  // we cannot place would tell the tenant there is nothing to do.
  const tenancyId = agreementQuery.data?.tenancyId ?? null;
  const grants = (verificationQuery.data ?? []).filter(
    (grant) => !grant.tenancyId || grant.tenancyId === tenancyId,
  );
  // Nothing ordered is not the same as nothing done. An owner who checked an ID
  // themselves has left their tenant no work, and the step says so rather than
  // showing an empty list.
  const manualRoute = grants.length === 0;
  const verificationDone = manualRoute || grants.every((grant) => grant.status === "VERIFIED");

  const agreement = agreementQuery.data;

  /** The three steps, always visible, so it is clear what is left and what waits. */
  function renderSteps() {
    return (
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {STEPS.map((entry, index) => {
          const locked = entry.key === "sign" && !verificationDone;
          const current = step === entry.key;
          const done =
            (entry.key === "verify" && verificationDone) ||
            (entry.key === "agreement" && (agreementRead || step !== "agreement"));

          return (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ disabled: locked, selected: current }}
              disabled={locked}
              key={entry.key}
              onPress={() => goToStep(entry.key)}
              style={{
                alignItems: "center",
                borderBottomColor: current ? colors.primary : done ? colors.jade : colors.borderStrong,
                borderBottomWidth: 3,
                flex: 1,
                gap: 4,
                // A locked step is dimmed and unpressable, which says it is not
                // available. A padlock beside the word said it twice.
                opacity: locked ? 0.45 : 1,
                paddingBottom: spacing.sm,
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
                {/* The app's status mark, not a bare tick: a filled disc with
                    the glyph knocked out in white, the same shape a toast and a
                    refusal use. A number said only where a step sat in a list
                    the reader could already see. */}
                {done ? <StatusIcon size={14} tone="success" /> : null}
                <Text
                  style={{
                    color: current ? colors.ink : colors.muted,
                    fontFamily: current ? fonts.sansBold : fonts.sans,
                    fontSize: 12.5,
                  }}
                >
                  {entry.label}
                </Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    );
  }

  if (agreementQuery.isLoading || !agreement) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        {agreementQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <EmptyState
            description="Your tenancy is awaiting its agreement. Ask the property owner to re-check the onboarding."
            icon={FileSignature}
            title="Agreement unavailable"
          />
        )}
      </ScreenScrollView>
    );
  }

  return (
    // The panel is absolutely positioned, so it needs a filled parent that is
    // NOT the scroller — inside one it would scroll away with the agreement,
    // which is the one thing a step bar must not do.
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <PinnedWizardHeader onHeightChange={header.onHeightChange}>
        {/* The title names the screen, the bar says where in it you are. Set
            close together they read as one stacked heading, so the bar keeps a
            clear gap of its own. */}
        <View style={{ gap: spacing.xl }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, textAlign: "center" }}
          >
            Tenancy <Text style={{ color: colors.primary }}>agreement</Text>
          </Text>
          {renderSteps()}
        </View>
      </PinnedWizardHeader>

      <ScreenScrollView
        // Cleared by the measured panel, not a guessed number. lg rather than
        // sm: the panel has a curved bottom edge, and content arriving right
        // against that curve reads as clipped instead of as passing beneath it.
        contentContainerStyle={{ paddingTop: header.contentInset + spacing.lg }}
        safeAreaEdges={["top", "bottom"]}
      >
        {step === "agreement" ? (
          <>
            <NoticeBar
              message={`${propertyName} requires you to read and accept these terms. Your tenancy — and its billing — starts only after you sign.`}
              title="Before your tenancy begins"
              tone="info"
            />
            <AgreementDocument
              acceptedAt={agreement.acceptedAt}
              clauses={agreement.clauses}
              preamble={agreement.preamble}
            />
            <ActionButton label="Continue to verification" onPress={() => goToStep("verify")} />
          </>
        ) : null}

        {step === "verify" ? (
          <Card>
            {manualRoute ? (
              <View style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg }}>
                <ClipboardCheck color={colors.jade} size={30} strokeWidth={1.8} />
                <Text
                  style={{
                    color: colors.ink,
                    fontFamily: fonts.displaySoft,
                    fontSize: 16,
                    textAlign: "center",
                  }}
                >
                  Nothing to do here
                </Text>
                <Text
                  style={[type.description, { color: colors.muted, textAlign: "center" }]}
                >
                  Your onboarding verification was completed manually by the person in charge of your
                  onboarding.
                </Text>
              </View>
            ) : (
              <>
                <Text style={[type.description, { color: colors.muted }]}>
                  {propertyName} asked you to complete these checks. Each one happens on your phone, and
                  nobody at the property sees your numbers or your codes.
                </Text>

                {grants.map((grant) => {
                  const service = serviceFor(grant.serviceCode);
                  const done = grant.status === "VERIFIED";
                  const exhausted = grant.status === "EXHAUSTED";
                  return (
                    <AnimatedPressable
                      accessibilityRole="button"
                      disabled={done || exhausted}
                      key={grant.id}
                      onPress={() => setOpenCheck(grant)}
                      style={{
                        alignItems: "center",
                        // No green outline on a passed check. The mark says it,
                        // and a bordered row said the same thing a second time
                        // in a heavier voice than the rows beside it.
                        borderColor: exhausted ? colors.danger : colors.borderStrong,
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
                          backgroundColor: colors.neutralSoft,
                          borderCurve: "continuous",
                          borderRadius: radii.card,
                          height: 36,
                          justifyContent: "center",
                          width: 36,
                        }}
                      >
                        <service.icon color={colors.ink} size={18} strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 15 }}>
                          {service.label}
                        </Text>
                        <Text
                          style={[type.description, { color: done ? colors.jade : exhausted ? colors.danger : colors.muted },
                          ]}
                        >
                          {done
                            // Not the masked digits. They are the tenant's own
                            // Aadhaar — telling them the last four of a number
                            // they just typed explains nothing. It belongs on
                            // the OWNER's record, which is the side that never
                            // saw the number.
                            ? "Verified"
                            : exhausted
                              ? "Verification attempts exhausted"
                              : `${grant.attemptsRemaining} ${grant.attemptsRemaining === 1 ? "attempt" : "attempts"} left`}
                        </Text>
                      </View>
                      {done ? <StatusIcon size={20} tone="success" /> : null}
                    </AnimatedPressable>
                  );
                })}

                {/* Owner's decision, 2026-09-27: no request flow. The tenant
                    reaches the owner in chat, and the owner adds attempts from
                    the stay's card. The team thread, not a direct one: a direct
                    chat needs an active stay, and this one is still pending. */}
                {grants.some((grant) => grant.status === "EXHAUSTED") && agreement?.tenancyId ? (
                  <View style={{ gap: 4 }}>
                    <AnimatedPressable
                      accessibilityRole="link"
                      disabled={openingChat}
                      hitSlop={8}
                      onPress={() => void contactOwner(agreement.tenancyId)}
                      style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: spacing.xs }}
                    >
                      <MessageCircle color={colors.ink} size={16} strokeWidth={2.2} />
                      <Text
                        style={{
                          color: colors.ink,
                          fontFamily: fonts.sansBold,
                          fontSize: 14,
                          textDecorationLine: "underline",
                        }}
                      >
                        Contact your owner
                      </Text>
                    </AnimatedPressable>
                  </View>
                ) : null}

                {verificationDone ? (
                  <ActionButton label="Continue to signing" onPress={() => goToStep("sign")} />
                ) : (
                  <Text style={[type.description, { color: colors.muted }]}>
                    Signing unlocks once these are done.
                  </Text>
                )}
              </>
            )}
          </Card>
        ) : null}

        {step === "sign" ? (
          <>
            <NoticeBar
              message="You are signing the agreement you read in step one. A code goes to your phone to confirm it is you."
              title="Sign your agreement"
              tone="info"
            />
            <AgreementAcceptanceView hideDocument propertyName={propertyName} />
          </>
        ) : null}

        {/* Under the list it came from, and nowhere else. Rendered outside the
            step conditionals it stayed mounted when the tenant went back to read
            a clause, which put an Aadhaar field at the foot of their contract. */}
        {/* Its own stack of layers, unmounted the moment it closes — which is
            what makes reopening start from the instructions again rather than
            dropping somebody back into a half-finished attempt. */}
        {step === "verify" && openCheck ? (
          <VerificationCheckFlow
            grant={openCheck}
            onClose={() => setOpenCheck(null)}
            onVerified={() => setOpenCheck(null)}
          />
        ) : null}
      </ScreenScrollView>
    </View>
  );
}

/** The catalogue entry behind a server-side code. */
function serviceFor(code: VerificationGrant["serviceCode"]) {
  return (
    VERIFICATION_SERVICES.find((service) => service.key === code) ?? {
      description: "An identity check",
      icon: ShieldCheck,
      label: "Identity check",
    }
  );
}

/**
 * The server's sentence, when it sent one.
 *
 * <p>Its refusals are written for the person reading them — "there is no mobile
 * number linked to this Aadhaar" is something a tenant can act on, where a
 * generic fallback is not.
 */
function errorMessage(e: unknown, fallback: string) {
  const data = (e as { data?: { message?: string } } | undefined)?.data;
  return data?.message && data.message.trim().length > 0 ? data.message : fallback;
}
