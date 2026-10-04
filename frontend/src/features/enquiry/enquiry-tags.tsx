import { type ComponentType } from "react";
import { Text, View } from "react-native";
import { Timer, type LucideProps } from "lucide-react-native";

import { GhostPill } from "@/components/skeletons/boundary";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The tags an enquiry card wears, shared by the owner's Enquiries card and the
 * enquirer's My enquiries card (2026-10-03), so the two read the same.
 */

const DISPLAY_ZONE = "Asia/Kolkata";

/** A grey pill: a small icon, if any, then a short line. The cards' date tags. */
export function TagPill({
  icon: Icon,
  iconColor,
  iconFaded = false,
  label,
}: {
  icon?: ComponentType<LucideProps>;
  iconColor?: string;
  /** Drawn at half strength, as the Closes in timer is. */
  iconFaded?: boolean;
  label: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderRadius: 999,
        flexDirection: "row",
        gap: 3,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      {Icon ? (
        <View style={{ opacity: iconFaded ? 0.55 : 1 }}>
          <Icon color={iconColor ?? colors.muted} size={11} strokeWidth={2.6} />
        </View>
      ) : null}
      <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 10.5 }}>{label}</Text>
    </View>
  );
}

/**
 * "1 open enquiry", "3 enquiries": a list's count on a pale blue pill, the
 * user's exception to no pale blue fills (2026-10-03). Heads My enquiries and
 * both of the owner's Enquiries tabs.
 *
 * @param kind the filter, in words ("open", "not interested"), or nothing for all of them
 * @param noun what is counted, singular then plural. Enquiries unless told otherwise (visits, 2026-10-04)
 */
export function CountPill({
  count,
  kind,
  noun = ["enquiry", "enquiries"],
}: {
  count: number;
  kind?: string;
  noun?: [string, string];
}) {
  const { colors, fonts } = useTheme();
  // Nothing at all for none: the list's empty state already says so (user, 2026-10-03).
  if (count === 0) {
    return null;
  }
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: colors.primarySoft,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: colors.primaryDeep, fontFamily: fonts.sansBold, fontSize: 12 }}>
        {[String(count), kind, count === 1 ? noun[0] : noun[1]].filter(Boolean).join(" ")}
      </Text>
    </View>
  );
}

/** The hairline under a card's name, the only rule on it (user, 2026-10-03). */
export function CardRule() {
  const { colors } = useTheme();
  // Darker than a border, so it reads as a rule (user, 2026-10-03). One
  // component, so the owner's and the tenant's lines always match.
  // More room under it than over it, before the tags (user, 2026-10-03).
  return <View style={{ backgroundColor: colors.kicker, height: 1, marginBottom: 6, marginTop: 2 }} />;
}

/** "today", "1d ago", "12d ago", counted in India calendar days. */
export function daysAgo(value: string) {
  const startOfDay = (date: Date) => {
    // en-CA renders as YYYY-MM-DD, which parses back as a clean date boundary.
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_ZONE }).format(date);
    return new Date(`${iso}T00:00:00Z`).getTime();
  };
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(value))) / 86_400_000);
  return days <= 0 ? "today" : `${days}d ago`;
}

/** "2:29 pm", in India time. */
export function clockTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: true, minute: "2-digit", timeZone: DISPLAY_ZONE })
    .format(new Date(value))
    .toLowerCase();
}

/** The ribbon's square in the card's corner; the band crosses it at 45 degrees. */
const RIBBON_BOX = 76;
/** The darker folds where the band tucks behind the card's two edges. */
const RIBBON_TAIL = 6;

/**
 * A corner tag, drawn as the sale sticker it was modelled on (user,
 * 2026-10-02): a band across the card's top-right corner, reading down to the
 * right, with a darker fold at each end where it wraps the edge. The card's own
 * rounding clips the corner.
 *
 * <p>NEW in red, shown only while {@link isNewToday}: a reply under
 * first-response mode makes the replier the handler, so an answered enquiry has
 * already lost it. CLOSED in grey on a closed enquiry (user, 2026-10-03).
 */
export function CornerRibbon({
  accessibilityLabel,
  band,
  fold,
  label,
}: {
  accessibilityLabel: string;
  band: string;
  /** The underside of the band, seen where it folds back. */
  fold: string;
  label: string;
}) {
  const { fonts } = useTheme();
  // Right-angled triangles, square corner up and right: each sits against the
  // band's outer edge where it meets the card edge, the fold of the wrap.
  const tail = {
    borderLeftColor: "transparent",
    borderLeftWidth: RIBBON_TAIL,
    borderTopColor: fold,
    borderTopWidth: RIBBON_TAIL,
    height: 0,
    position: "absolute" as const,
    width: 0,
  };
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      pointerEvents="none"
      style={{ height: RIBBON_BOX, overflow: "hidden", position: "absolute", right: 0, top: 0, width: RIBBON_BOX, zIndex: 1 }}
    >
      <View style={[tail, { left: 5, top: 0 }]} />
      <View style={[tail, { left: RIBBON_BOX - RIBBON_TAIL, top: RIBBON_BOX - 11 }]} />
      <View
        style={{
          backgroundColor: band,
          paddingVertical: 3,
          position: "absolute",
          right: -30,
          shadowColor: "#000000",
          shadowOffset: { height: 1, width: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 2,
          elevation: 2,
          top: 16,
          transform: [{ rotate: "45deg" }],
          width: 110,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.2, textAlign: "center" }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** The underside of the NEW band, seen where it folds back. */
export const RIBBON_FOLD = "#991B1B";

/** The EXPIRED band's fold, under its amber band. */
export const EXPIRED_FOLD = "#78350F";

/**
 * "Closes in 7d": how long a Not interested enquiry has before it closes by
 * itself, as a grey pill with a faded red timer (user, 2026-10-03).
 */
export function ClosesInChip({ closesAt }: { closesAt: string }) {
  const { colors } = useTheme();
  return <TagPill icon={Timer} iconColor={colors.danger} iconFaded label={formatClosesIn(closesAt)} />;
}

/** "Closes in 7d", "Closes in 5h", or "Closes soon". */
export function formatClosesIn(closesAt: string) {
  const left = Date.parse(closesAt) - Date.now();
  if (left <= 0) {
    return "Closes soon";
  }
  const hour = 3_600_000;
  return left < 24 * hour ? `Closes in ${Math.ceil(left / hour)}h` : `Closes in ${Math.ceil(left / (24 * hour))}d`;
}

/**
 * A person's initials in a soft disc: a face for a card without a photo. The
 * owner's enquiry cards and the VMS visit cards (user, 2026-10-04).
 */
export function InitialsAvatar({ name }: { name: string | null }) {
  const { colors, fonts } = useTheme();
  const initials =
    (name ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <GhostPill height={42} width={42}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.primarySoft,
          borderRadius: 999,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        <Text style={{ color: colors.primaryDeep, fontFamily: fonts.displaySoft, fontSize: 15 }}>{initials}</Text>
      </View>
    </GhostPill>
  );
}

export type Tone = "danger" | "warning" | "neutral" | "success";

function useTonePalette(): Record<Tone, { background: string; text: string }> {
  const { colors } = useTheme();
  return {
    danger: { background: colors.dangerSoft, text: colors.danger },
    neutral: { background: colors.neutralSoft, text: colors.neutralText },
    success: { background: colors.successSoft, text: colors.successText },
    warning: { background: colors.warningSoft, text: colors.warningText },
  };
}

/**
 * Where an enquiry or a visit stands, as a tinted pill: green for a visit, amber for one
 * called off, red for a countdown to closing. Sentence case, like the rest of
 * the card (user, 2026-10-03).
 */
export function StateChip({ icon: Icon, label, tone }: { icon?: ComponentType<LucideProps>; label: string; tone: Tone }) {
  const { fonts } = useTheme();
  const palette = useTonePalette()[tone];
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette.background,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      {Icon ? <Icon color={palette.text} size={12} strokeWidth={2.5} /> : null}
      <Text style={{ color: palette.text, fontFamily: fonts.sansBold, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

/**
 * The handler's reading, or why a visit was called off: a tinted note with its
 * mark, a bold label and the detail after it. One shape for all three, so they
 * read as one family rather than three unrelated boxes.
 */
export function StatusNote({
  icon: Icon,
  label,
  text,
  tone,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  text: string | null;
  tone: Tone;
}) {
  const { fonts, type } = useTheme();
  const palette = useTonePalette()[tone];
  return (
    <View
      style={{
        alignItems: "flex-start",
        backgroundColor: palette.background,
        borderCurve: "continuous",
        borderRadius: radii.card,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon color={palette.text} size={15} strokeWidth={2.3} />
      </View>
      <Text style={[type.description, { color: palette.text, flex: 1 }]}>
        <Text style={{ fontFamily: fonts.sansBold }}>{text ? `${label}:` : label}</Text>
        {text ? ` ${text}` : ""}
      </Text>
    </View>
  );
}
