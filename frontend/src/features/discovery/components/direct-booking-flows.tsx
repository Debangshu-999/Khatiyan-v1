import { ModalTitle } from "@/components/modal-title";
import { useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { SheetShell } from "@/components/sheet-shell";
import { EnquiryConsentModal } from "@/features/discovery/components/enquiry-consent-modal";
import { VisitSheet } from "@/features/enquiry/visit-sheet";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useGetMyEnquiryChannelConsentsQuery, useOpenDirectBookingMutation } from "@/store/services/enquiry-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const VISIT_ARTWORK = require("../../../../assets/images/workspace/manage_visits.png");

/**
 * A visit booked straight from the property profile, with no enquiry (user,
 * 2026-10-17). They agree what contact to share first, exactly as when
 * enquiring, then pick a slot. The server puts it on their live enquiry
 * there, or on a direct record.
 */
export function DirectVisitFlow({ onDone, propertyId }: { onDone: () => void; propertyId: string }) {
  const consentsQuery = useGetMyEnquiryChannelConsentsQuery();
  const [step, setStep] = useState<"CONSENT" | "SLOT">("CONSENT");
  const consents = consentsQuery.data;

  // Asked only until a channel is granted, as Enquire does (user, 2026-10-18).
  // Once any of the three buttons has the permission, the others go straight on.
  if (step === "CONSENT" && !consents?.anyGranted) {
    if (!consents) {
      return consentsQuery.isError ? <VisitSheet direct enquiryId="" onClose={onDone} propertyId={propertyId} viewer="ENQUIRER" /> : null;
    }
    return <EnquiryConsentModal consents={consents} onClose={onDone} onGranted={() => setStep("SLOT")} />;
  }
  return <VisitSheet direct enquiryId="" onClose={onDone} propertyId={propertyId} viewer="ENQUIRER" />;
}

/**
 * A stay booked straight from the property profile (user, 2026-10-17). It
 * offers a visit first, which they may decline. Then the same consent step as
 * enquiring, then the booking form, opened on the record the server gives.
 */
export function BookAStayFlow({ onDone, propertyId }: { onDone: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const consentsQuery = useGetMyEnquiryChannelConsentsQuery();
  const [openDirectBooking, openState] = useOpenDirectBookingMutation();
  const [step, setStep] = useState<"CHOICE" | "VISIT" | "CONSENT">("CHOICE");
  const [refusal, setRefusal] = useState<string | null>(null);

  async function book() {
    try {
      const eligibility = await openDirectBooking(propertyId).unwrap();
      onDone();
      router.push({ pathname: "/booking-request", params: { enquiryId: eligibility.enquiryId } });
    } catch (error) {
      setRefusal(errorMessage(error));
    }
  }

  if (refusal) {
    return <AlertModal message={refusal} onClose={() => { setRefusal(null); onDone(); }} />;
  }
  if (step === "VISIT") {
    return <DirectVisitFlow onDone={onDone} propertyId={propertyId} />;
  }
  if (step === "CONSENT") {
    // Already granted: book() is on its way, so only the wait shows.
    if (openState.isLoading || consentsQuery.data?.anyGranted) {
      return <SheetShell onClose={onDone} title="Book a stay"><ActivityIndicator color={colors.primary} style={{ padding: spacing.lg }} /></SheetShell>;
    }
    if (!consentsQuery.data) {
      return null;
    }
    return <EnquiryConsentModal consents={consentsQuery.data} onClose={onDone} onGranted={() => void book()} />;
  }
  return <SheetShell onClose={onDone} title="">
    <View style={{ gap: spacing.md }}>
      <View style={{ alignItems: "center", gap: spacing.xs, paddingTop: spacing.xs }}>
        <Image accessibilityIgnoresInvertColors resizeMode="contain" source={VISIT_ARTWORK} style={{ height: 72, width: 72 }} />
        <ModalTitle accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, textAlign: "center" }}>Visit first?</ModalTitle>
        <Text style={[type.modalDescription, { color: colors.ink, textAlign: "center" }]}>Seeing the rooms first helps you choose well.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ActionButton label="Schedule a visit" onPress={() => setStep("VISIT")} variant="secondary" />
        <ActionButton label="Book without a visit" onPress={() => {
          setStep("CONSENT");
          if (consentsQuery.data?.anyGranted) {
            void book();
          }
        }} />
      </View>
    </View>
  </SheetShell>;
}
