import { useState, type RefObject } from "react";
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { BlurView } from "expo-blur";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useToast } from "@/components/toast";
import { BookAStayFlow, DirectVisitFlow } from "@/features/discovery/components/direct-booking-flows";
import { EnquireFlow } from "@/features/discovery/components/enquire-action";
import { errorMessage } from "@/features/forms/server-error";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import { useChangeEnquiryMindMutation, useGetMyEnquiryForPropertyQuery } from "@/store/services/enquiry-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/** The Enquiries screen's empty-state picture, the Visits tool's and the Bookings tool's, on Home. */
const ENQUIRE_ARTWORK = require("../../../../assets/empty-states/enquiries.png");
const VISIT_ARTWORK = require("../../../../assets/images/workspace/manage_visits.png");
const BOOKING_ARTWORK = require("../../../../assets/icons/home-tools/bookings.png");

/** The row's height. The screen needs it to know when the one in the page is in full view. */
export const PROFILE_ACTIONS_HEIGHT = 60;

/**
 * The property profile's three actions, in one row (user, 2026-10-17):
 * Enquire, Visit and Booking. The row floats at the bottom centre of the
 * profile, clear of the tab bar, and when the page reaches its end it rests
 * just below Contacts. Both are drawn from here, and the sheets behind the
 * buttons are mounted once.
 *
 * <p>Who sees what: nothing for someone who manages the place. Someone who
 * stays there may enquire, and books no visit or stay there, which the server
 * refuses too. Enquire reads "Enquiry sent" while one is open, as it did.
 *
 * @return the row, drawn floating or resting, null when there is nothing to
 *         offer; and the sheets, to mount once on the screen
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

  function row(floating: boolean, blurTarget?: RefObject<View | null>) {
    if (!available) return null;
    return <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <GlassActionButton
        artwork={ENQUIRE_ARTWORK}
        blurTarget={blurTarget}
        disabled={!canEnquire}
        floating={floating}
        label={canEnquire ? "Enquire" : "Enquiry sent"}
        onPress={enquire}
      />
      {staysHere ? null : <GlassActionButton artwork={VISIT_ARTWORK} blurTarget={blurTarget} floating={floating} label="Visit" onPress={() => setStep("VISIT")} />}
      {staysHere ? null : <GlassActionButton artwork={BOOKING_ARTWORK} blurTarget={blurTarget} floating={floating} label="Booking" onPress={() => setStep("BOOKING")} />}
    </View>;
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

  return { available, row, sheets };
}

/**
 * One of the profile's actions on frosted glass (user, 2026-10-17): a
 * rectangle with rounded corners, a picture beside its name, the page showing
 * through, as the owner Home screen's top does. Floating it wears the shadow a
 * phone draws. Resting in the page it has a border instead.
 *
 * @param blurTarget what the glass blurs on Android, where a blur sees only
 *                   inside a BlurTargetView. The floating row passes the page's
 */
export function GlassActionButton({
  artwork,
  blurTarget,
  disabled = false,
  floating = false,
  label,
  onPress,
}: {
  artwork: ImageSourcePropType;
  blurTarget?: RefObject<View | null>;
  disabled?: boolean;
  floating?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  return <AnimatedPressable
    accessibilityLabel={label}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={{
      borderRadius: radii.card + 6,
      flex: 1,
      height: PROFILE_ACTIONS_HEIGHT,
      minWidth: 0,
      // The shadow a phone draws too: the profile sits on the Discover tab, where the shared hook keeps the
      // tab screens' old one, which only a browser draws.
      ...(floating ? softShadow(colors.shadow, 6, 18) : {}),
    }}
  >
    {/* The rounding and clipping belong to a plain View around the blur, which does not clip itself on Android. */}
    <View style={{
      borderColor: !floating ? colors.borderStrong : isDark ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.7)",
      borderRadius: radii.card + 6,
      borderWidth: 1,
      flex: 1,
      overflow: "hidden",
    }}>
      {floating ? <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={blurTarget}
        intensity={isDark ? 55 : 60}
        style={StyleSheet.absoluteFill}
        tint={isDark ? "dark" : "light"}
      /> : null}
      {/* The translucent wash: all the glass an older phone gets, and the ground when it rests in the page. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(16, 16, 16, 0.55)" : "rgba(255, 255, 255, 0.55)" }]} />
      <View style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", paddingHorizontal: spacing.sm }}>
        <Image accessibilityIgnoresInvertColors resizeMode="contain" source={artwork} style={{ height: 30, width: 30 }} />
        <FitText numberOfLines={1} minimumFontScale={0.8} style={{ color: disabled ? colors.muted : colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>{label}</FitText>
      </View>
    </View>
  </AnimatedPressable>;
}
