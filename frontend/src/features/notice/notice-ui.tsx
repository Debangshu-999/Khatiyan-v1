import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { Flame, Megaphone, ShieldAlert, type LucideProps } from "lucide-react-native";

import { type NoticePriority, type NoticeSummary } from "@/store/services/notice-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

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
      <Text
        numberOfLines={1}
        style={{ color: tone ?? colors.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12.5 }}
      >
        {fact.text}
      </Text>
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
  const display =
    priority === "EMERGENCY"
      ? { icon: Flame, tone: colors.danger }
      : priority === "URGENT"
        ? { icon: Flame, tone: colors.warningText }
        : priority === "IMPORTANT"
          ? { icon: ShieldAlert, tone: colors.primaryDeep }
          : { icon: Megaphone, tone: colors.muted };

  return <Fact fact={{ icon: display.icon, text: priorityLabel(priority) }} tone={display.tone} />;
}
