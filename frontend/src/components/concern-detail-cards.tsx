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
  const selfAssigned = Boolean(concern.assignedByUserId && concern.assignedByUserId === concern.assignedToUserId);
  const assignedBy = selfAssigned ? "self" : concern.assignedByName ?? (concern.assignedByUserId ? shortId(concern.assignedByUserId) : null);
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

        {concern.reopened ? (
          <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 17, color: colors.danger }}>Reopened because:</Text>
            <Text style={[type.description, { color: colors.muted }]}>{concern.reopenReason ?? "No reopen reason provided."}</Text>
          </View>
        ) : null}
        <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 21 }}>{concern.raisedByName ?? "Tenant"}</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 17 }}>{concern.tenancyReferenceCode}</Text>
        </View>

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
            <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={[type.caption, { color: colors.muted, fontFamily: fonts.sansBold, flex: 1, minWidth: 0 }]}>
              Assigned by {assignedBy ?? "Not recorded"}{concern.assignedAt ? ` · ${formatDateTime(concern.assignedAt)}` : ""}
            </Text>
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View>
          <TimelineRow activeIcon="flag-outline" active={concern.status === "OPEN" && !concern.reopened} last={!concern.assignedAt && !concern.inProgressAt && !concern.resolvedAt && !concern.reopenedAt && !showReopenUntil && !closed} label="Raised" value={formatDateTime(concern.createdAt)} />
          {concern.assignedAt ? <TimelineRow activeIcon="clipboard-search" dotColor={colors.primary} active={concern.status === "UNDER_REVIEW" && !concern.reopened} last={!concern.inProgressAt && !concern.resolvedAt && !concern.reopenedAt && !showReopenUntil && !closed} label="In review" value={formatDateTime(concern.assignedAt)} /> : null}
          {concern.inProgressAt ? <TimelineRow dotColor="#F97316" active={concern.status === "IN_PROGRESS" && !concern.reopened} last={!concern.resolvedAt && !concern.reopenedAt && !showReopenUntil && !closed} label="In progress" value={formatDateTime(concern.inProgressAt)} /> : null}
          {concern.resolvedAt || concern.reopenedAt ? <TimelineRow dotColor={colors.successText} resolved={concern.status === "RESOLVED" && !concern.reopenedAt} last={!concern.reopenedAt && !showReopenUntil && !closed} label="Resolved" value={concern.resolvedAt ? formatDateTime(concern.resolvedAt) : "Date unavailable"} /> : null}
          {concern.reopenedAt ? <>
            <TimelineRow dotColor="#EAB308" active={concern.reopened} label="Reopened" value={formatDateTime(concern.reopenedAt)} />
            <TimelineRow dotColor={colors.successText} label="Reopen resolved" pending={!concern.reopenResolvedAt} resolved={Boolean(concern.reopenResolvedAt) && concern.status === "RESOLVED"} value={concern.reopenResolvedAt ? formatDateTime(concern.reopenResolvedAt) : "Pending"} last={!showReopenUntil && !closed} />
          </> : null}
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

function TimelineRow({ label, value, last = false, resolved = false, pending = false, completedColor, dotColor, active = false, activeIcon }: { label: string; value: string; last?: boolean; resolved?: boolean; pending?: boolean; completedColor?: string; dotColor?: string; active?: boolean; activeIcon?: DetailIconName }) {
  const { colors, type } = useTheme();
  const tickColor = completedColor ?? colors.successText;
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 38 }}>
      <View style={{ width: 26, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}>
        {!last ? <View style={{ position: "absolute", top: "50%", bottom: -19, width: 1, backgroundColor: colors.borderStrong }} /> : null}
        <View style={{ backgroundColor: resolved ? tickColor : pending ? colors.surface : active ? dotColor ?? colors.primary : colors.surfaceSunken, borderColor: pending ? colors.borderStrong : "transparent", borderWidth: pending ? 1.5 : 0, borderRadius: 13, height: resolved || active ? 24 : 18, width: resolved || active ? 24 : 18, alignItems: "center", justifyContent: "center" }}>
          {resolved || active ? <MaterialCommunityIcons name={resolved ? "check" : activeIcon ?? (label === "Reopened" ? "restore" : "progress-wrench")} size={16} color="#FFFFFF" /> : !pending ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.muted }} /> : null}
        </View>
      </View>
      <Text style={[type.caption, { color: resolved ? tickColor : active ? dotColor ?? colors.primary : colors.muted, flex: 1, fontWeight: "700" }]}>{label}</Text>
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
