import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Mail, MessageSquare, Phone } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { SheetShell } from "@/components/sheet-shell";
import { ConsentTick } from "@/features/compliance/clickwrap-consent";
import { ActionButton } from "@/features/owner/owner-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
import {
  describeChannelName,
  describeEmailChannelGapShort,
  useUpdateEnquiryChannelConsentsMutation,
  type EnquiryChannelConsents,
  type EnquiryChannelOption,
  type EnquiryResponseChannel,
} from "@/store/services/enquiry-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/**
 * The agreement an enquirer makes before a property can be given a way to
 * contact them.
 *
 * <p>The list says what would be shared, and the one tick is the agreement to
 * share it (user, 2026-11-02: with phone the only choice beside chat, a box on
 * its row and the agreement were two ticks for one decision).
 *
 * <p>The tick opens unticked and stays that way. A pre-ticked box is a default
 * nobody chose, which is exactly what this modal exists to replace.
 */
export function EnquiryConsentModal({
  consents,
  onClose,
  onGranted,
}: {
  consents: EnquiryChannelConsents;
  onClose: () => void;
  onGranted: () => void;
}) {
  const { colors, type } = useTheme();
  const [save, saveState] = useUpdateEnquiryChannelConsentsMutation();
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  // With phone the only channel to choose beyond chat, there is nothing to pick: the one tick
  // agrees to share what is listed above it (user, 2026-11-02).
  const shareable = consents.channels
    .filter((option) => option.available && !option.locked)
    .map((option) => option.channel);
  const emailGap = useMemo(() => describeEmailChannelGapShort(consents.emailChannelState), [consents.emailChannelState]);

  // The tick alone. Needing a channel picked as well left the button dead with
  // nothing on screen explaining why, once the note under it came out — and a
  // disabled control that will not say what it wants is worse than one that
  // answers when pressed.
  const ready = agreed;

  async function submit() {
    if (!ready) {
      return;
    }
    // A refusal, in the app's refusal channel. Until answering over chat is
    // wired, an enquiry with no phone and no email is one nobody can reply to,
    // so it is stopped here rather than at send time with the message half
    // written.
    if (shareable.length === 0) {
      setError("Add a phone number to your account so they can reply to your enquiry.");
      return;
    }
    try {
      await save({ agreed, channels: shareable }).unwrap();
      onGranted();
    } catch (caught) {
      setError(readErrorMessage(caught) ?? "Could not save that. Try again.");
    }
  }

  /*
   * SheetShell, not a hand-rolled centred dialog.
   *
   * The dialog this replaces measured its own height WITHOUT its last child,
   * whatever that child was — on device it reported 326.4pt while its final row
   * ended at 341.3 — so the bottom of the content drew straight through the
   * white surface. It survived a ScrollView, a maxHeight, three rounds of
   * trimming, every `gap` becoming a margin, and a flat rebuild. The last child
   * always spilled.
   *
   * SheetShell owns the modal, the backdrop, the safe-area padding and the
   * scrolling, and the compose sheet next door already renders through it on
   * the same screen. A bottom sheet instead of a centred card is no loss for a
   * sheet of choices.
   *
   * `dismissOnDrag` for the entrance, not for the drag. The platform's slide
   * moves the whole modal WINDOW, backdrop and all, so the top of the screen
   * sat undimmed for the length of the animation and read as the page flashing
   * through. This runs the entrance by hand instead: the backdrop fades in
   * place while only the sheet travels. Drag-to-dismiss comes with it, which
   * suits a sheet that is read rather than filled in — there is no input here
   * for a drag to fight.
   */
  return (
    <SheetShell contentMaxSize="tall" dismissOnDrag onClose={onClose} size="content" title="Contact permission">
      <View
        style={{
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
        }}
      >
        {consents.channels.map((option, index) => (
          <ChannelRow
            first={index === 0}
            key={option.channel}
            option={option}
            unavailableNote={option.channel === "EMAIL" ? emailGap : null}
          />
        ))}
      </View>

      {/* No card around this one. The list above is a bounded group and earns its
          border, but the agreement is a single line you tick — boxing it made two
          panels of equal weight and buried which one was the decision. */}
      <View style={{ flexDirection: "row" }}>
        <ConsentTick checked={agreed} onToggle={() => setAgreed((current) => !current)} />
        <Text style={[type.caption, { color: colors.inkSoft, flex: 1, lineHeight: 19, marginLeft: spacing.sm }]}>
          I agree to share the contact details above with the property I enquire to.
        </Text>
      </View>

      <ActionButton
        disabled={!ready || saveState.isLoading}
        label={saveState.isLoading ? "Saving…" : "Save and continue"}
        onPress={() => void submit()}
      />
      {/* Inside the sheet, exactly as the compose sheet next door does it.
        That one renders on device and this one did not, and the fragment
        wrapping a Modal plus a sibling Modal was the only structural
        difference between them. */}
      {error ? <AlertModal message={error} onClose={() => setError(null)} /> : null}
    </SheetShell>
  );
}

/**
 * One channel, with the detail it would actually share written underneath.
 *
 * <p>Showing the number rather than just "Phone call" is the point: this is the
 * one screen where someone decides whether to hand it over, and a decision about
 * a value you cannot see is not much of a decision.
 *
 * <p>Chat shares nothing, so there is nothing to agree to and nothing to withdraw.
 * Its line says "In the app, by default". It is shown rather than assumed because
 * "they can always reach me in the app" is the reassurance that makes declining
 * phone a reasonable choice.
 */
function ChannelRow({
  first,
  option,
  unavailableNote,
}: {
  first: boolean;
  option: EnquiryChannelOption;
  unavailableNote: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const Icon = ICONS[option.channel];
  const isPhone = option.channel === "CALL_BACK";

  return (
    <View style={{ borderTopColor: colors.border, borderTopWidth: first ? 0 : 1 }}>
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          // Locked stays at full strength. Dimming it would read as unavailable,
          // which is the opposite of what it is.
          opacity: option.available ? 1 : 0.55,
          // Tighter vertically than horizontally. Three of these stacked is most
          // of the dialog's height, and the rule between rows already separates
          // them.
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
        }}
      >
        <Icon color={colors.inkSoft} size={17} strokeWidth={2.2} />

        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
            {describeChannelName(option.channel)}
          </Text>
          {/* Two lines, because this slot carries the reason a channel is
              unavailable as well as the value it would share. Clipped to one,
              "Verify your email to enable that channel" lost the instruction and
              kept the preamble. */}
          <FitText
            numberOfLines={2}
            style={[
              type.caption,
              {
                color: colors.muted,
                fontFamily: isPhone ? fonts.sansMedium : undefined,
                // Was the column's `gap: 2`, moved onto the child with every
                // other gap in this file.
                marginTop: 2,
              },
            ]}
          >
            {option.locked
              ? "In the app, by default"
              : ((option.target && isPhone ? formatIndianPhone(option.target) : option.target) ?? unavailableNote ?? "Not available on your account")}
          </FitText>
        </View>
      </View>
    </View>
  );
}

const ICONS: Record<EnquiryResponseChannel, typeof Phone> = {
  CALL_BACK: Phone,
  CHAT: MessageSquare,
  EMAIL: Mail,
};

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}
