import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ScrollView, Text, View } from "react-native";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Archive, CirclePlus, Eye, type LucideProps, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
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

const CONCERN_EMPTY_ILLUSTRATION = require("../assets/workspace/concern-empty_state.png");

export default function ConcernsScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ createdConcern?: string }>();
  const { colors } = useTheme();
  const currentQuery = useListMyCurrentConcernsQuery();
  const historyQuery = useListMyConcernHistoryQuery({ page: 0, size: 200 });
  const [historyOpen, setHistoryOpen] = useState(false);
  // Before the start date a concern cannot be raised (the server refuses it
  // too), so the tile answers with an OK modal instead of opening the form.
  const activeTenancy = useGetMyActiveTenancyQuery().data;
  const [notStartedOpen, setNotStartedOpen] = useState(false);
  const { closed, closedCount, open } = useMemo(
    () => splitTenantConcerns(currentQuery.data, historyQuery.data),
    [currentQuery.data, historyQuery.data],
  );
  const currentConcerns = useMemo(() => [...open].sort(sortLatest), [open]);
  const concernHistory = useMemo(() => [...closed].sort(sortLatest), [closed]);
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

  function openClosedConcern(concern: ConcernSummary) {
    setHistoryOpen(false);
    openConcern(concern);
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView>
        <ScreenHeader
          title="Concerns,"
          italicTail="tracked."
          subtitle="Current concerns, history and concern actions for your active tenancy."
        />

        <Section title="Concern actions">
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ConcernActionTile
              icon={CirclePlus}
              label="Create concern"
              meta="Raise a new issue"
              onPress={() =>
                activeTenancy && tenancyNotStarted(activeTenancy.tenancy.startDate)
                  ? setNotStartedOpen(true)
                  : router.push("/create-concern")
              }
            />
            <ConcernActionTile
              icon={Archive}
              label="Closed concerns"
              meta={String(closedCount) + " in history"}
              onPress={() => setHistoryOpen(true)}
            />
          </View>
        </Section>

        <Section title="Open concerns">
          {(currentQuery.isFetching && !currentQuery.data) || (historyQuery.isFetching && !historyQuery.data) ? (
            <SkeletonCard />
          ) : currentConcerns.length > 0 ? (
            currentConcerns.map((concern) => (
              <ConcernCard concern={concern} key={concern.id} onPress={() => openConcern(concern)} />
            ))
          ) : (
            <EmptyState
              artwork={CONCERN_EMPTY_ILLUSTRATION}
              title="No open concerns"
              description="New, in-progress and resolved concerns stay here until they are closed."
            />
          )}
        </Section>
      </ScreenScrollView>

      {notStartedOpen ? (
        <AlertModal message={REQUESTS_NOT_STARTED.concern} onClose={() => setNotStartedOpen(false)} tone="info" />
      ) : null}

      {historyOpen ? (
        <ClosedConcernsModal
          concerns={concernHistory}
          loading={historyQuery.isFetching && !historyQuery.data}
          onClose={() => setHistoryOpen(false)}
          onOpen={openClosedConcern}
        />
      ) : null}
    </View>
  );
}

function ConcernActionTile({
  icon: Icon,
  label,
  meta,
  onPress,
}: {
  icon: ComponentType<LucideProps>;
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
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.neutralSoft,
          borderRadius: 999,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        <Icon color={colors.ink} size={20} strokeWidth={2.2} />
      </View>
      <View style={{ gap: 2 }}>
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
function ConcernCard({ concern, onPress }: { concern: ConcernSummary; onPress: () => void }) {
  const { colors, type } = useTheme();
  const photoCount = concern.photos.filter((photo) => Boolean(photo.photoUrl)).length;
  const showEscalation = concern.escalationLevel !== "NONE" && concern.status === "OPEN";

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]}>{concern.referenceCode}</Text>
          <Text
            style={[
              type.caption,
              { color: showEscalation ? colors.danger : colors.muted, fontWeight: "900" },
            ]}
          >
            {showEscalation ? humanizeToken(concern.escalationLevel) : humanizeToken(concern.status)}
          </Text>
        </View>
        <Text numberOfLines={1} style={[type.display, { color: colors.ink, fontSize: 21, lineHeight: 26 }]}>
          {concern.title}
        </Text>
        <Text numberOfLines={2} style={[type.description, { color: colors.muted }]}>
          {concern.description}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Text style={[type.caption, { color: colors.kicker }]}>{humanizeToken(concern.category)}</Text>
          <Text style={[type.caption, { color: colors.kicker }]}>Room {concern.roomNumber}</Text>
          <Text style={[type.caption, { color: colors.kicker }]}>{formatDateTime(concern.createdAt)}</Text>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {photoCount ? String(photoCount) + " image" + (photoCount === 1 ? "" : "s") : "No images"}
          </Text>
        </View>
        {concern.statusNote ? (
          <Text numberOfLines={1} style={[type.caption, { color: colors.primary }]}>
            Note: {concern.statusNote}
          </Text>
        ) : null}
        {concern.status === "RESOLVED" && concern.reopenUntil && new Date(concern.reopenUntil).getTime() > Date.now() ? (
          <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
            Reopen until {formatDateTime(concern.reopenUntil)}. It closes after that.
          </Text>
        ) : null}
        {concern.reopened ? (
          <Text numberOfLines={1} style={[type.caption, { color: colors.danger }]}>
            Reopened: {concern.reopenReason ?? "No reason provided"}
          </Text>
        ) : null}
        <ActionButton icon={Eye} label="View" onPress={onPress} variant="secondary" />
      </View>
    </Card>
  );
}

function ClosedConcernsModal({
  concerns,
  loading,
  onClose,
  onOpen,
}: {
  concerns: ConcernSummary[];
  loading: boolean;
  onClose: () => void;
  onOpen: (concern: ConcernSummary) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      visible
    >
      {(dismiss) => <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "88%",
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>Concern history</Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23 }}>
                Closed concerns
              </Text>
            </View>
            <IconButton accessibilityLabel="Close concern history" icon={X} onPress={() => dismiss()} />
          </View>

          {loading ? (
            <SkeletonCard />
          ) : (
            <ScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
              {concerns.map((concern) => (
                <ConcernCard concern={concern} key={concern.id} onPress={() => dismiss(() => onOpen(concern))} />
              ))}
              {concerns.length === 0 ? (
                <EmptyState
                  artwork={CONCERN_EMPTY_ILLUSTRATION}
                  title="No history yet"
                  description="Concerns move here once they are closed."
                />
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>}
    </BottomSheetModal>
  );
}

function sortLatest(left: ConcernSummary, right: ConcernSummary) {
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
