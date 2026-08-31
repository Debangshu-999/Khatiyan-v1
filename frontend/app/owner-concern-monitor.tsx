import { useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Activity, AlertCircle, CheckCircle2, Clock3, Eye, RotateCcw } from "lucide-react-native";

import { PropertyIcon } from "@/components/property-icon";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MetricTile } from "@/components/metric-tile";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { ActionButton, BackButton, humanizeToken } from "@/features/owner/owner-ui";
import { type ConcernSummary, useListPropertyConcernMonitorQuery } from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

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
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader onBack={() => router.back()}
        eyebrow="Concerns"
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
                <MetricTile label="In review" value={String(counts.inReview)} hint="Assigned" tone={counts.inReview > 0 ? "primary" : "default"} />
                <MetricTile label="In progress" value={String(counts.inProgress)} hint="Being handled" tone={counts.inProgress > 0 ? "primary" : "default"} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <MetricTile label="Reopened" value={String(counts.reopened)} hint="Tenant replied" tone={counts.reopened > 0 ? "danger" : "default"} />
                <MetricTile label="Resolved" value={String(counts.resolvedWindow)} hint="Reopen window" />
              </View>
            </View>
          </Section>

          <Section title="Monitored concerns">
            {monitorQuery.isFetching ? (
              <SkeletonCard />
            ) : sortedConcerns.length > 0 ? (
              <View style={{ gap: spacing.md }}>
                {sortedConcerns.map((concern) => (
                  <MonitorConcernCard concern={concern} key={concern.id} onOpen={() => openConcern(concern)} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon={Activity}
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
  const Icon = concern.reopened
    ? RotateCcw
    : concern.status === "RESOLVED"
      ? CheckCircle2
      : concern.status === "IN_PROGRESS"
        ? Activity
        : Clock3;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View style={{ alignItems: "center", borderColor: colors.ink, borderRadius: 16, borderWidth: 1, height: 48, justifyContent: "center", width: 48 }}>
            <Icon color={colors.ink} size={22} />
          </View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>{concern.referenceCode}</Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, lineHeight: 27 }}>
              {concern.title}
            </Text>
            <Text style={[type.body, { color: colors.muted }]}>
              {humanizeToken(concern.status)}{concern.reopened ? " · Reopened" : ""}
            </Text>
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <InfoLine label="Room" value={concern.roomNumber} />
          {concern.assignedToName ? <InfoLine label="Assigned to" value={concern.assignedToName} /> : null}
          <InfoLine label="Tenancy" value={concern.tenancyReferenceCode} />
          {concern.statusNote ? <InfoLine label="Latest note" value={concern.statusNote} /> : null}
          {concern.reopenReason ? <InfoLine label="Reopen reason" value={concern.reopenReason} /> : null}
          {concern.reopenUntil ? <InfoLine label="Reopen until" value={formatDateTime(concern.reopenUntil)} /> : null}
          <InfoLine label="Updated" value={formatDateTime(concern.updatedAt)} />
        </View>

        <ActionButton icon={Eye} label="View detail" onPress={onOpen} variant="secondary" />
      </View>
    </Card>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, width: 92 }]}>{label}</Text>
      <Text style={[type.caption, { color: colors.ink, flex: 1, fontWeight: "700" }]}>{value}</Text>
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
