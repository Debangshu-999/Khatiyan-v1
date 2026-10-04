import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { CalendarDays, MessageSquare, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { AppTextInput } from "@/components/app-text-input";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import { EnquiryConsentModal } from "@/features/discovery/components/enquiry-consent-modal";
import {
  ENQUIRY_MESSAGE_MAX_LENGTH,
  useChangeEnquiryMindMutation,
  useGetMyEnquiryChannelConsentsQuery,
  useGetMyEnquiryForPropertyQuery,
  useRaiseEnquiryMutation,
  type EnquiryChannelConsents,
  type EnquiryReceipt,
} from "@/store/services/enquiry-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The enquire button on a property profile, and everything behind it.
 *
 * <p>Three states decided by the server: offer the button, say "Enquiry sent"
 * when one is already open, or render nothing when the viewer manages the place.
 * The last two are the same `canEnquire: false` with different reasons — which
 * is why the endpoint returns a reason rather than a bare boolean.
 *
 * <p>A fourth state is decided here: when the check itself fails, fall OPEN and
 * offer the button. See the comment on `checkFailed`.
 */
export function EnquireAction({
  profileCard = false,
  propertyId,
  propertyName,
}: {
  profileCard?: boolean;
  propertyId: string;
  propertyName: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [enquiring, setEnquiring] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenRefusal, setReopenRefusal] = useState<string | null>(null);
  const [changeMind, changeMindState] = useChangeEnquiryMindMutation();
  const toast = useToast();

  const myEnquiryQuery = useGetMyEnquiryForPropertyQuery(propertyId);
  const myEnquiry = myEnquiryQuery.data;

  // Not property-scoped: the grant is a standing decision, so this is the same
  // answer on every profile and the same one account settings edits.
  const consentsQuery = useGetMyEnquiryChannelConsentsQuery();
  const consents = consentsQuery.data;

  function startEnquiry() {
    // A closed Not interested enquiry with its one reopen left: offer that
    // instead of a fresh enquiry (owner's rule, 2026-10-03). Once it is used,
    // the server expires the closed one when a new enquiry is raised.
    if (myEnquiry?.reopenableEnquiryId) {
      setReopening(true);
      return;
    }
    setEnquiring(true);
  }

  async function reopen(enquiryId: string, version: number) {
    try {
      await changeMind({ enquiryId, version }).unwrap();
      setReopening(false);
      toast.success("Your handler knows you are interested again.");
    } catch (caught) {
      setReopening(false);
      setReopenRefusal(readErrorMessage(caught) ?? "Could not reopen the enquiry. Try again.");
    }
  }

  // Nothing at all while it loads: a button that appears and then disappears
  // once the answer arrives is worse than one that arrives a moment late.
  if (!myEnquiry && myEnquiryQuery.isLoading) {
    return null;
  }

  // The check FAILED rather than answered — offer the button anyway. The server
  // re-enforces every rule on the POST and refuses with a readable message, so
  // the worst case is a clear error. Hiding it instead makes a broken request
  // indistinguishable from "you may not enquire here", which is unreadable from
  // the outside and sends anyone debugging it looking in the wrong place.
  const checkFailed = !myEnquiry;

  // Managing the place is not a state worth explaining on your own listing.
  if (!checkFailed && !myEnquiry.canEnquire && !myEnquiry.openEnquiryId) {
    return null;
  }

  const canEnquire = checkFailed || myEnquiry.canEnquire;

  return (
    <View style={{ gap: spacing.xs }}>
      {profileCard ? (
        <ProfileActionRow enabled={canEnquire} onEnquire={startEnquiry} />
      ) : canEnquire ? (
        <ActionButton icon={MessageSquare} label="Enquire about this property" onPress={startEnquiry} />
      ) : (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            justifyContent: "center",
            paddingVertical: spacing.md,
          }}
        >
          <MessageSquare color={colors.muted} size={16} strokeWidth={2.2} />
          <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 14 }}>
            Enquiry sent{myEnquiry?.openEnquiryAt ? ` · ${formatWhen(myEnquiry.openEnquiryAt)}` : ""}
          </Text>
        </View>
      )}

      {canEnquire && !profileCard ? (
        <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
          {describeWhatIsShared(consents)}
        </Text>
      ) : null}

      {enquiring ? (
        <EnquireFlow onDone={() => setEnquiring(false)} propertyId={propertyId} propertyName={propertyName} />
      ) : null}

      {/* The same question as My enquiries' "Changed your mind?". */}
      {reopening && myEnquiry?.reopenableEnquiryId ? (
        <ConfirmDialog
          bullets={[
            "This can only be done once.",
            "If this enquiry is marked not interested again, it cannot be reverted further.",
          ]}
          confirmLabel={changeMindState.isLoading ? "Sending" : "I'm interested"}
          message="Your earlier enquiry here was closed as not interested. Let your handler know you are interested again."
          onCancel={() => setReopening(false)}
          onConfirm={() => void reopen(myEnquiry.reopenableEnquiryId as string, myEnquiry.reopenableVersion ?? 0)}
          title="Are you interested in this property?"
        />
      ) : null}
      {reopenRefusal ? <AlertModal message={reopenRefusal} onClose={() => setReopenRefusal(null)} /> : null}
    </View>
  );
}

/**
 * Enquiring, start to finish: the consent question if nothing is shared yet,
 * then the message, then the receipt. The profile's Enquire button opens it,
 * and so does Enquire again on My enquiries (2026-10-03), which raises a new
 * enquiry rather than reopening the old one.
 */
export function EnquireFlow({
  onDone,
  propertyId,
  propertyName,
}: {
  /** Called once it is finished or abandoned, at whatever step. */
  onDone: () => void;
  propertyId: string;
  propertyName: string;
}) {
  const consentsQuery = useGetMyEnquiryChannelConsentsQuery();
  const consents = consentsQuery.data;
  const toast = useToast();
  const [step, setStep] = useState<"CONSENT" | "COMPOSE" | null>(null);

  /**
   * The consent modal comes FIRST, before composing.
   *
   * <p>Asking at send time would let someone write a message and then be
   * stopped, which turns a decision into an obstacle. Asked up front it is a
   * decision about what happens next.
   *
   * <p>If the consent check itself failed, go straight to composing and let the
   * server refuse.
   */
  useEffect(() => {
    if (step !== null || consentsQuery.isLoading) {
      return;
    }
    setStep(consents && !consents.anyGranted ? "CONSENT" : "COMPOSE");
  }, [consents, consentsQuery.isLoading, step]);

  if (step === "CONSENT" && consents) {
    return <EnquiryConsentModal consents={consents} onClose={onDone} onGranted={() => setStep("COMPOSE")} />;
  }
  if (step === "COMPOSE") {
    return (
      <EnquirySheet
        consents={consents}
        onClose={onDone}
        // Asked first in "Send enquiry?", so sent needs only a toast
        // (user, 2026-10-03).
        onSent={() => {
          toast.show("Enquiry sent.", "success");
          onDone();
        }}
        propertyId={propertyId}
        propertyName={propertyName}
      />
    );
  }
  return null;
}

/**
 * The profile's two actions side by side, both grey-filled (user, 2026-10-02):
 * Enquire, and Schedule Visit beside it. They live here together so a viewer
 * who manages the place, who gets no Enquire, gets no Schedule Visit either.
 *
 * <p>Schedule Visit is a placeholder until visit booking exists: it says so
 * rather than doing nothing on a tap.
 */
function ProfileActionRow({ enabled, onEnquire }: { enabled: boolean; onEnquire: () => void }) {
  const toast = useToast();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <GreyActionButton
        accessibilityLabel={enabled ? "Enquire about this property" : "Enquiry already sent"}
        disabled={!enabled}
        icon={MessageSquare}
        label={enabled ? "Enquire" : "Enquiry sent"}
        onPress={onEnquire}
      />
      <GreyActionButton
        icon={CalendarDays}
        label="Schedule Visit"
        onPress={() => toast.show("Visit scheduling is coming soon.", "info")}
      />
    </View>
  );
}

function GreyActionButton({
  accessibilityLabel,
  disabled = false,
  icon: Icon,
  label,
  onPress,
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  const ink = disabled ? colors.muted : colors.ink;
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        // A step greyer than neutralSoft, which all but vanished against the
        // profile's near-white ground (user, 2026-10-02).
        backgroundColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flex: 1,
        flexDirection: "row",
        gap: spacing.sm,
        justifyContent: "center",
        minHeight: 52,
        paddingHorizontal: spacing.md,
      }}
    >
      <Icon color={ink} size={18} strokeWidth={2.2} />
      <Text numberOfLines={1} style={{ color: ink, fontFamily: fonts.sansBold, fontSize: 14.5 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * What the property will actually be given, named rather than assumed.
 *
 * <p>This line used to promise "your name and phone" unconditionally, which was
 * true only because the phone went over whether or not anyone offered it. Now it
 * says what the enquirer's own grants say, so the sentence is a description
 * instead of a claim.
 */
function sharedDetailNames(consents: EnquiryChannelConsents | undefined) {
  // Locked channels are excluded: chat is always on and shares nothing, so
  // naming it here would pad the sentence with something nobody handed over.
  return (consents?.channels ?? [])
    .filter((option) => option.granted && !option.locked)
    .map((option) => (option.channel === "EMAIL" ? "email" : "phone"));
}

function describeWhatIsShared(consents: EnquiryChannelConsents | undefined) {
  const names = sharedDetailNames(consents);
  if (names.length === 0) {
    return "You will pick how they may reply before sending.";
  }
  return `They will see your name and ${names.join(" and ")} so they can reply.`;
}

function EnquirySheet({
  consents,
  onClose,
  onSent,
  propertyId,
  propertyName,
}: {
  consents: EnquiryChannelConsents | undefined;
  onClose: () => void;
  onSent: (receipt: EnquiryReceipt) => void;
  propertyId: string;
  propertyName: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [message, setMessage] = useState("");
  const form = useFormErrors<"message">();
  const [raiseEnquiry, raiseState] = useRaiseEnquiryMutation();
  // "Send enquiry?" before it goes (user, 2026-10-03). Cancel only closes the
  // question: the message stays in the field, and nothing is sent.
  const [confirming, setConfirming] = useState(false);

  const sharedNames = sharedDetailNames(consents);
  const trimmed = message.trim();
  // The number a call back would go to, when they agreed to one.
  const callBack = consents?.channels.find(
    (option) => option.channel === "CALL_BACK" && option.granted && option.available && option.target,
  );

  function askFirst() {
    if (!form.validate(trimmed ? {} : { message: "Write what you would like to ask." })) {
      return;
    }
    setConfirming(true);
  }

  async function submit() {
    setConfirming(false);
    try {
      onSent(await raiseEnquiry({ message: trimmed, propertyId }).unwrap());
    } catch (caught) {
      form.failFromServer(readErrorMessage(caught) ?? "Could not send the enquiry. Try again.");
    }
  }

  // animated, not dismissOnDrag — the payment-attempts sheet's entrance and
  // fading backdrop, without the pan gesture, which would fight the message
  // field's keyboard and the scroll under it.
  return (
    <SheetShell animated onClose={onClose} title="Enquire">
      {/* Names what was actually consented to rather than assuming phone. Someone
          who declined the call-back should not be told their number is going
          over on the very screen where they send the message. */}
      <Text style={[type.modalDescription, { color: colors.muted }]}>
        {sharedNames.length > 0
          ? `${propertyName} will see your name and ${sharedNames.join(" and ")} so they can reply.`
          : `${propertyName} will only be able to reply in the app.`}
      </Text>

      <View style={{ gap: spacing.xs }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "800" }]}>
          Your message
        </Text>
        <AppTextInput
          autoFocus
          maxLength={ENQUIRY_MESSAGE_MAX_LENGTH}
          multiline
          onChangeText={(next) => {
            setMessage(next);
            form.clearField("message");
          }}
          placeholder="Is a single AC room available from the 1st of next month?"
          placeholderTextColor={colors.kicker}
          style={{
            borderColor: colors.borderStrong,
            borderRadius: 14,
            borderWidth: 1.5,
            color: colors.ink,
            fontFamily: fonts.sansMedium,
            fontSize: 15,
            minHeight: 104,
            padding: spacing.md,
            textAlignVertical: "top",
          }}
          value={message}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={[type.caption, { color: form.errors.message ? colors.danger : colors.kicker, flex: 1 }]}>
            {form.errors.message ?? " "}
          </Text>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {trimmed.length} / {ENQUIRY_MESSAGE_MAX_LENGTH}
          </Text>
        </View>
      </View>

      <ActionButton
        disabled={raiseState.isLoading || !trimmed || form.blocked}
        icon={MessageSquare}
        label={raiseState.isLoading ? "Sending…" : "Send enquiry"}
        onPress={askFirst}
      />
      {/* One paragraph, no points (user, 2026-10-03). Chat always works. A
          call back is named only when they agreed to one. Email is no longer a
          way to reply, so nothing is said about verifying one. */}
      {confirming ? (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel="Send enquiry"
          message={
            callBack
              ? `${propertyName} management will reach out to you soon, over chat here in the app or with a call back on ${callBack.target}.`
              : `${propertyName} management will reach out to you soon over chat here in the app.`
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() => void submit()}
          title="Send enquiry?"
        />
      ) : null}
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}


function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}
