import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { Megaphone, Zap, type LucideProps } from "lucide-react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { type NoticePriority, type NoticeSummary } from "@/store/services/notice-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/**
 * Which shelf a notice sits on, derived rather than stored.
 *
 * <p>
 * The API has two types with a status field each — a notice is PUBLISHED or
 * ARCHIVED, a schedule is ACTIVE or PAUSED — and "is this live right now" is a
 * question about dates that neither of them answers. An owner does not think in
 * those terms. They think live, coming up, running on a schedule, done. So the
 * notice screens work in these and convert at their edges.
 *
 * <p>
 * Shared by the board and the detail screen. The same notice showing as Live in
 * a list and Published on its own page would read as a bug in one of them.
 */
export type NoticeLane = "LIVE" | "SCHEDULED" | "ENDED" | "ARCHIVED" | "RECURRING" | "PAUSED";

/**
 * Where a published notice sits right now.
 *
 * <p>Dates, not status: PUBLISHED covers a notice that goes out next Tuesday,
 * one that tenants are reading, and one whose window closed last month.
 */
export function noticeLane(notice: Pick<NoticeSummary, "status" | "visibleFrom" | "visibleUntil">): NoticeLane {
  if (notice.status === "ARCHIVED") {
    return "ARCHIVED";
  }
  const now = Date.now();
  if (Date.parse(notice.visibleFrom) > now) {
    return "SCHEDULED";
  }
  if (notice.visibleUntil && Date.parse(notice.visibleUntil) < now) {
    return "ENDED";
  }
  return "LIVE";
}

/**
 * The status chip, with a dot.
 *
 * <p>
 * A dot rather than the app's usual bare pill: notice rows carry no other
 * colour, so it is the one mark that separates one card's state from the next
 * down a long list. Local to the notice screens — the shared {@code StatusPill}
 * stays dotless rather than growing an option for one board.
 */
export function LaneBadge({ lane }: { lane: NoticeLane }) {
  const { colors, fonts } = useTheme();
  const display: Record<NoticeLane, { background: string; dot: string; label: string; text: string }> = {
    LIVE: { background: colors.successSoft, dot: colors.jade, label: "Live", text: colors.successText },
    SCHEDULED: { background: colors.primarySoft, dot: colors.primary, label: "Scheduled", text: colors.primaryDeep },
    RECURRING: { background: colors.warningSoft, dot: colors.warning, label: "Recurring", text: colors.warningText },
    PAUSED: { background: colors.neutralSoft, dot: colors.muted, label: "Paused", text: colors.neutralText },
    ENDED: { background: colors.neutralSoft, dot: colors.muted, label: "Ended", text: colors.neutralText },
    ARCHIVED: { background: colors.neutralSoft, dot: colors.muted, label: "Archived", text: colors.neutralText },
  };
  const selected = display[lane];

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: selected.background,
        borderRadius: 999,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
      }}
    >
      <View style={{ backgroundColor: selected.dot, borderRadius: 999, height: 7, width: 7 }} />
      <Text
        style={{
          color: selected.text,
          fontFamily: fonts.sansBold,
          fontSize: 10.5,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {selected.label}
      </Text>
    </View>
  );
}

type IconType = ComponentType<LucideProps>;

export type CardFact = { icon: IconType; text: string };

/** Two facts on a line, split by a hairline — the notice card's meta rows. */
export function FactRow({
  left,
  right,
}: {
  left: CardFact | React.ReactElement;
  right?: CardFact | React.ReactElement;
}) {
  const { colors } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
      <View style={{ flex: 1 }}>{isFact(left) ? <Fact fact={left} /> : left}</View>
      {/* A lone fact keeps the whole width. A rule with nothing after it reads
          as a column that failed to load. */}
      {right ? (
        <>
          <View style={{ backgroundColor: colors.border, height: 14, width: 1 }} />
          <View style={{ flex: 1 }}>{isFact(right) ? <Fact fact={right} /> : right}</View>
        </>
      ) : null}
    </View>
  );
}

function isFact(value: CardFact | React.ReactElement): value is CardFact {
  return typeof value === "object" && value !== null && "text" in value;
}

export function Fact({ fact, tone }: { fact: CardFact; tone?: string }) {
  const { colors, fonts } = useTheme();
  const Icon = fact.icon;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
      <Icon color={tone ?? colors.kicker} size={14} strokeWidth={2.2} />
      <FitText
        numberOfLines={1}
        style={{ color: tone ?? colors.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12.5 }}
      >
        {fact.text}
      </FitText>
    </View>
  );
}

/**
 * A priority's own mark, filled and coloured, the same everywhere it is shown: a
 * megaphone, a shield, a lightning bolt, a siren (user, 2026-10-31).
 */
export function PriorityMark({ priority, size = 16 }: { priority: NoticePriority; size?: number }) {
  const { colors } = useTheme();
  if (priority === "NORMAL") {
    return <Megaphone color={colors.muted} fill={colors.muted} size={size} strokeWidth={2} />;
  }
  if (priority === "URGENT") {
    return <Zap color={colors.warning} fill={colors.warning} size={size} strokeWidth={2} />;
  }
  if (priority === "EMERGENCY") {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Path d="M6 17v-5.5a6 6 0 0 1 12 0V17Z" fill={colors.danger} />
        <Rect fill={colors.danger} height={4} rx={1.2} width={18} x={3} y={18} />
        <Path d="M12 2.2V3.6M3.9 5.4l1 1M20.1 5.4l-1 1" stroke={colors.danger} strokeLinecap="round" strokeWidth={2} />
        <Path d="M9.2 12a2.8 2.8 0 0 1 2.8-2.8" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={1.8} />
      </Svg>
    );
  }
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M12 2 4 5v6.5c0 5 3.4 8.9 8 10.5 4.6-1.6 8-5.5 8-10.5V5l-8-3Z" fill={colors.primary} />
      <Rect fill="#FFFFFF" height={7} rx={1} width={2} x={11} y={7} />
      <Circle cx={12} cy={16.6} fill="#FFFFFF" r={1.2} />
    </Svg>
  );
}

/**
 * How loud a notice is, as a pill with its mark (user, 2026-10-31). A normal
 * notice has none, so its title moves up into the space.
 */
export function PriorityChip({ priority }: { priority: NoticePriority }) {
  const { colors, fonts } = useTheme();
  if (priority === "NORMAL") {
    return null;
  }
  const tone =
    priority === "EMERGENCY"
      ? { fill: colors.dangerSoft, text: colors.danger }
      : priority === "URGENT"
        ? { fill: colors.warningSoft, text: colors.warningText }
        : { fill: colors.primarySoft, text: colors.primaryDeep };

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: tone.fill,
        borderRadius: 999,
        flexDirection: "row",
        gap: 5,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <PriorityMark priority={priority} size={14} />
      <Text style={{ color: tone.text, fontFamily: fonts.sansBold, fontSize: 11.5 }}>{priorityLabel(priority)}</Text>
    </View>
  );
}

export function priorityLabel(priority: NoticePriority) {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

/**
 * Priority as a field, coloured by how loud it is.
 *
 * <p>
 * A fact on a row rather than a second pill. Beside the lane badge it read as
 * another status — two chips in two shapes answering two different questions —
 * when it is simply one more thing the notice says about itself, like who it
 * went to and when.
 */
export function PriorityFact({ priority }: { priority: NoticePriority }) {
  const { colors } = useTheme();
  const tone =
    priority === "EMERGENCY"
      ? colors.danger
      : priority === "URGENT"
        ? colors.warningText
        : priority === "IMPORTANT"
          ? colors.primaryDeep
          : colors.muted;

  return <Fact fact={{ icon: FACT_MARKS[priority], text: priorityLabel(priority) }} tone={tone} />;
}

const FACT_MARKS: Record<NoticePriority, IconType> = {
  EMERGENCY: () => <PriorityMark priority="EMERGENCY" size={14} />,
  IMPORTANT: () => <PriorityMark priority="IMPORTANT" size={14} />,
  NORMAL: () => <PriorityMark priority="NORMAL" size={14} />,
  URGENT: () => <PriorityMark priority="URGENT" size={14} />,
};
