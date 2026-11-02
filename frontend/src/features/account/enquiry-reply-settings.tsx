import { useState } from "react";
import { Text, View } from "react-native";
import { Mail, MessageSquare, Phone } from "lucide-react-native";

import { LoadFailedCard, loadFailure } from "@/components/load-failed";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast";
import { AccountEnquiryRepliesSkeleton } from "@/components/skeletons/account";
import { ConsentTick } from "@/features/compliance/clickwrap-consent";
import { ActionButton } from "@/features/owner/owner-ui";
import { formatIndianPhone } from "@/features/owner/phone-display";
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
import { FitText } from "@/components/fit-text";

/**
 * The standing decision about how a property may reply to an enquiry.
 *
 * <p>No modal here. The consent modal belongs on the property profile, where
 * someone is about to enquire and the decision has a reason to be made — putting
 * it on a settings screen too would ask the same question in two shapes. This is
 * the same thing laid flat: the list says what would be shared, and the tick under
 * it is the agreement to share it. Untick it and the grant is withdrawn.
 *
 * <p><b>Nothing applies until Save (user, 2026-10-18).</b> The tick is a draft. Save
 * is enabled only while it differs from what is saved.
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
   * <p>Holding a grant IS having agreed, so it SHOWS ticked for anyone who has one.
   *
   * <p>Unlike the modal, which always opens blank — there the agreement is being
   * made, here it is being shown back.
   */
  const [ticked, setTicked] = useState<boolean | null>(null);
  const agreed = ticked ?? anyGranted;

  const loadFailed = loadFailure(consentsQuery);
  if (loadFailed) {
    return <LoadFailedCard error={loadFailed.error} onReload={loadFailed.reload} />;
  }

  if (consentsQuery.isLoading && !consents) {
    return <AccountEnquiryRepliesSkeleton />;
  }

  if (!consents) {
    return null;
  }

  const saved = consents.channels
    .filter((option) => option.granted && !option.locked)
    .map((option) => option.channel);
  // Phone is the only choice beside chat, so the one tick shares what is listed, and
  // unticking withdraws it (user, 2026-11-02). Nothing applies until Save.
  const picked = agreed
    ? consents.channels.filter((option) => option.available && !option.locked).map((option) => option.channel)
    : [];
  const changed = picked.length !== saved.length || picked.some((channel) => !saved.includes(channel));

  async function submit() {
    try {
      await save({ agreed, channels: picked }).unwrap();
      toast.show(picked.length === 0 ? "Reply channels turned off." : "Contact permission saved.", "success");
    } catch {
      toast.show("Could not save that. Try again.", "error");
    }
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
            first={index === 0}
            key={option.channel}
            option={option}
            unavailableNote={option.channel === "EMAIL" ? describeEmailChannelGapShort(consents.emailChannelState) : null}
          />
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ConsentTick checked={agreed} onToggle={() => setTicked(!agreed)} />
        <Text style={[type.caption, { color: colors.inkSoft, flex: 1, lineHeight: 19 }]}>
          I agree to share the contact details above with the properties I enquire to.
        </Text>
      </View>

      {/* In a row, because ActionButton grows to fill a column. */}
      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={!changed || saveState.isLoading}
          label={saveState.isLoading ? "Saving…" : "Save"}
          onPress={() => void submit()}
        />
      </View>
    </Card>
  );
}

function ChannelPreferenceRow({
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

  const description = option.locked
    ? "In the app. This one cannot be turned off."
    : ((option.target && isPhone ? formatIndianPhone(option.target) : option.target) ?? unavailableNote ?? "Not available on your account");

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
          press here. */}
      <View style={{ alignItems: "center", width: 24 }}>
        <Icon color={colors.ink} size={19} strokeWidth={2} />
      </View>

      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {describeChannelName(option.channel)}
        </Text>
        <FitText numberOfLines={2} style={[type.description, { color: colors.muted }, isPhone ? { fontFamily: fonts.sansMedium } : null]}>
          {description}
        </FitText>
      </View>

      {option.locked ? (
        <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 12 }}>Default</Text>
      ) : null}
    </View>
  );
}

const ICONS: Record<EnquiryResponseChannel, typeof Phone> = {
  CALL_BACK: Phone,
  CHAT: MessageSquare,
  EMAIL: Mail,
};
