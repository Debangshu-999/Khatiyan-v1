import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { Mail, MessageSquare, Phone } from "lucide-react-native";

import { Card } from "@/components/card";
import { useToast } from "@/components/toast";
import { AccountEnquiryRepliesSkeleton } from "@/components/skeletons/account";
import { ConsentTick } from "@/features/compliance/clickwrap-consent";
import {
  describeChannelName,
  describeEmailChannelGapShort,
  useGetMyEnquiryChannelConsentsQuery,
  useUpdateEnquiryChannelConsentsMutation,
  type EnquiryChannelOption,
  type EnquiryResponseChannel,
} from "@/store/services/enquiry-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The standing decision about how a property may reply to an enquiry.
 *
 * <p>No modal here. The consent modal belongs on the property profile, where
 * someone is about to enquire and the decision has a reason to be made — putting
 * it on a settings screen too would ask the same question in two shapes. This is
 * the same two controls laid flat: the switches say WHICH details, the tick
 * under them is the agreement to share them.
 *
 * <p>The tick gates the switches rather than sitting beside them as decoration.
 * Untick it and every live grant is withdrawn, because it is the agreement the
 * grants rest on, not a preference of its own.
 */
export function EnquiryReplySettings() {
  const { colors, type } = useTheme();
  const toast = useToast();
  const consentsQuery = useGetMyEnquiryChannelConsentsQuery();
  const [save, saveState] = useUpdateEnquiryChannelConsentsMutation();

  const consents = consentsQuery.data;
  const anyGranted = consents?.anyGranted ?? false;

  /**
   * Null until the person touches the tick — then it is theirs.
   *
   * <p>Holding a grant IS having agreed, so it SHOWS ticked for anyone who has
   * one. But it must not keep following the server: mirroring `anyGranted` meant
   * switching off your last channel silently unticked the agreement and disabled
   * both switches, so turning it back on needed a re-tick nobody asked for.
   *
   * <p>Unlike the modal, which always opens blank — there the agreement is being
   * made, here it is being shown back.
   */
  const [ticked, setTicked] = useState<boolean | null>(null);
  const agreed = ticked ?? anyGranted;

  if (consentsQuery.isLoading && !consents) {
    return <AccountEnquiryRepliesSkeleton />;
  }

  if (!consents) {
    return null;
  }

  const live = consents.channels
    .filter((option) => option.granted && !option.locked)
    .map((option) => option.channel);

  /** `message` null means say nothing — the switch moving is the confirmation. */
  async function apply(channels: EnquiryResponseChannel[], message: string | null) {
    try {
      await save({ agreed: true, channels }).unwrap();
      if (message) {
        toast.show(message, "success");
      }
    } catch {
      toast.show("Could not change that. Try again.", "error");
    }
  }

  function toggleChannel(channel: EnquiryResponseChannel, on: boolean) {
    const next = on ? [...live, channel] : live.filter((each) => each !== channel);
    // Nothing on the way up. The switch itself already says what happened, and a
    // toast for it was one confirmation too many. Turning something OFF still
    // speaks, because that one has a consequence worth naming.
    void apply(next, on ? null : `${describeChannelName(channel)} turned off for new enquiries.`);
  }

  function toggleAgreement() {
    // Ticking grants nothing on its own — there is no channel picked yet, and a
    // tick that silently switched things on would be agreeing on someone's
    // behalf. Unticking is a withdrawal and takes everything with it.
    if (agreed) {
      setTicked(false);
      if (live.length > 0) {
        void apply([], "Reply channels turned off.");
      }
      return;
    }
    setTicked(true);
  }

  return (
    <Card>
      {/* The options remain one bounded group. The agreement is visually
          separate because it gates the channel rows, while the outer card now
          keeps the complete setting together as one account section. */}
      <View
        style={{
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
        }}
      >
        {consents.channels.map((option, index) => (
          <ChannelPreferenceRow
            busy={saveState.isLoading}
            canChange={agreed}
            first={index === 0}
            key={option.channel}
            onToggle={(on) => toggleChannel(option.channel, on)}
            option={option}
            unavailableNote={option.channel === "EMAIL" ? describeEmailChannelGapShort(consents.emailChannelState) : null}
          />
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ConsentTick checked={agreed} onToggle={toggleAgreement} />
        <Text style={[type.caption, { color: colors.inkSoft, flex: 1, lineHeight: 19 }]}>
          I agree to share the contact details I picked with the properties I enquire to.
        </Text>
      </View>
    </Card>
  );
}

function ChannelPreferenceRow({
  busy,
  canChange,
  first,
  onToggle,
  option,
  unavailableNote,
}: {
  busy: boolean;
  canChange: boolean;
  first: boolean;
  onToggle: (on: boolean) => void;
  option: EnquiryChannelOption;
  unavailableNote: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const Icon = ICONS[option.channel];

  const description = option.locked
    ? "In the app. This one cannot be turned off."
    : (option.target ?? unavailableNote ?? "Not available on your account");

  return (
    // A hairline between rows rather than a Divider under each: the last one
    // would otherwise draw a rule immediately above the box's own bottom edge,
    // which is two lines doing one line's job.
    <View
      style={{
        alignItems: "center",
        borderTopColor: colors.border,
        borderTopWidth: first ? 0 : 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      {/* Bare glyph, no outlined box. Three rows of identical squares read as a
          list of buttons rather than a list of settings, and there is nothing to
          press here except the switch on the right. */}
      <View style={{ alignItems: "center", width: 24 }}>
        <Icon color={colors.ink} size={19} strokeWidth={2} />
      </View>

      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {describeChannelName(option.channel)}
        </Text>
        <Text numberOfLines={2} style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>
          {description}
        </Text>
      </View>

      {/* A locked channel gets words, not a dead switch. A switch nobody can move
          is a control that looks broken. */}
      {option.locked ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 12 }}>Default</Text>
      ) : (
        <Switch
          disabled={busy || !option.available || !canChange}
          onValueChange={onToggle}
          thumbColor={colors.surface}
          trackColor={{ false: colors.neutralSoft, true: colors.primary }}
          value={option.granted}
        />
      )}
    </View>
  );
}

const ICONS: Record<EnquiryResponseChannel, typeof Phone> = {
  CALL_BACK: Phone,
  CHAT: MessageSquare,
  EMAIL: Mail,
};
