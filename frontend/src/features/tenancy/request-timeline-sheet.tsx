import { Text, View } from "react-native";
import { ArrowBullet } from "@/components/arrow-bullet";
import { SheetShell } from "@/components/sheet-shell";
import { useTheme } from "@/theme/use-theme";
import { flattenTimeline, type TimelineEntry } from "./request-chain";

export type TimelineViewer = "TENANT" | "MANAGEMENT";
type Step = ReturnType<typeof flattenTimeline>[number];

/** Both request types share a single-sided history, with explicit actor labels. */
export function RequestTimelineSheet({ anchorNote, entries, onClose, referenceCode,
  roomLabel, tenantName, viewer }: {
  anchorNote?: string | null; entries: TimelineEntry[]; onClose: () => void;
  referenceCode?: string | null; roomLabel?: string | null;
  tenantName?: string | null; viewer: TimelineViewer;
}) {
  const { colors, fonts, type } = useTheme();
  const steps = flattenTimeline(entries);
  return (
    <SheetShell
      belowTitle={referenceCode ? <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>{referenceCode}</Text> : undefined}
      onClose={onClose}
      title="Request timeline"
    >
      <View style={{ gap: 16 }}>
        {/* The request's code sits under the title. A tenant reading their own needs no "You" card (user, 2026-11-11). */}
        {viewer === "MANAGEMENT" ? (
          <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, padding: 14, gap: 6 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, lineHeight: 26 }}>
              {tenantName ?? "Tenant request"}
              {roomLabel ? <Text style={[type.caption, { color: colors.muted }]}> · {roomLabel}</Text> : null}
            </Text>
          </View>
        ) : null}
        {/* No thick edge, and the points a size down (user, 2026-11-07). */}
        {anchorNote ? (
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, gap: 6 }}>
            {anchorNote.split(/\.\s+(?=Notice counts)/).map((note, index) => (
              <View key={index} style={{ flexDirection: "row", gap: 8 }}>
                <ArrowBullet lineHeight={18} />
                <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18 }}>{note}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View>
          {steps.map((step, index) => <TimelineRow key={step.entryId + "-" + step.at + "-" + step.label}
            first={index === 0} last={index === steps.length - 1} step={step} />)}
        </View>
      </View>
    </SheetShell>
  );
}

/**
 * One step: no box of its own, a hairline between steps, and a grey dot on one line that
 * runs unbroken from the first step to the last. The newest step, at the top, where the
 * request now stands, has the bigger dot (user, 2026-11-07).
 */
function TimelineRow({ first, step, last }: {
  first: boolean; step: Step; last: boolean;
}) {
  const { colors, type } = useTheme();
  const management = step.actor === "MANAGEMENT";
  const system = step.actor === "SYSTEM";
  const actorColor = system ? colors.muted : management ? colors.accent : colors.primary;
  const actorFill = system ? colors.surfaceSunken : management ? colors.accentSoft : colors.primarySoft;
  const role = step.actorRole === "OWNER" ? "Owner" : step.actorRole === "MANAGER" ? "Manager" : "Property team";
  const actor = system ? "System" : management
    ? step.actorName ? step.actorName + " (" + role.toLowerCase() + ")" : role
    : "You";
  const outcomeColor = step.label.startsWith("Rejected") || step.label.startsWith("Withdrawal refused")
    ? colors.danger : step.label.startsWith("Approved") || step.label.startsWith("Withdrawal allowed")
      ? colors.successText : colors.ink;
  const dot = first ? 14 : 9;
  // Where the dot sits: level with the first line of the step.
  const dotCentre = 14 + 11;
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ width: 18, alignItems: "center" }}>
        {/* The line runs through every dot: from the first dot down, and up into the last. */}
        <View style={{ backgroundColor: colors.borderStrong, bottom: last ? undefined : 0, height: last ? dotCentre : undefined,
          position: "absolute", top: first ? dotCentre : 0, width: 2 }} />
        <View style={{ backgroundColor: colors.muted, borderRadius: 999, height: dot, marginTop: dotCentre - dot / 2, width: dot }} />
      </View>
      <View style={{ borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 1, flex: 1, gap: 6, minWidth: 0,
        paddingVertical: 14 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <View style={{ maxWidth: "100%", backgroundColor: actorFill, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: actorColor, fontSize: 11, lineHeight: 16, fontWeight: "700" }}>{actor}</Text>
          </View>
          {step.showAttempt ? (
            <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }}>Attempt {step.attemptOrdinal}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[type.body, { color: outcomeColor, fontWeight: "800", fontSize: 15, lineHeight: 20 }]}>{step.label}</Text>
        <Text style={[type.caption, { color: colors.muted, fontSize: 11, lineHeight: 16 }]}>
          {formatDateTime(step.at)}
        </Text>
        {step.detail ? <Text style={[type.description, { color: colors.muted }]}>{step.detail}</Text> : null}
      </View>
    </View>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit" }).format(date);
}
