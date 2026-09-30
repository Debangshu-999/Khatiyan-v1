import { Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card } from "@/components/card";
import { humanizeToken } from "@/features/owner/owner-ui";
import type { ConcernStatus, ConcernSummary } from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type BadgeTone = "primary" | "danger" | "success" | "warning" | "neutral";

export function ConcernDataCard({ concern }: { concern: ConcernSummary }) {
  const { colors, fonts, type } = useTheme();
  const status = tonePalette(concern.reopened ? "danger" : statusTone(concern.status), colors);
  const statusLabel = concern.reopened ? "Reopened" : concern.status === "UNDER_REVIEW" ? "In review" : humanizeToken(concern.status);
  const statusDescription = concern.reopened ? "The tenant has reopened this issue." : concern.status === "RESOLVED" ? "The issue has been resolved." : concern.status === "CLOSED" ? "The concern has been closed." : concern.status === "IN_PROGRESS" ? "The issue is being handled." : concern.status === "UNDER_REVIEW" ? "The concern is being reviewed." : "The concern is awaiting review.";
  const assignedTo = concern.assignedToName ?? (concern.assignedToUserId ? shortId(concern.assignedToUserId) : "Unassigned");
  const assignedBy = concern.assignedByName ?? (concern.assignedByUserId ? shortId(concern.assignedByUserId) : null);
  const closed = concern.status === "CLOSED";
  const showReopenUntil = !closed && Boolean(concern.reopenUntil);

  return (
    <Card style={{ overflow: "hidden", padding: 0 }}>
      <View style={{ backgroundColor: status.fg, height: 5 }} />
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        <View style={{ gap: spacing.sm, backgroundColor: status.bg, borderRadius: 12, padding: spacing.md }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>{concern.referenceCode}</Text>
            <Text style={[type.caption, { color: colors.muted }]}>{formatDateTime(concern.updatedAt)}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: status.fg, alignItems: "center", justifyContent: "center" }}>
              <MaterialCommunityIcons name={concern.reopened ? "restore" : concern.status === "RESOLVED" || concern.status === "CLOSED" ? "check" : concern.status === "IN_PROGRESS" ? "progress-wrench" : "clock-outline"} size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text style={{ color: status.fg, fontFamily: fonts.display, fontSize: 27, lineHeight: 33 }}>{statusLabel}</Text>
              <Text style={[type.caption, { color: colors.muted }]}>{statusDescription}</Text>
            </View>
          </View>
        </View>

        {/* Three deliberate rows: the tenancy reference is long enough to need
            the full width, and the two pairs below read as comparisons. */}
        <FactTile label="Tenancy" tone="neutral" value={concern.tenancyReferenceCode} wide />

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <FactTile icon="wrench" label="Category" tone="neutral" value={humanizeToken(concern.category)} />
          <FactTile icon="door-open" label="Room" tone="neutral" value={concern.roomNumber} />
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <FactTile icon="account" label="Assigned to" tone="neutral" value={assignedTo} />
          <FactTile
            label="Escalation"
            icon="sitemap"
            tone={concern.escalationLevel === "NONE" ? "neutral" : "danger"}
            value={humanizeToken(concern.escalationLevel)}
          />
        </View>

        {assignedBy || concern.assignedAt ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
            <View style={{ width: 28, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MaterialCommunityIcons name="account" size={22} color={colors.muted} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansBold }]}>
                Assigned by: {assignedBy ?? "Not recorded"}
              </Text>
              <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansBold }]}>
                Assigned at: {concern.assignedAt ? formatDateTime(concern.assignedAt) : "Not recorded"}
              </Text>
            </View>
          </View>
        ) : null}

        {concern.reopened ? (
          <View style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderRadius: 14, borderWidth: 1, gap: spacing.xs, padding: spacing.md }}>
            <Text style={[type.eyebrow, { color: colors.danger }]}>Reopened</Text>
            <Text style={[type.body, { color: colors.ink }]}>{concern.reopenReason ?? "No reopen reason provided."}</Text>
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View>
          <TimelineRow last={!concern.inProgressAt && !concern.resolvedAt && !showReopenUntil && !closed} label="Raised" value={formatDateTime(concern.createdAt)} />
          {concern.inProgressAt ? <TimelineRow last={!concern.resolvedAt && !showReopenUntil && !closed} label="In progress" value={formatDateTime(concern.inProgressAt)} /> : null}
          {concern.resolvedAt ? <TimelineRow resolved={!closed} last={!showReopenUntil && !closed} label="Resolved" value={formatDateTime(concern.resolvedAt)} /> : null}
          {showReopenUntil && concern.reopenUntil ? <TimelineRow pending last label="Reopen until" value={formatDateTime(concern.reopenUntil)} /> : null}
          {closed ? <TimelineRow completedColor={status.fg} resolved last label="Closed" value={formatDateTime(concern.updatedAt)} /> : null}
        </View>
        {closed && concern.reopenUntil ? (
          <View style={{ alignSelf: "flex-start", backgroundColor: colors.surfaceSunken, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={[type.caption, { color: colors.muted }]}>Reopen expired on {formatDateTime(concern.reopenUntil)}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

type DetailIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function FactTile({ icon, label, tone, value, wide }: { icon?: DetailIconName; label: string; tone: BadgeTone; value: string; wide?: boolean }) {
  const { colors, fonts } = useTheme();
  const palette = tonePalette(tone, colors);
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 10,
        ...(wide ? { width: "100%" as const } : { flex: 1 }),
      }}
    >
      {icon ? <View style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: tone === "neutral" ? colors.border : palette.bg }}><MaterialCommunityIcons name={icon} size={18} color={palette.fg} /></View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 10, lineHeight: 14 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 17, flexShrink: 1 }}>
        {value}
      </Text>
      </View>
    </View>
  );
}

function TimelineRow({ label, value, last = false, resolved = false, pending = false, completedColor }: { label: string; value: string; last?: boolean; resolved?: boolean; pending?: boolean; completedColor?: string }) {
  const { colors, type } = useTheme();
  const tickColor = completedColor ?? colors.successText;
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 38 }}>
      <View style={{ width: 26, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}>
        {!last ? <View style={{ position: "absolute", top: "50%", bottom: -19, width: 1, backgroundColor: colors.borderStrong }} /> : null}
        <View style={{ backgroundColor: resolved ? tickColor : pending ? colors.surface : colors.primarySoft, borderColor: pending ? colors.borderStrong : "transparent", borderWidth: pending ? 1.5 : 0, borderRadius: 13, height: resolved ? 24 : 18, width: resolved ? 24 : 18, alignItems: "center", justifyContent: "center" }}>
          {resolved ? <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" /> : !pending ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.muted }} /> : null}
        </View>
      </View>
      <Text style={[type.caption, { color: resolved ? tickColor : colors.muted, flex: 1, fontWeight: "700" }]}>{label}</Text>
      <Text style={[type.caption, { color: colors.muted, flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

function tonePalette(tone: BadgeTone, colors: ReturnType<typeof useTheme>["colors"]) {
  const palette: Record<BadgeTone, { bg: string; border: string; fg: string }> = {
    danger: { bg: colors.dangerSoft, border: colors.danger, fg: colors.danger },
    neutral: { bg: colors.neutralSoft, border: colors.borderStrong, fg: colors.neutralText },
    primary: { bg: colors.primarySoft, border: colors.primary, fg: colors.primary },
    success: { bg: colors.successSoft, border: colors.successText, fg: colors.successText },
    warning: { bg: colors.warningSoft, border: colors.warningText, fg: colors.warningText },
  };
  return palette[tone];
}

function statusTone(status: ConcernStatus): BadgeTone {
  if (status === "RESOLVED") return "success";
  if (status === "CLOSED") return "neutral";
  if (status === "UNDER_REVIEW") return "warning";
  return "primary";
}

function escalationTone(escalationLevel: string): BadgeTone {
  if (escalationLevel === "CRITICAL") return "danger";
  if (escalationLevel === "ESCALATED") return "warning";
  if (escalationLevel === "ATTENTION") return "primary";
  return "neutral";
}

function shortId(value: string) {
  return value.slice(0, 8);
}

export function NoteCard({ body, title, heading }: { body: string; title: string; heading?: string }) {
  const { colors, fonts, type } = useTheme();
  const referenceTypography = title === "Description" || title === "Resolution note";
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}>
          <MaterialCommunityIcons name="file-document-outline" size={22} color={colors.primary} />
        </View>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 20, flex: 1 }}>{title}</Text>
        </View>
        {heading ? <Text style={[type.display, { color: colors.ink, fontSize: 20, lineHeight: 26 }]}>{heading}</Text> : null}
        <Text style={[referenceTypography ? type.description : type.body, { color: referenceTypography ? colors.muted : colors.ink }]}>{body}</Text>
      </View>
    </Card>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}


