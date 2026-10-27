import { useState } from "react";
import { Text, View } from "react-native";
import { CalendarDays, CircleHelp, Copy, ShieldAlert, UserPlus } from "lucide-react-native";

import { Card } from "@/components/card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { StatusNote } from "@/features/enquiry/enquiry-tags";
import { BookingInfoBand } from "@/features/booking/tenant-booking-parts";
import { LEAD_KIND_LABEL, leadBand, leadFacts } from "@/features/lead/lead-display";
import { ActionButton } from "@/features/owner/owner-ui";
import type { Lead, LeadKind } from "@/store/services/lead-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

/**
 * One lead on the Leads screen (user's design, 2026-10-17): the name and its
 * short code with the stage chip beside them, who handles it and the one fact
 * its stage turns on, the line that says what comes next, then View details
 * and Follow up.
 *
 * <p>Follow up is there only while an enquiry is still open and the reader may
 * answer it. View details then fills the row.
 *
 * <p>On a stage's tab the tab already says the stage, so no stage chip
 * (user, 2026-10-17). The Duplicate or Potential spam chip takes its place,
 * with a ? that says why. With nothing to say there is no chip.
 *
 * @param showKind the stage chip too: for a list that mixes stages, a filter's
 */
export function LeadCard({ lead, onFollowUp, onOpen, showKind = false }: { lead: Lead; onFollowUp: () => void; onOpen: () => void; showKind?: boolean }) {
  const { colors, fonts, type } = useTheme();
  const band = leadBand(lead);
  const canFollowUp = Boolean(lead.followUpEnquiryId && lead.viewerMayFollowUp);
  return <Card style={{ gap: spacing.sm, padding: spacing.md }}>
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <FitText numberOfLines={1} style={[type.display, { color: colors.ink, fontSize: 18, lineHeight: 23 }]}>{cardName(lead.prospectName ?? "Someone")}</FitText>
        {/* The code under the name a size down from the card's other lines (user, 2026-10-17). */}
        <Text selectable style={[type.description, { color: colors.muted, fontSize: 10.5, lineHeight: 14 }]}>{lead.referenceCode}</Text>
      </View>
      {showKind || lead.repeat || lead.external ? <View style={{ alignItems: "flex-end", gap: 6 }}>
        {showKind ? <LeadKindChip kind={lead.kind} /> : null}
        {lead.repeat ? <LeadRepeatChip repeat={lead.repeat} /> : null}
        {lead.external ? <ExternalChip /> : null}
      </View> : null}
    </View>

    {/* The facts side by side across the card, a label over each value with a rule between, so the row
        is used to its end and does not leave its right half empty (user, 2026-10-17). */}
    <View style={{ flexDirection: "row" }}>
      {leadFacts(lead).map((fact, index) => <View key={fact.label} style={{ flexDirection: "row", flex: fact.label === "Handler" ? 1.5 : 1, minWidth: 0 }}>
        {index > 0 ? <View style={{ alignSelf: "stretch", backgroundColor: colors.border, marginHorizontal: spacing.sm, width: 1 }} /> : null}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <FitText numberOfLines={1} style={[type.description, { color: colors.muted }]}>{fact.label}</FitText>
          <FitText numberOfLines={1} style={[type.description, { color: colors.ink, fontFamily: fonts.sansBold }]}>{fact.value}</FitText>
        </View>
      </View>)}
    </View>

    {band ? <BookingInfoBand icon={CalendarDays} iconGap={6} iconInset={10} tone={band.tone}>
      <Text style={[type.description, { color: colors.ink }]}>
        {band.text}{band.strong ? <Text style={{ fontFamily: fonts.sansBold }}>{` ${band.strong}`}</Text> : null}
      </Text>
    </BookingInfoBand> : null}

    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <ActionButton label="View details" onPress={onOpen} variant="secondary" />
      {canFollowUp ? <ActionButton label="Follow up" onPress={onFollowUp} /> : null}
    </View>
  </Card>;
}

/**
 * Someone the property recorded itself, a walk-in or a phone booking, who has
 * no account (user, 2026-10-19). Grey, as a fact and not a state.
 */
export function ExternalChip() {
  const { colors, fonts } = useTheme();
  return <View accessibilityLabel="External" style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderRadius: 999, flexDirection: "row", gap: 5, paddingHorizontal: 10, paddingVertical: 6 }}>
    <UserPlus color={colors.neutralText} size={13} strokeWidth={2.3} />
    <Text style={{ color: colors.neutralText, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>External</Text>
  </View>;
}

/** The stage, on a soft tint. Pale blue for a lead in play, as the user's design has it. */
export function LeadKindChip({ kind }: { kind: LeadKind }) {
  const { colors, fonts } = useTheme();
  const { label, tone } = LEAD_KIND_LABEL[kind];
  const [backgroundColor, color] = {
    primary: [colors.primarySoft, colors.primaryDeep],
    success: [colors.successSoft, colors.successText],
    danger: [colors.dangerSoft, colors.danger],
    neutral: [colors.neutralSoft, colors.neutralText],
  }[tone];
  return <View accessibilityLabel={label} style={{ backgroundColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
    <Text style={{ color, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>{label}</Text>
  </View>;
}

/**
 * Duplicate or potential spam, as a chip with no words of why, and a ? beside
 * it that opens why in a sheet from the bottom (user, 2026-10-17). The Leads
 * screen's cards only. The lead details keep the note with its reason.
 */
export function LeadRepeatChip({ repeat }: { repeat: NonNullable<Lead["repeat"]> }) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  const spam = repeat.flag === "POTENTIAL_SPAM";
  const label = spam ? "Potential spam" : "Duplicate";
  const Icon = spam ? ShieldAlert : Copy;
  const [backgroundColor, color] = spam ? [colors.dangerSoft, colors.danger] : [colors.warningSoft, colors.warningText];
  return <>
    {/* The ? is part of the chip, a small mark inside its fill, and the whole chip opens why (user, 2026-10-17). */}
    <AnimatedPressable
      accessibilityHint="Says why"
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => setOpen(true)}
      style={{ alignItems: "center", backgroundColor, borderRadius: 999, flexDirection: "row", gap: 5, paddingHorizontal: 10, paddingVertical: 6 }}
    >
      <Icon color={color} size={13} strokeWidth={2.3} />
      <Text style={{ color, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>{label}</Text>
      <CircleHelp color={color} size={13} strokeWidth={2.3} />
    </AnimatedPressable>
    {open ? <HowItWorksSheet
      eyebrow="Lead"
      title={spam ? "Why potential spam" : "Why duplicate"}
      onClose={() => setOpen(false)}
      steps={leadRepeatSteps(repeat)}
    /> : null}
  </>;
}

/** What the ? says: the reason, the lead before, how it is counted, and that nothing else changes. */
export function leadRepeatSteps(repeat: NonNullable<Lead["repeat"]>) {
  return [
    { title: "Why", body: repeat.reason },
    ...(repeat.latest ? [{ title: "The lead before", body: `The latest was ${repeat.latest.referenceCode}.` }] : []),
    {
      title: "How it is counted",
      body: "Only past leads that ended because the person lost interest are counted. One or two make it a duplicate. Three or more make it potential spam.",
    },
  ];
}

/** Duplicate or potential spam, with the server's reason, as the Enquiries card shows it. */
export function LeadRepeatNote({ repeat }: { repeat: NonNullable<Lead["repeat"]> }) {
  const spam = repeat.flag === "POTENTIAL_SPAM";
  return <StatusNote
    icon={spam ? ShieldAlert : Copy}
    label={spam ? "Potential spam" : "Duplicate"}
    tinted
    text={repeat.reason}
    tone={spam ? "danger" : "warning"}
  />;
}
