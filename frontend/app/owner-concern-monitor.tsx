import { useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Eye, type LucideProps } from "lucide-react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { PropertyIcon } from "@/components/property-icon";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { OwnerConcernQueueSkeleton } from "@/components/skeletons/owner";
import { ActionButton, humanizeToken } from "@/features/owner/owner-ui";
import { type ConcernSummary, useListPropertyConcernMonitorQuery } from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CONCERN_EMPTY_ILLUSTRATION = require("../assets/workspace/concern-empty_state.png");

function ReviewIcon({ color, size }: LucideProps) {
  return <MaterialCommunityIcons name="clipboard-search" color={color} size={Number(size ?? 24)} />;
}
function ProgressIcon({ color, size }: LucideProps) {
  return <MaterialCommunityIcons name="progress-wrench" color={color} size={Number(size ?? 24)} />;
}
function ReopenedIcon({ color, size }: LucideProps) {
  return <MaterialCommunityIcons name="restore" color={color} size={Number(size ?? 24)} />;
}
function ResolvedIcon({ color, size }: LucideProps) {
  return <MaterialCommunityIcons name="check-circle" color={color} size={Number(size ?? 24)} />;
}

export default function OwnerConcernMonitorScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ propertyId?: string }>();
  const propertyId = typeof params.propertyId === "string" ? params.propertyId : "";
  const monitorQuery = useListPropertyConcernMonitorQuery(propertyId, { skip: !propertyId });
  const concerns = monitorQuery.data ?? [];

  const counts = useMemo(() => {
    return {
      inProgress: concerns.filter((concern) => concern.status === "IN_PROGRESS" && !concern.reopened).length,
      inReview: concerns.filter((concern) => concern.status === "UNDER_REVIEW" && !concern.reopened).length,
      reopened: concerns.filter((concern) => concern.reopened).length,
      resolvedWindow: concerns.filter((concern) => concern.status === "RESOLVED").length,
    };
  }, [concerns]);

  const sortedConcerns = useMemo(() => sortMonitor(concerns), [concerns]);

  function openConcern(concern: ConcernSummary) {
    router.push({
      pathname: "/owner-concern-detail",
      params: { concernId: concern.id, mode: "history", propertyId: concern.propertyId },
    });
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        title="Concern"
        italicTail="monitor."
        subtitle="Track assigned concerns and resolved concerns still inside the reopen window."
      />

      {!propertyId ? (
        <EmptyState icon={PropertyIcon} title="No property selected" description="Open this screen from a selected owner property." />
      ) : null}

      {propertyId ? (
        <>
          <Section title="Progress snapshot">
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile icon={ReviewIcon} iconTone="primary" label="In review" value={String(counts.inReview)} hint="Assigned" tone={counts.inReview > 0 ? "primary" : "default"} />
                <MetricTile icon={ProgressIcon} iconTone="warning" label="In progress" value={String(counts.inProgress)} hint="Being handled" tone={counts.inProgress > 0 ? "primary" : "default"} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile icon={ReopenedIcon} iconTone="danger" label="Reopened" value={String(counts.reopened)} hint="Tenant replied" tone={counts.reopened > 0 ? "danger" : "default"} />
                <MetricTile icon={ResolvedIcon} iconTone="success" label="Resolved" value={String(counts.resolvedWindow)} hint="Reopen window" />
              </View>
            </View>
          </Section>

          <Section title="Monitored concerns">
            {monitorQuery.isFetching ? (
              <OwnerConcernQueueSkeleton />
            ) : sortedConcerns.length > 0 ? (
              <View style={{ gap: spacing.md }}>
                {sortedConcerns.map((concern) => (
                  <MonitorConcernCard concern={concern} key={concern.id} onOpen={() => openConcern(concern)} />
                ))}
              </View>
            ) : (
              <EmptyState
                artwork={CONCERN_EMPTY_ILLUSTRATION}
                title="No concerns being monitored"
                description="Assigned active concerns and resolved concerns in the reopen window will appear here."
              />
            )}
          </Section>
        </>
      ) : null}
    </ScreenScrollView>
  );
}

function MonitorConcernCard({ concern, onOpen }: { concern: ConcernSummary; onOpen: () => void }) {
  const { colors, fonts, type } = useTheme();
  const resolved = !concern.reopened && concern.status === "RESOLVED";
  const inProgress = !concern.reopened && concern.status === "IN_PROGRESS";
  const statusLabel = concern.reopened ? "Reopened" : resolved ? "Resolved" : inProgress ? "In progress" : concern.status === "UNDER_REVIEW" ? "In review" : humanizeToken(concern.status);
  const statusColor = concern.reopened ? colors.danger : resolved ? colors.jade : inProgress ? colors.warningText : colors.primary;
  const statusFill = concern.reopened ? colors.dangerSoft : resolved ? colors.successSoft : inProgress ? colors.warningSoft : colors.primarySoft;
  const statusIcon = concern.reopened ? "restore" : resolved ? "check" : inProgress ? "progress-wrench" : "clipboard-search";

  return (
    <Card style={{ padding: spacing.md }}>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
              <Text style={[type.eyebrow, { color: colors.kicker, flexShrink: 1 }]}>{concern.referenceCode}</Text>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 4, backgroundColor: statusFill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                <View style={{ alignItems: "center", justifyContent: "center", backgroundColor: statusColor, borderRadius: 999, height: 14, width: 14 }}>
                  <MaterialCommunityIcons name={statusIcon} color="#FFFFFF" size={10} />
                </View>
                <Text style={{ color: statusColor, fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 15 }}>{statusLabel}</Text>
              </View>
            </View>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, lineHeight: 27 }}>
              {concern.title}
            </Text>
          </View>
        </View>

        <View>
          <InfoLine icon="home-outline" label="Room" value={concern.roomNumber} />
          {concern.assignedToName ? <InfoLine icon="account-outline" label="Assigned to" value={concern.assignedToName} /> : null}
          <InfoLine icon="file-document-outline" label="Tenancy" value={concern.tenancyReferenceCode} />
          {concern.statusNote ? <InfoLine icon="text-box-outline" label="Latest note" value={concern.statusNote} /> : null}
          {concern.reopenReason ? <InfoLine icon="message-text-outline" label="Reopen reason" value={concern.reopenReason} /> : null}
          {concern.reopenUntil ? <InfoLine highlighted icon="calendar-outline" label="Reopen until" value={formatDateTime(concern.reopenUntil)} /> : null}
          <InfoLine icon="clock-outline" label="Updated" last value={formatDateTime(concern.updatedAt)} />
        </View>

        <ActionButton compact icon={Eye} label="View detail" onPress={onOpen} variant="primary" />
      </View>
    </Card>
  );
}

function InfoLine({ highlighted = false, icon, label, last = false, value }: {
  highlighted?: boolean;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  last?: boolean;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 1, paddingVertical: 2 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, backgroundColor: highlighted ? colors.warningSoft : "transparent", borderRadius: 10, paddingVertical: 4, paddingHorizontal: highlighted ? 6 : 0 }}>
        <View style={{ alignItems: "center", justifyContent: "center", backgroundColor: highlighted ? colors.warningSoft : colors.surfaceSunken, borderRadius: 8, height: 28, width: 28 }}>
          <MaterialCommunityIcons name={icon} color={highlighted ? colors.warningText : colors.muted} size={18} />
        </View>
        <Text style={[type.caption, { color: colors.muted, flex: 0.9 }]}>{label}</Text>
        <Text style={[type.caption, { color: colors.ink, flex: 1.3, fontFamily: fonts.sansBold }]}>{value}</Text>
      </View>
    </View>
  );
}

function sortMonitor(concerns: ConcernSummary[]) {
  const weight = (concern: ConcernSummary) => {
    if (concern.reopened) return 0;
    if (concern.status === "UNDER_REVIEW") return 1;
    if (concern.status === "IN_PROGRESS") return 2;
    if (concern.status === "RESOLVED") return 3;
    return 4;
  };

  return [...concerns].sort((left, right) => {
    const weightDiff = weight(left) - weight(right);
    if (weightDiff !== 0) return weightDiff;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
