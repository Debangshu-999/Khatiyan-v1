import { useState } from "react";
import { Text, View } from "react-native";
import { ChevronRight, MessageSquare } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { AppTextInput } from "@/components/app-text-input";
import { SheetShell } from "@/components/sheet-shell";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import { EnquiryConsentModal } from "@/features/discovery/components/enquiry-consent-modal";
import {
  describeEmailChannelGap,
  describeReachableChannel,
  ENQUIRY_MESSAGE_MAX_LENGTH,
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
  const [composing, setComposing] = useState(false);
  const [consenting, setConsenting] = useState(false);
  const [receipt, setReceipt] = useState<EnquiryReceipt | null>(null);

  const myEnquiryQuery = useGetMyEnquiryForPropertyQuery(propertyId);
  const myEnquiry = myEnquiryQuery.data;

  // Not property-scoped: the grant is a standing decision, so this is the same
  // answer on every profile and the same one account settings edits.
  const consentsQuery = useGetMyEnquiryChannelConsentsQuery();
  const consents = consentsQuery.data;

  /**
   * The consent modal comes FIRST, before composing.
   *
   * <p>Asking at send time would let someone write a message and then be
   * stopped, which turns a decision into an obstacle. Asked up front it is a
   * decision about what happens next.
   *
   * <p>If the consent check itself failed, go straight to composing and let the
   * server refuse — same reasoning as `checkFailed` below.
   */
  function startEnquiry() {
    if (consents && !consents.anyGranted) {
      setConsenting(true);
      return;
    }
    setComposing(true);
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
        <ProfileEnquiryCard
          enabled={canEnquire}
          helper={
            canEnquire
              ? "Property management can see your name and reply over chat and other channels selected by you."
              : "The property has received your enquiry."
          }
          onPress={startEnquiry}
        />
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

      {consenting && consents ? (
        <EnquiryConsentModal
          consents={consents}
          onClose={() => setConsenting(false)}
          onGranted={() => {
            setConsenting(false);
            setComposing(true);
          }}
        />
      ) : null}

      {composing ? (
        <EnquirySheet
          consents={consents}
          onClose={() => setComposing(false)}
          onSent={(sent) => {
            setComposing(false);
            setReceipt(sent);
          }}
          propertyId={propertyId}
          propertyName={propertyName}
        />
      ) : null}

      {receipt ? <EnquirySentDialog onClose={() => setReceipt(null)} receipt={receipt} /> : null}
    </View>
  );
}

function ProfileEnquiryCard({
  enabled,
  helper,
  onPress,
}: {
  enabled: boolean;
  helper: string;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={enabled ? "Enquire about this property" : "Enquiry already sent"}
      accessibilityRole="button"
      disabled={!enabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
        shadowColor: colors.shadow,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      }}
    >
      <MessageSquare color={colors.inkSoft} size={26} strokeWidth={1.9} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 15 }}>
          Enquire about this property
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontFamily: fonts.sans,
            fontSize: 11.5,
            lineHeight: 16,
          }}
        >
          {helper}
        </Text>
      </View>
      <ChevronRight color={enabled ? colors.primary : colors.kicker} size={21} strokeWidth={2.2} />
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

  const sharedNames = sharedDetailNames(consents);
  const trimmed = message.trim();

  async function submit() {
    if (!form.validate(trimmed ? {} : { message: "Write what you would like to ask." })) {
      return;
    }
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
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
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
        onPress={() => void submit()}
      />
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}

/**
 * Confirms the enquiry landed and, more usefully, tells them how they will be
 * contacted — from the server's own list, so it cannot promise a channel the
 * owner is not allowed to pick.
 */
function EnquirySentDialog({ onClose, receipt }: { onClose: () => void; receipt: EnquiryReceipt }) {
  return (
    <ConfirmDialog
      acknowledgeOnly
      bullets={receipt.reachableChannels.map(describeReachableChannel)}
      confirmLabel="Got it"
      footnote={describeEmailChannelGap(receipt.emailChannelState) ?? undefined}
      message={`${receipt.propertyName} management will reach out to you soon.`}
      onCancel={onClose}
      onConfirm={onClose}
      title="Enquiry sent"
    />
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
