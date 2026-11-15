import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ArrowLeftRight, ChevronDown, ChevronRight, Inbox } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { InPageDropdown, useInPageDropdown } from "@/components/anchored-dropdown";
import { PastRequestsIcon } from "@/components/past-requests-icon";
import { DigestMoveOutsColorIcon } from "@/components/digest-color-icons";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { LoadFailed, loadFailure } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
import { PILL_CHOICE_MAX_WIDTH, pillChoice } from "@/components/filtered-queue";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { buildExitRequestChains, buildRoomChangeRequestChains } from "@/features/tenancy/request-chain";
import { splitByActivity } from "@/features/tenancy/request-activity";
import {
  exitRequestBlock,
  pendingExitBlock,
  RequestBlockedModal,
  roomChangeRequestBlock,
  type RequestBlock,
} from "@/features/tenancy/request-blocked-modal";
import { REQUESTS_NOT_STARTED, tenancyNotStarted } from "@/features/tenancy/starts-soon-bubble";
import { RequestTile } from "@/features/tenancy/tenant-tool-cards";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  useGetMyActiveTenancyQuery,
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
} from "@/store/services/tenancy-api";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { ExitCard, RoomChangeCard } from "./tenancy-request-history";

/** The owner's request screens' empty picture (user, 2026-11-11). */
const REQUEST_EMPTY_ILLUSTRATION = require("../assets/empty-states/concern-empty_state.png");

type KindFilter = "ALL" | "ROOM_CHANGE" | "EXIT";
const KIND_SHORT: Record<KindFilter, string> = { ALL: "All", EXIT: "Exit", ROOM_CHANGE: "Room change" };
const KIND_OPTIONS: { label: string; value: KindFilter }[] = [
  { label: "All requests", value: "ALL" },
  { label: "Room change", value: "ROOM_CHANGE" },
  { label: "Exit request", value: "EXIT" },
];

/**
 * The Request desk (user, 2026-11-10): raise a room change or an exit, the
 * past requests under them, then the requests still open, with a search and a
 * filter by kind. No section headers. The checks before raising one are the
 * Tenancy tab's, unchanged.
 */
export default function TenancyRequestDeskScreen() {
  const { colors, fonts } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ exitRequestCreated?: string; roomChangeRequested?: string }>();
  const activeTenancy = useGetMyActiveTenancyQuery().data;
  const exitRequestsQuery = useListMyExitRequestsQuery(undefined, { refetchOnMountOrArgChange: true });
  const roomChangeRequestsQuery = useListMyRoomChangeRequestsQuery(undefined, { refetchOnMountOrArgChange: true });
  const [requestBlock, setRequestBlock] = useState<RequestBlock | null>(null);
  const [notStartedMessage, setNotStartedMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  // Drawn in the screen, not a modal window: on a phone the modal's list landed over the pill,
  // and failed to open once scrolled (user, 2026-11-14).
  const dropdown = useInPageDropdown();
  const toastShown = useRef(false);

  // Back here after raising one, with a word that it went through.
  useEffect(() => {
    if (toastShown.current) return;
    if (params.exitRequestCreated === "1") {
      toastShown.current = true;
      toast.success("Exit request created.");
    } else if (params.roomChangeRequested === "1") {
      toastShown.current = true;
      toast.success("Room change request recorded.");
    }
  }, [params.exitRequestCreated, params.roomChangeRequested, toast]);

  const exitChains = useMemo(() => buildExitRequestChains(exitRequestsQuery.data ?? []), [exitRequestsQuery.data]);
  const roomChains = useMemo(() => buildRoomChangeRequestChains(roomChangeRequestsQuery.data ?? []), [roomChangeRequestsQuery.data]);
  const exits = splitByActivity(exitChains.map((chain) => chain.head));
  const roomChanges = splitByActivity(roomChains.map((chain) => chain.head));
  const pastCount = exits.history.length + roomChanges.history.length;

  // The queue: what can still be acted on, newest first.
  const needle = query.trim().toLowerCase();
  const queue = [
    ...exits.active.map((request) => ({ kind: "EXIT" as const, request })),
    ...roomChanges.active.map((request) => ({ kind: "ROOM_CHANGE" as const, request })),
  ]
    .filter((entry) => kind === "ALL" || entry.kind === kind)
    .filter((entry) => {
      if (!needle) return true;
      const words = [
        entry.request.referenceCode,
        entry.kind === "EXIT" ? "exit request" : "room change request",
        entry.request.status.replace(/_/g, " "),
        entry.request.tenantReason ?? "",
      ].join(" ").toLowerCase();
      return words.includes(needle);
    })
    .sort((left, right) => Date.parse(right.request.createdAt) - Date.parse(left.request.createdAt));

  const loading = exitRequestsQuery.isFetching || roomChangeRequestsQuery.isFetching;
  const failed = loadFailure(exitRequestsQuery, roomChangeRequestsQuery);
  const firstLoad = loading && !exitRequestsQuery.data && !roomChangeRequestsQuery.data;

  function open(request: "roomChange" | "exit") {
    if (!activeTenancy) return;
    // Nothing about open requests matters before the stay has begun.
    if (tenancyNotStarted(activeTenancy.tenancy.startDate)) {
      setNotStartedMessage(REQUESTS_NOT_STARTED[request]);
      return;
    }
    if (loading) return;
    const blockFor = request === "exit" ? exitRequestBlock : roomChangeRequestBlock;
    const block = pendingExitBlock(activeTenancy.tenancy) ?? blockFor(exitRequestsQuery.data, roomChangeRequestsQuery.data, activeTenancy.tenancy.id);
    if (block) {
      setRequestBlock(block);
      return;
    }
    router.push(request === "exit" ? "/tenancy-exit-request" : "/tenancy-room-change-request");
  }

  return (
    <View collapsable={false} ref={dropdown.host} style={{ backgroundColor: colors.background, flex: 1 }}>
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader italicTail="desk." subtitle="Ask for a room change or to move out, and follow what you asked." title="Request" />

      {activeTenancy ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <RequestTile disabled={loading} icon={ArrowLeftRight} label="Room change" onPress={() => open("roomChange")} />
          <RequestTile disabled={loading} icon={DigestMoveOutsColorIcon} label="Exit request" onPress={() => open("exit")} />
        </View>
      ) : null}

      {firstLoad ? (
        <SkeletonCard />
      ) : (
        <PastRequestsRow count={pastCount} onPress={() => router.push("/tenancy-past-requests")} />
      )}

      {/* A bold line, not a section header (user, 2026-11-11). */}
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>Active requests</Text>

      {/* The search with the kind dropdown beside it, a small grey pill (user, 2026-11-10). */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SearchField autoCapitalize="characters" onChangeText={setQuery} placeholder="Search requests" value={query} />
        </View>
        <View collapsable={false} ref={dropdown.ref}>
          <AnimatedPressable
            accessibilityLabel={`Show ${KIND_OPTIONS.find((option) => option.value === kind)?.label ?? "All requests"}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: Boolean(dropdown.trigger) }}
            onPress={dropdown.open}
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 999,
              flexDirection: "row",
              gap: 4,
              height: 36,
              paddingLeft: spacing.md,
              paddingRight: spacing.sm,
            }}
          >
            <Text ellipsizeMode="tail" numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 12.5, maxWidth: PILL_CHOICE_MAX_WIDTH }}>{pillChoice(KIND_SHORT[kind])}</Text>
            <ChevronDown color={colors.ink} size={15} strokeWidth={2.4} />
          </AnimatedPressable>
        </View>
      </View>

      {failed ? (
        <LoadFailed error={failed.error} onReload={failed.reload} />
      ) : firstLoad ? (
        <SkeletonList rows={1} />
      ) : queue.length === 0 ? (
        <EmptyState
          artwork={REQUEST_EMPTY_ILLUSTRATION}
          title={needle || kind !== "ALL" ? "No matching requests" : "No active requests"}
          description={needle || kind !== "ALL" ? "Try another search or filter." : "A room change or exit request shows here while it can still be acted on."}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {queue.map((entry) =>
            entry.kind === "EXIT" ? (
              <ExitCard chain={exitChains.find((chain) => chain.head.id === entry.request.id)} key={`exit-${entry.request.id}`} request={entry.request} />
            ) : (
              <RoomChangeCard chain={roomChains.find((chain) => chain.head.id === entry.request.id)} key={`room-${entry.request.id}`} request={entry.request} />
            ),
          )}
        </View>
      )}

      {notStartedMessage ? <AlertModal message={notStartedMessage} onClose={() => setNotStartedMessage(null)} tone="info" /> : null}
      {requestBlock ? (
        <RequestBlockedModal
          block={requestBlock}
          onClose={() => setRequestBlock(null)}
          // The open requests are right here, under the search.
          onViewRequests={() => setRequestBlock(null)}
        />
      ) : null}
    </ScreenScrollView>
      {dropdown.trigger ? (
        <InPageDropdown onClose={dropdown.close} trigger={dropdown.trigger} width={180}>
          {KIND_OPTIONS.map((option) => (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === kind }}
              key={option.value}
              onPress={() => {
                setKind(option.value);
                dropdown.close();
              }}
              style={{ backgroundColor: option.value === kind ? colors.surfaceSunken : colors.surface, padding: spacing.md }}
            >
              <Text style={{ color: colors.ink, fontFamily: option.value === kind ? fonts.sansBold : fonts.sansMedium, fontSize: 14 }}>
                {option.label}
              </Text>
            </AnimatedPressable>
          ))}
        </InPageDropdown>
      ) : null}
    </View>
  );
}

/** The past requests, one compact row with a count (user, 2026-11-10). */
function PastRequestsRow({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={`Past requests, ${count}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...cardShadow(colors.shadow),
      }}
    >
      <PastRequestsIcon size={44} />
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}>Past requests</Text>
        <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>Expired and closed requests</Text>
      </View>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{count}</Text>
      <View style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderRadius: 999, height: 30, justifyContent: "center", width: 30 }}>
        <ChevronRight color={colors.muted} size={16} strokeWidth={2.3} />
      </View>
    </AnimatedPressable>
  );
}
