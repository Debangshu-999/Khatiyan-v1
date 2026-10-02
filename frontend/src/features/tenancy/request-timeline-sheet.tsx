import { Text, View } from "react-native";
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
    <SheetShell onClose={onClose} title="Request timeline">
      <View style={{ gap: 16 }}>
        <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, padding: 14, gap: 6 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, lineHeight: 26 }}>
            {viewer === "TENANT" ? "You" : tenantName ?? "Tenant request"}
            {roomLabel ? <Text style={[type.caption, { color: colors.muted }]}> · {roomLabel}</Text> : null}
          </Text>
          {referenceCode ? <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>{referenceCode}</Text> : null}
        </View>
        {anchorNote ? (
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, borderLeftWidth: 4,
            borderLeftColor: colors.primary, padding: 12, gap: 8 }}>
            {anchorNote.split(/\.\s+(?=Notice counts)/).map((note, index) => (
              <View key={index} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ color: colors.ink, fontWeight: "700" }}>•</Text>
                <Text style={[type.modalDescription, { color: colors.ink, fontWeight: "700", flex: 1 }]}>{note}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View>
          {steps.map((step, index) => <TimelineRow key={step.entryId + "-" + step.at + "-" + step.label}
            step={step} last={index === steps.length - 1} />)}
        </View>
      </View>
    </SheetShell>
  );
}

function TimelineRow({ step, last }: {
  step: Step; last: boolean;
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
  const dotColor = outcomeColor === colors.ink ? colors.muted : outcomeColor;
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ width: 18, alignItems: "center" }}>
        {!last ? <View style={{ position: "absolute", top: 18, bottom: 0, width: 2, backgroundColor: colors.border }} /> : null}
        <View style={{ marginTop: 17, width: 12, height: 12, borderRadius: 6, backgroundColor: dotColor, borderWidth: 2, borderColor: colors.surface }} />
      </View>
      <View style={{ flex: 1, minWidth: 0, marginBottom: last ? 0 : 12, padding: 12,
        borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, gap: 6 }}>
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
