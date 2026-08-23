import { useState } from "react";
import { Text, View } from "react-native";
import { MessageSquare } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { AppTextInput } from "@/components/app-text-input";
import { SheetShell } from "@/components/sheet-shell";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import {
  describeEmailChannelGap,
  describeReachableChannel,
  ENQUIRY_MESSAGE_MAX_LENGTH,
  useGetMyEnquiryForPropertyQuery,
  useRaiseEnquiryMutation,
  type EnquiryReceipt,
} from "@/store/services/enquiry-api";
import { spacing } from "@/theme/spacing";
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
export function EnquireAction({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const { colors, fonts, type } = useTheme();
  const [composing, setComposing] = useState(false);
  const [receipt, setReceipt] = useState<EnquiryReceipt | null>(null);

  const myEnquiryQuery = useGetMyEnquiryForPropertyQuery(propertyId);
  const myEnquiry = myEnquiryQuery.data;

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
      {canEnquire ? (
        <ActionButton icon={MessageSquare} label="Enquire about this property" onPress={() => setComposing(true)} />
      ) : (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 14,
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

      {canEnquire ? (
        <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
          They will see your name and phone so they can reply.
        </Text>
      ) : null}

      {composing ? (
        <EnquirySheet
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

function EnquirySheet({
  onClose,
  onSent,
  propertyId,
  propertyName,
}: {
  onClose: () => void;
  onSent: (receipt: EnquiryReceipt) => void;
  propertyId: string;
  propertyName: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [message, setMessage] = useState("");
  const form = useFormErrors<"message">();
  const [raiseEnquiry, raiseState] = useRaiseEnquiryMutation();

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

  return (
    <SheetShell onClose={onClose} title="Enquire">
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        {propertyName} will see your name and phone so they can reply.
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
