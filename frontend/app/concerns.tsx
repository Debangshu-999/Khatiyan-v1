import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, CheckCircle2, Clock3, Eye, RotateCcw, ShieldAlert } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import type { ConcernStatus, ConcernSummary } from "@/store/services/concern-api";
import { useListMyConcernHistoryQuery, useListMyCurrentConcernsQuery } from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function ConcernsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ createdConcern?: string }>();
  const { colors, type } = useTheme();
  const currentQuery = useListMyCurrentConcernsQuery();
  const historyQuery = useListMyConcernHistoryQuery();
  const currentData = currentQuery.data ?? [];
  const currentConcerns = currentData.filter(isActiveConcern);
  const resolvedFromCurrent = currentData.filter((concern) => !isActiveConcern(concern));
  const concernHistory = uniqueConcerns([...resolvedFromCurrent, ...(historyQuery.data?.items ?? [])]);
  const toast = useToast();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (params.createdConcern !== "1" || toastShownRef.current) {
      return;
    }
    toastShownRef.current = true;
    toast.success("Concern raised successfully.");
  }, [params.createdConcern, toast]);

  function openConcern(concern: ConcernSummary) {
    router.push({ pathname: "/concern-detail", params: { concernId: concern.id } });
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView>
        <ScreenHeader
          eyebrow="Tenant workspace"
          title="Concerns,"
          italicTail="tracked."
          subtitle="Current concerns, history and concern actions for your active tenancy."
        />

        <Section eyebrow="Create" title="Raise a concern">
          <ActionCard
            meta="New"
            title="Create concern"
            description="Add category and details for the property team."
            onPress={() => router.push("/create-concern")}
            tone="primary"
          />
        </Section>

        <Section eyebrow="Current" title="Open concerns">
          {currentQuery.isFetching ? (
            <Card>
              <ActivityIndicator color={colors.primary} />
              <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
                Loading current concerns
              </Text>
            </Card>
          ) : currentConcerns.length > 0 ? (
            currentConcerns.map((concern) => (
              <ConcernOverviewCard concern={concern} key={concern.id} onOpen={() => openConcern(concern)} />
            ))
          ) : (
            <EmptyState
              eyebrow="Current"
              title="No open concerns"
              description="New concerns and in-progress issues will appear here."
            />
          )}
        </Section>

        <Section eyebrow="History" title="Resolved concerns">
          {historyQuery.isFetching ? (
            <Card>
              <ActivityIndicator color={colors.primary} />
            </Card>
          ) : concernHistory.length > 0 ? (
            concernHistory
              .slice(0, 8)
              .map((concern) => (
                <ConcernOverviewCard concern={concern} key={concern.id} onOpen={() => openConcern(concern)} />
              ))
          ) : (
            <EmptyState
              icon={CheckCircle2}
              eyebrow="History"
              title="No concern history"
              description="Resolved or closed concerns will be kept here for reference."
            />
          )}
        </Section>
      </ScreenScrollView>
    </View>
  );
}

// Compact overview card — full details live on the concern detail screen,
// mirroring the owner concern monitor's card → "View detail" behaviour.
function ConcernOverviewCard({ concern, onOpen }: { concern: ConcernSummary; onOpen: () => void }) {
  const { colors, fonts, type } = useTheme();
  const active = isActiveConcern(concern);
  const status = concernTonePalette(statusTone(concern.status), colors);
  const assignedTo = concern.assignedToName ?? (concern.assignedToUserId ? "Assigned" : null);

  return (
    <Card tone={active ? "default" : "sunken"}>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: status.bg,
              borderColor: status.border,
              borderRadius: 16,
              borderWidth: 1,
              height: 48,
              justifyContent: "center",
              width: 48,
            }}
          >
            <ConcernStatusIcon color={status.fg} concern={concern} />
          </View>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              {concern.referenceCode}
            </Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: "700", lineHeight: 26 }} selectable>
              {concern.title}
            </Text>
            <Text style={[type.caption, { color: status.fg, fontWeight: "800" }]} selectable>
              {humanizeToken(concern.status)}
              {concern.reopened ? " · Reopened" : ""}
            </Text>
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <InfoLine label="Category" value={humanizeToken(concern.category)} />
          <InfoLine label="Room" value={concern.roomNumber} />
          {assignedTo ? <InfoLine label="Assigned to" value={assignedTo} /> : null}
          {concern.statusNote ? <InfoLine label="Latest note" value={concern.statusNote} /> : null}
          <InfoLine label="Updated" value={formatDateTime(concern.updatedAt)} />
        </View>

        <ViewDetailButton onPress={onOpen} />
      </View>
    </Card>
  );
}

function ViewDetailButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 48,
        paddingHorizontal: spacing.md,
      }}
    >
      <Eye color={colors.primary} size={16} strokeWidth={2.2} />
      <Text style={{ color: colors.primary, fontFamily: fonts.sans, fontSize: 14, fontWeight: "800" }} selectable>
        View detail
      </Text>
    </AnimatedPressable>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, width: 92 }]} selectable>
        {label}
      </Text>
      <Text numberOfLines={2} style={[type.caption, { color: colors.ink, flex: 1, fontWeight: "700" }]} selectable>
        {value}
      </Text>
    </View>
  );
}

type ConcernTone = "primary" | "danger" | "success" | "warning" | "neutral";

function ConcernStatusIcon({ color, concern }: { color: string; concern: ConcernSummary }) {
  if (concern.reopened) return <RotateCcw color={color} size={22} strokeWidth={2.4} />;
  if (concern.status === "RESOLVED" || concern.status === "CLOSED") return <CheckCircle2 color={color} size={22} strokeWidth={2.4} />;
  if (concern.status === "UNDER_REVIEW") return <Clock3 color={color} size={22} strokeWidth={2.4} />;
  if (concern.status === "IN_PROGRESS") return <ShieldAlert color={color} size={22} strokeWidth={2.4} />;
  return <AlertCircle color={color} size={22} strokeWidth={2.4} />;
}

function concernTonePalette(tone: ConcernTone, colors: ReturnType<typeof useTheme>["colors"]) {
  const palette: Record<ConcernTone, { bg: string; border: string; fg: string }> = {
    danger: { bg: colors.dangerSoft, border: colors.danger, fg: colors.danger },
    neutral: { bg: colors.neutralSoft, border: colors.borderStrong, fg: colors.neutralText },
    primary: { bg: colors.primarySoft, border: colors.primary, fg: colors.primary },
    success: { bg: colors.successSoft, border: colors.successText, fg: colors.successText },
    warning: { bg: colors.warningSoft, border: colors.warningText, fg: colors.warningText },
  };
  return palette[tone];
}

function statusTone(status: ConcernStatus): ConcernTone {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "OPEN") return "danger";
  if (status === "UNDER_REVIEW") return "primary";
  return "warning";
}

function isActiveConcern(concern: ConcernSummary) {
  return concern.status !== "RESOLVED" && concern.status !== "CLOSED";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function uniqueConcerns(concerns: ConcernSummary[]) {
  const seen = new Set<string>();

  return concerns.filter((concern) => {
    if (seen.has(concern.id)) {
      return false;
    }

    seen.add(concern.id);
    return true;
  });
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
