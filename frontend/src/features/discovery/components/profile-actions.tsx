import { useState } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { FitText } from "@/components/fit-text";
import { useToast } from "@/components/toast";
import { BookAStayFlow, DirectVisitFlow } from "@/features/discovery/components/direct-booking-flows";
import { EnquireFlow } from "@/features/discovery/components/enquire-action";
import { EnquireArt, StayArt, VisitArt } from "@/features/discovery/components/profile-action-art";
import { ProfileSection, SECTION_TONES } from "@/features/discovery/components/property-profile";
import { errorMessage } from "@/features/forms/server-error";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import { useChangeEnquiryMindMutation, useGetMyEnquiryForPropertyQuery } from "@/store/services/enquiry-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { cardShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The property profile's three actions (user, 2026-10-17): Enquire, Book a
 * visit and Book a stay. Out of the fixed footer and into a Next steps section
 * above Property details, as bubbles on an orange wash (user, 2026-11-14). The
 * sheets behind them are mounted once.
 *
 * <p>Who sees what: nothing for someone who manages the place. Someone who
 * stays there may enquire, and books no visit or stay there, which the server
 * refuses too. Enquire reads "Enquiry sent" while one is open, as it did.
 *
 * @return the Next steps section, null when there is nothing to offer; and the
 *         sheets, to mount once on the screen
 */
export function useProfileActions(propertyId: string | null, propertyName: string) {
  const toast = useToast();
  const myEnquiryQuery = useGetMyEnquiryForPropertyQuery(propertyId ?? "", { skip: !propertyId });
  const myEnquiry = myEnquiryQuery.data;
  const staysHere = useGetMyActiveTenancyQuery().data?.tenancy?.propertyId === propertyId;
  const [changeMind, changeMindState] = useChangeEnquiryMindMutation();
  const [step, setStep] = useState<"ENQUIRE" | "REOPEN" | "VISIT" | "BOOKING" | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // A failed check falls OPEN, as Enquire always has: the server refuses with words.
  const checkFailed = myEnquiryQuery.isError;
  const manages = !checkFailed && Boolean(myEnquiry && !myEnquiry.canEnquire && !myEnquiry.openEnquiryId);
  const loading = !myEnquiry && !checkFailed;
  const canEnquire = checkFailed || Boolean(myEnquiry?.canEnquire);
  const available = Boolean(propertyId) && !loading && !manages;

  function enquire() {
    // A closed Not interested enquiry with its one reopen left is offered first (owner's rule, 2026-10-03).
    setStep(myEnquiry?.reopenableEnquiryId ? "REOPEN" : "ENQUIRE");
  }

  async function reopen() {
    if (!myEnquiry?.reopenableEnquiryId) return;
    try {
      await changeMind({ enquiryId: myEnquiry.reopenableEnquiryId, version: myEnquiry.reopenableVersion ?? 0 }).unwrap();
      setStep(null);
      toast.success("Your handler knows you are interested again.");
    } catch (caught) {
      setStep(null);
      setRefusal(errorMessage(caught));
    }
  }

  function nextSteps() {
    if (!available) return null;
    return <NextSteps
      canEnquire={canEnquire}
      onBookStay={() => setStep("BOOKING")}
      onBookVisit={() => setStep("VISIT")}
      onEnquire={enquire}
      staysHere={staysHere}
    />;
  }

  const sheets = !propertyId ? null : <>
    {step === "ENQUIRE" ? <EnquireFlow onDone={() => setStep(null)} propertyId={propertyId} propertyName={propertyName} /> : null}
    {step === "REOPEN" ? <ConfirmDialog
      bullets={[
        "This can only be done once.",
        "If this enquiry is marked not interested again, it cannot be reverted further.",
      ]}
      confirmLabel={changeMindState.isLoading ? "Sending" : "I'm interested"}
      message="Your earlier enquiry here was closed as not interested. Let your handler know you are interested again."
      onCancel={() => setStep(null)}
      onConfirm={() => void reopen()}
      title="Are you interested in this property?"
    /> : null}
    {step === "VISIT" ? <DirectVisitFlow onDone={() => setStep(null)} propertyId={propertyId} /> : null}
    {step === "BOOKING" ? <BookAStayFlow onDone={() => setStep(null)} propertyId={propertyId} /> : null}
    {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
  </>;

  return { available, nextSteps, sheets };
}

/**
 * Next steps (user, 2026-11-14): two bold orange lines before the title, an
 * orange wash behind, and the three actions as bubbles, each with its drawing
 * over its name. Who stays here gets Enquire alone.
 */
function NextSteps({
  canEnquire,
  onBookStay,
  onBookVisit,
  onEnquire,
  staysHere,
}: {
  canEnquire: boolean;
  onBookStay: () => void;
  onBookVisit: () => void;
  onEnquire: () => void;
  staysHere: boolean;
}) {
  const { colors, isDark } = useTheme();
  const tone = SECTION_TONES.nextSteps;
  return <LinearGradient
    colors={isDark ? ["#2B1A0B", colors.surface] : ["#FFEBD6", "#FFF8F1"]}
    end={{ x: 1, y: 1 }}
    start={{ x: 0, y: 0 }}
    style={{
      borderColor: isDark ? "#5A3412" : "#FED7AA",
      borderCurve: "continuous",
      borderRadius: radii.card,
      borderWidth: 1,
      padding: spacing.md,
      ...cardShadow(colors.shadow),
    }}
  >
    <ProfileSection
      lines={2}
      tagline={staysHere ? "You stay here. Ask the team anything." : "Ask a question, see it in person, or reserve your bed."}
      title="Next steps"
      tone={tone}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <StepBubble art={<EnquireArt size={40} />} disabled={!canEnquire} label={canEnquire ? "Enquire" : "Enquiry sent"} onPress={onEnquire} />
        {staysHere ? null : <StepBubble art={<VisitArt size={40} />} label="Book a visit" onPress={onBookVisit} />}
        {staysHere ? null : <StepBubble art={<StayArt size={40} />} label="Book a stay" onPress={onBookStay} />}
      </View>
    </ProfileSection>
  </LinearGradient>;
}

/** One of the Next steps: a white bubble with an orange edge, the drawing over the name. */
function StepBubble({ art, disabled = false, label, onPress }: { art: React.ReactNode; disabled?: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const tone = SECTION_TONES.nextSteps;
  return <AnimatedPressable
    accessibilityLabel={label}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={{
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: `${tone}66`,
      borderCurve: "continuous",
      borderRadius: 22,
      borderWidth: 1.5,
      flex: 1,
      gap: 6,
      minWidth: 0,
      opacity: disabled ? 0.6 : 1,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.sm + 2,
    }}
  >
    {art}
    <FitText minimumFontScale={0.8} numberOfLines={1} style={{ color: disabled ? colors.muted : colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>{label}</FitText>
  </AnimatedPressable>;
}
