import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { SheetCloseButton } from "@/components/help-modal-header";
import { ModalTitleRule } from "@/components/modal-title-rule";
import { ModalTitle } from "@/components/modal-title";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, Eye } from "lucide-react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ClosedConcernsIcon, CreateConcernIcon } from "@/components/concern-action-icons";
import { cardShadow, softShadow } from "@/theme/shadows";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { ConcernMetaRow } from "@/features/concerns/concern-meta-row";
import { ActionButton, IconButton, humanizeToken } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import type { ConcernSummary } from "@/store/services/concern-api";
import {
  splitTenantConcerns,
  useListMyConcernHistoryQuery,
  useListMyCurrentConcernsQuery,
} from "@/store/services/concern-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { REQUESTS_NOT_STARTED, tenancyNotStarted } from "@/features/tenancy/starts-soon-bubble";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/** A little more room between a concern empty state's picture and its words (user, 2026-11-14). */
const CONCERN_EMPTY_GAP = spacing.lg + spacing.xs;

const CONCERN_EMPTY_ILLUSTRATION = require("../assets/empty-states/concern-empty_state.png");

export default function ConcernsScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ createdConcern?: string }>();
  const { colors, fonts } = useTheme();
  const currentQuery = useListMyCurrentConcernsQuery();
  const historyQuery = useListMyConcernHistoryQuery({ page: 0, size: 200 });
  // Before the start date a concern cannot be raised (the server refuses it
  // too), so the tile answers with an OK modal instead of opening the form.
  const activeTenancy = useGetMyActiveTenancyQuery().data;
  const [notStartedOpen, setNotStartedOpen] = useState(false);
  const { closed, closedCount, open } = useMemo(
    () => splitTenantConcerns(currentQuery.data, historyQuery.data),
    [currentQuery.data, historyQuery.data],
  );
  const currentConcerns = useMemo(() => [...open].sort(sortLatest), [open]);
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

  const loadFailed = loadFailure(currentQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView>
        <ScreenHeader
          title="Concerns,"
          italicTail="tracked."
          subtitle="Current concerns, history and concern actions for your active tenancy."
        />

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ConcernActionTile
              art={<CreateConcernIcon size={44} />}
              label="Create concern"
              meta="Raise a new issue"
              onPress={() =>
                activeTenancy && tenancyNotStarted(activeTenancy.tenancy.startDate)
                  ? setNotStartedOpen(true)
                  : router.push("/create-concern")
              }
            />
            <ConcernActionTile
              art={<ClosedConcernsIcon size={44} />}
              label="Closed concerns"
              meta={String(closedCount) + " in history"}
              // Its own screen now, not a sheet (user, 2026-11-11).
              onPress={() => router.push("/concerns-closed")}
            />
        </View>

        {/* A bold line, not a section header, as on the Request desk (user, 2026-11-11). */}
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>Open concerns</Text>

          {(currentQuery.isFetching && !currentQuery.data) || (historyQuery.isFetching && !historyQuery.data) ? (
            <SkeletonCard />
          ) : currentConcerns.length > 0 ? (
            currentConcerns.map((concern) => (
              <ConcernCard concern={concern} key={concern.id} onPress={() => openConcern(concern)} />
            ))
          ) : (
            <EmptyState artworkTextGap={CONCERN_EMPTY_GAP}
              artwork={CONCERN_EMPTY_ILLUSTRATION}
              title="No open concerns"
              description="New, in-progress and resolved concerns stay here until they are closed."
            />
          )}
      </ScreenScrollView>

      {notStartedOpen ? (
        <AlertModal message={REQUESTS_NOT_STARTED.concern} onClose={() => setNotStartedOpen(false)} tone="info" />
      ) : null}

    </View>
  );
}

function ConcernActionTile({
  art,
  label,
  meta,
  onPress,
}: {
  art: ReactNode;
  label: string;
  meta: string;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flex: 1,
        gap: spacing.sm,
        minHeight: 124,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
        {art}
        <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2, justifyContent: "flex-end" }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 21 }}>
          {label}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>{meta}</Text>
      </View>
    </AnimatedPressable>
  );
}

// The tenant queue now uses the same compact, information-first card as the
// owner queue. The detail screen carries the full status and assignment grid.
export function ConcernCard({ concern, onPress }: { concern: ConcernSummary; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();
  const completed = !concern.reopened && (concern.status === "RESOLVED" || concern.status === "CLOSED");
  const inProgress = !concern.reopened && concern.status === "IN_PROGRESS";
  const statusLabel = concern.reopened ? "Reopened" : inProgress ? "In progress" : concern.status === "UNDER_REVIEW" ? "In review" : humanizeToken(concern.status);
  const statusColor = concern.reopened ? colors.danger : completed ? colors.jade : inProgress ? colors.warningText : colors.primary;
  const statusFill = concern.reopened ? colors.dangerSoft : completed ? colors.successSoft : inProgress ? colors.warningSoft : colors.primarySoft;
  const statusIcon = concern.reopened ? "restore" : completed ? "check" : inProgress ? "progress-wrench" : "clipboard-search";

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>{concern.referenceCode}</Text>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 4, backgroundColor: statusFill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
            <View style={{ alignItems: "center", justifyContent: "center", backgroundColor: statusColor, borderRadius: 999, height: 14, width: 14 }}>
              <MaterialCommunityIcons name={statusIcon} color="#FFFFFF" size={10} />
            </View>
            <Text style={{ color: statusColor, fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 15 }}>{statusLabel}</Text>
          </View>
        </View>
        <FitText numberOfLines={1} style={[type.display, { color: colors.ink, fontSize: 21, lineHeight: 26 }]}>
          {concern.title}
        </FitText>
        <ConcernMetaRow concern={concern} />
        {concern.status === "RESOLVED" && concern.reopenUntil && new Date(concern.reopenUntil).getTime() > Date.now() ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.warningSoft, borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
            <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.warningSoft }}>
              <MaterialCommunityIcons name="calendar-outline" size={18} color={colors.warningText} />
            </View>
            <Text style={[type.caption, { color: colors.warningText, flex: 1 }]}>
              Reopen until: {formatDateTime(concern.reopenUntil)}
            </Text>
          </View>
        ) : null}
        <ActionButton icon={Eye} label="View" onPress={onPress} variant="primary" />
      </View>
    </Card>
  );
}


export function sortLatest(left: ConcernSummary, right: ConcernSummary) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
