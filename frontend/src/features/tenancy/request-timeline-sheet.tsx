import { Text, View } from "react-native";

import { SheetShell } from "@/components/sheet-shell";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { flattenTimeline, type RequestActor, type TimelineEntry } from "./request-chain";

/** Whose screen this is. Their own side of the conversation sits on the right. */
export type TimelineViewer = "TENANT" | "MANAGEMENT";

/**
 * A request's history as an alternating timeline down a central rail.
 *
 * <p>Sides carry meaning: <b>your own actions sit on the left, the other
 * party's on the right</b>, so a tenant reading their own timeline sees
 * management's replies opposite them and an owner sees the mirror image. That
 * makes a request legible as a conversation — who moved, and who was waiting —
 * which a single flat column cannot show.
 *
 * <p>System events (a scheduled execution, a request lapsing unreviewed) run
 * down the middle. Neither party did them, and pinning them to a side would
 * imply someone had.
 *
 * <p>When an exit was re-raised, all attempts run together in one chronological
 * rail rather than as separate blocks — it is one intent, and the attempt number
 * rides on the step for anyone who needs it.
 */
export function RequestTimelineSheet({
  anchorNote,
  entries,
  onClose,
  referenceCode,
  roomLabel,
  tenantName,
  viewer,
}: {
  /** Shown above the rail, e.g. that notice counts from the first request. */
  anchorNote?: string | null;
  entries: TimelineEntry[];
  onClose: () => void;
  referenceCode?: string | null;
  roomLabel?: string | null;
  tenantName?: string | null;
  viewer: TimelineViewer;
}) {
  const { colors, fonts, type } = useTheme();
  const steps = flattenTimeline(entries);

  return (
    <SheetShell onClose={onClose} title="Request timeline">
      <View style={{ gap: spacing.md }}>
        {/* Who this is about, so a timeline opened from a long list still says
            whose it is without scrolling back to the card. */}
        {tenantName ? (
          <View style={{ alignItems: "baseline", flexDirection: "row", gap: spacing.sm }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>
              {tenantName}
            </Text>
            {roomLabel ? (
              <Text style={[type.caption, { color: colors.muted }]}>{roomLabel}</Text>
            ) : null}
          </View>
        ) : null}
        {referenceCode ? (
          <Text style={[type.caption, { color: colors.kicker, fontWeight: "800" }]}>
            {referenceCode}
          </Text>
        ) : null}

        {anchorNote ? (
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>{anchorNote}</Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "center" }}>
          <SideLabel text="You" />
          <View style={{ width: RAIL_WIDTH }} />
          <SideLabel text={viewer === "TENANT" ? "Management" : "Tenant"} />
        </View>

        <View>
          {/* One continuous rail behind the rows, so the line does not break
              between entries the way a per-row border would. */}
          <View
            style={{
              backgroundColor: colors.border,
              bottom: 0,
              left: "50%",
              marginLeft: -1,
              position: "absolute",
              top: 0,
              width: 2,
            }}
          />

          {steps.map((step) => (
            <TimelineRow
              key={`${step.entryId}-${step.at}-${step.label}`}
              step={step}
              viewer={viewer}
            />
          ))}
        </View>
      </View>
    </SheetShell>
  );
}

const RAIL_WIDTH = 28;

function SideLabel({ text }: { text: string }) {
  const { colors, type } = useTheme();

  return (
    <Text style={[type.caption, { color: colors.kicker, flex: 1, fontWeight: "800", textAlign: "center" }]}>
      {text.toUpperCase()}
    </Text>
  );
}

function TimelineRow({
  step,
  viewer,
}: {
  step: {
    actor: RequestActor;
    at: string;
    attemptOrdinal: number;
    detail: string | null;
    label: string;
    showAttempt: boolean;
  };
  viewer: TimelineViewer;
}) {
  const { colors } = useTheme();
  const side = sideFor(step.actor, viewer);

  if (side === "CENTER") {
    return (
      <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: 12,
            maxWidth: "88%",
            padding: spacing.sm,
          }}
        >
          <StepBody centered step={step} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", paddingVertical: spacing.xs }}>
      {side === "LEFT" ? <StepCard step={step} /> : <View style={{ flex: 1 }} />}

      <View style={{ alignItems: "center", justifyContent: "center", width: RAIL_WIDTH }}>
        <View
          style={{
            backgroundColor: colors.primary,
            borderColor: colors.surface,
            borderRadius: 6,
            borderWidth: 2,
            height: 12,
            width: 12,
          }}
        />
      </View>

      {side === "RIGHT" ? <StepCard step={step} /> : <View style={{ flex: 1 }} />}
    </View>
  );
}

function StepCard({
  step,
}: {
  step: { at: string; attemptOrdinal: number; detail: string | null; label: string; showAttempt: boolean };
}) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
      }}
    >
      <View style={{ flex: 1, padding: spacing.sm }}>
        <StepBody step={step} />
      </View>
      <DateBlock at={step.at} />
    </View>
  );
}

function StepBody({
  centered = false,
  step,
}: {
  centered?: boolean;
  step: {
    actorName?: string | null;
    at: string;
    attemptOrdinal: number;
    detail: string | null;
    label: string;
    showAttempt: boolean;
  };
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: 2 }}>
      <Text
        style={[
          type.body,
          {
            // An outcome should read as its outcome at a glance, before anyone
            // parses the word.
            color: labelColour(step.label, colors),
            fontWeight: "800",
            textAlign: centered ? "center" : "left",
          },
        ]}
      >
        {step.label}
      </Text>
      {step.actorName ? (
        <Text
          style={[
            type.caption,
            { color: colors.muted, textAlign: centered ? "center" : "left" },
          ]}
        >
          by {step.actorName}
        </Text>
      ) : null}
      {step.showAttempt ? (
        <Text
          style={[
            type.caption,
            { color: colors.kicker, textAlign: centered ? "center" : "left" },
          ]}
        >
          Attempt {step.attemptOrdinal}
        </Text>
      ) : null}
      {step.detail ? (
        <Text
          style={[
            type.caption,
            { color: colors.muted, lineHeight: 18, textAlign: centered ? "center" : "left" },
          ]}
        >
          {step.detail}
        </Text>
      ) : null}
      <Text
        style={[
          type.caption,
          { color: colors.kicker, textAlign: centered ? "center" : "left" },
        ]}
      >
        {formatTime(step.at)}
      </Text>
    </View>
  );
}

/** The month / day / year stack from the reference, in its own divided column. */
function DateBlock({ at }: { at: string }) {
  const { colors, fonts, type } = useTheme();
  const date = new Date(at);

  return (
    <View
      style={{
        alignItems: "center",
        borderLeftColor: colors.border,
        borderLeftWidth: 1,
        justifyContent: "center",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={[type.caption, { color: colors.muted }]}>
        {new Intl.DateTimeFormat("en-IN", { month: "short" }).format(date)}
      </Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, lineHeight: 26 }}>
        {new Intl.DateTimeFormat("en-IN", { day: "2-digit" }).format(date)}
      </Text>
      <Text style={[type.caption, { color: colors.muted }]}>
        {new Intl.DateTimeFormat("en-IN", { year: "numeric" }).format(date)}
      </Text>
    </View>
  );
}

/**
 * Which side a step belongs on.
 *
 * <p>"You" is always the <b>left</b>-hand column, so the same request read by a
 * tenant and by their manager is a mirror of itself rather than two different
 * stories — each sees their own moves on the left and the other party's replies
 * opposite.
 */
function sideFor(actor: RequestActor, viewer: TimelineViewer) {
  if (actor === "SYSTEM") {
    return "CENTER" as const;
  }
  return actor === viewer ? ("LEFT" as const) : ("RIGHT" as const);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

/**
 * Green for approved, red for rejected, ink for everything else.
 *
 * <p>Keyed off the label rather than the status because a single request's
 * timeline holds several outcomes — an approval and a refused withdrawal can sit
 * on the same rail, and they are not the same colour.
 */
function labelColour(label: string, colors: { danger: string; ink: string; successText: string }) {
  if (label.startsWith("Approved") || label.startsWith("Withdrawal allowed")) {
    return colors.successText;
  }
  if (label.startsWith("Rejected") || label.startsWith("Withdrawal refused")) {
    return colors.danger;
  }
  return colors.ink;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}
