import { HelpModalClose } from "@/components/help-modal-header";
import { FILTER_CHIP_RADIUS } from "@/components/filter-bubbles";
import { FilterMark } from "@/features/owner/status-filter-marks";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ModalTitle } from "@/components/modal-title";
import { CenterModal } from "@/components/center-modal";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  CalendarDays,
  ChevronDown,
  KeyRound,
  ListFilter,
  SlidersHorizontal,
  X,
} from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { ActionButton } from "@/features/owner/owner-ui";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { PickerOptionRow } from "@/components/picker-option-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField, SearchFilterButton } from "@/components/search-field";
import { SkeletonList } from "@/components/skeleton";
import {
  buildExitRequestChains,
  buildRoomChangeRequestChains,
  type ExitRequestChain,
  type RoomChangeRequestChain,
} from "@/features/tenancy/request-chain";
import { isRequestActive, matchesRequestSearch } from "@/features/tenancy/request-activity";
import {
  useGetMyActiveTenancyQuery,
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
  type TenancyExitRequest,
  type TenancyRoomChangeRequest,
} from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { ExitCard, RoomChangeCard } from "./tenancy-request-history";
import { FitText } from "@/components/fit-text";

const EMPTY_ILLUSTRATION = require("../assets/empty-states/concern-empty_state.png");

type HistoricalRequest =
  | { chain?: ExitRequestChain; kind: "EXIT"; request: TenancyExitRequest }
  | { chain?: RoomChangeRequestChain; kind: "ROOM_CHANGE"; request: TenancyRoomChangeRequest };
type StatusFilter = "ALL" | "APPROVED" | "REJECTED";
type TenancyFilter = "ALL" | "CURRENT" | "PAST";
type RequestTypeFilter = "ALL" | "EXIT" | "ROOM_CHANGE";
type PickerName = "STATUS" | "TENANCY" | "TYPE";
type PickerOption = { label: string; value: string };

const STATUS_OPTIONS: PickerOption[] = [
  { label: "Any status", value: "ALL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

const TENANCY_OPTIONS: PickerOption[] = [
  { label: "Any tenancy", value: "ALL" },
  { label: "Current tenancy", value: "CURRENT" },
  { label: "Past tenancies", value: "PAST" },
];

const TYPE_OPTIONS: PickerOption[] = [
  { label: "All request types", value: "ALL" },
  { label: "Exit requests", value: "EXIT" },
  { label: "Room change requests", value: "ROOM_CHANGE" },
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function TenancyPastRequestsScreen() {
  const params = useLocalSearchParams<{ scope?: string; tenancyId?: string }>();
  const exitQuery = useListMyExitRequestsQuery(undefined, { refetchOnMountOrArgChange: true });
  const roomChangeQuery = useListMyRoomChangeRequestsQuery(undefined, { refetchOnMountOrArgChange: true });
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const activeTenancyId = activeTenancyQuery.data?.tenancy.id ?? params.tenancyId ?? null;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [tenancy, setTenancy] = useState<TenancyFilter>("ALL");
  const [requestType, setRequestType] = useState<RequestTypeFilter>("ALL");
  const [year, setYear] = useState("ALL");
  const [month, setMonth] = useState("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { colors, fonts } = useTheme();

  const chains = useMemo(() => buildExitRequestChains(exitQuery.data ?? []), [exitQuery.data]);
  const roomChains = useMemo(
    () => buildRoomChangeRequestChains(roomChangeQuery.data ?? []),
    [roomChangeQuery.data],
  );
  const history = useMemo<HistoricalRequest[]>(() => {
    const exits = chains
      .filter((chain) => !isRequestActive(chain.head))
      .map((chain) => ({ chain, kind: "EXIT" as const, request: chain.head }));
    const roomChanges = roomChains
      .filter((chain) => !isRequestActive(chain.head))
      .map((chain) => ({ chain, kind: "ROOM_CHANGE" as const, request: chain.head }));

    return [...exits, ...roomChanges].sort(
      (left, right) => historyTime(right.request) - historyTime(left.request),
    );
  }, [chains, roomChains]);

  const years = useMemo(
    () =>
      [...new Set([String(new Date().getFullYear()), ...history.map((entry) => historyParts(entry.request).year)])]
        .sort((left, right) => Number(right) - Number(left))
        .map((value) => ({ label: value, value })),
    [history],
  );

  const shown = useMemo(() => {
    return history.filter((entry) => {
      const request = entry.request;
      const parts = historyParts(request);
      const tenancyMatches =
        tenancy === "ALL"
        || (tenancy === "CURRENT" && activeTenancyId != null && request.tenancyId === activeTenancyId)
        || (tenancy === "PAST" && (activeTenancyId == null || request.tenancyId !== activeTenancyId));

      return (
        matchesStatusFilter(entry, status)
        && (requestType === "ALL" || entry.kind === requestType)
        && tenancyMatches
        && (year === "ALL" || parts.year === year)
        && (month === "ALL" || parts.month === month)
        && matchesRequestSearch(request, search)
      );
    });
  }, [activeTenancyId, history, month, requestType, search, status, tenancy, year]);

  const loading =
    (exitQuery.isFetching && !exitQuery.data)
    || (roomChangeQuery.isFetching && !roomChangeQuery.data);
  const narrowed = search.trim().length > 0
    || status !== "ALL"
    || tenancy !== "ALL"
    || requestType !== "ALL"
    || year !== "ALL"
    || month !== "ALL";

  const activeFilters = [status !== "ALL", requestType !== "ALL", tenancy !== "ALL", month !== "ALL", year !== "ALL"].filter(Boolean).length;

  const loadFailed = loadFailure(exitQuery, roomChangeQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  return (
    // The search row sticks under the header while the list scrolls (user, 2026-11-11).
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} stickyHeaderIndices={[1]} surface={colors.background}>
      <ScreenHeader
        title="Past"
        italicTail="requests."
        subtitle="Expired exit and room-change requests from your tenancies."
      />

      <View style={{ backgroundColor: colors.background, marginHorizontal: -spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
        {/* On a phone a sticky child's style moves to a wrapper: the row needs its own View. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SearchField autoCapitalize="characters" onChangeText={setSearch} placeholder="Search by request reference" value={search} />
          </View>
          <SearchFilterButton accessibilityLabel="Filters" active={activeFilters > 0} count={activeFilters} onPress={() => setFiltersOpen(true)} />
        </View>
      </View>

      {loading ? (
        <SkeletonList rows={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          artwork={EMPTY_ILLUSTRATION}
          title={narrowed ? "No matching requests" : "No past requests"}
          description={
            narrowed
              ? "Try another status, date, tenancy or request reference."
              : "Requests appear here after their action window expires."
          }
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {shown.map((entry) =>
            entry.kind === "EXIT" ? (
              <ExitCard chain={entry.chain} key={`exit-${entry.request.id}`} request={entry.request} />
            ) : (
              <RoomChangeCard chain={entry.chain} key={`room-${entry.request.id}`} request={entry.request} />
            ),
          )}
        </View>
      )}


      {filtersOpen ? (
        <RequestFiltersSheet
          initial={{ month, requestType, status, tenancy, year }}
          onApply={(next) => {
            setStatus(next.status);
            setRequestType(next.requestType);
            setTenancy(next.tenancy);
            setMonth(next.month);
            setYear(next.year);
          }}
          onClose={() => setFiltersOpen(false)}
          years={years}
        />
      ) : null}
    </ScreenScrollView>
  );
}






function historyParts(request: TenancyExitRequest | TenancyRoomChangeRequest) {
  const date = new Date(request.expiresAt ?? request.updatedAt ?? request.createdAt);
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(date);
  return {
    month: parts.find((part) => part.type === "month")?.value ?? "",
    year: parts.find((part) => part.type === "year")?.value ?? "",
  };
}

function historyTime(request: TenancyExitRequest | TenancyRoomChangeRequest) {
  return new Date(request.expiresAt ?? request.updatedAt ?? request.createdAt).getTime();
}

function matchesStatusFilter(entry: HistoricalRequest, status: StatusFilter) {
  if (status === "ALL") {
    return true;
  }
  if (status === "APPROVED") {
    return entry.request.status === "APPROVED"
      || (entry.kind === "EXIT" && entry.request.status === "EXECUTED");
  }
  return entry.request.status === "REJECTED";
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateFilterLabel(month: string, year: string) {
  if (month === "ALL" && year === "ALL") {
    return "Month & year";
  }
  if (month === "ALL") {
    return year;
  }
  const monthName = MONTH_NAMES[Number(month) - 1] ?? "Month";
  return year === "ALL" ? monthName : `${monthName.slice(0, 3)} ${year}`;
}

type RequestFilters = { month: string; requestType: RequestTypeFilter; status: StatusFilter; tenancy: TenancyFilter; year: string };

/**
 * Every filter in one bottom sheet (user, 2026-11-11): status, type, tenancy,
 * month and year as bubbles, applied together with Show requests.
 */
function RequestFiltersSheet({
  initial,
  onApply,
  onClose,
  years,
}: {
  initial: RequestFilters;
  onApply: (filters: RequestFilters) => void;
  onClose: () => void;
  years: PickerOption[];
}) {
  const { colors, type } = useTheme();
  const [draft, setDraft] = useState<RequestFilters>(initial);
  const set = (patch: Partial<RequestFilters>) => setDraft((current) => ({ ...current, ...patch }));
  const group = (label: string, options: PickerOption[], value: string, pick: (value: string) => void) => (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {options.map((option) => (
          <SelectPill active={option.value === value} key={option.value} label={option.label} onPress={() => pick(option.value)} />
        ))}
      </View>
    </View>
  );
  return (
    <SheetShell
      footer={
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton
            label="Clear all"
            onPress={() => setDraft({ month: "ALL", requestType: "ALL", status: "ALL", tenancy: "ALL", year: "ALL" })}
            variant="secondary"
          />
          <ActionButton
            label="Show requests"
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
        </View>
      }
      onClose={onClose}
      size="content"
      title="Filter requests"
    >
      <View style={{ gap: spacing.lg }}>
        {group("Status", STATUS_OPTIONS.map((option) => (option.value === "ALL" ? { ...option, label: "Any" } : option)), draft.status, (value) => set({ status: value as StatusFilter }))}
        {group("Type", [{ label: "All", value: "ALL" }, { label: "Exit", value: "EXIT" }, { label: "Room change", value: "ROOM_CHANGE" }], draft.requestType, (value) => set({ requestType: value as RequestTypeFilter }))}
        {group("Tenancy", [{ label: "Any", value: "ALL" }, { label: "Current", value: "CURRENT" }, { label: "Past", value: "PAST" }], draft.tenancy, (value) => set({ tenancy: value as TenancyFilter }))}
        {group("Year", [{ label: "Any", value: "ALL" }, ...years], draft.year, (value) => set({ year: value }))}
        {group("Month", [{ label: "Any", value: "ALL" }, ...MONTH_NAMES.map((name, index) => ({ label: name.slice(0, 3), value: String(index + 1).padStart(2, "0") }))], draft.month, (value) => set({ month: value }))}
      </View>
    </SheetShell>
  );
}

/** A white pill, a blue edge and label when chosen (user, 2026-11-11: no blue fills here). */
function SelectPill({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: active ? colors.primary : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: FILTER_CHIP_RADIUS,
        borderWidth: active ? 1.5 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: active ? colors.primary : colors.ink, fontFamily: active ? fonts.sansBold : fonts.sansMedium, fontSize: 13 }}>{label}</Text>
    </AnimatedPressable>
  );
}
