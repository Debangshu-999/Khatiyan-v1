import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  ListFilter,
  SlidersHorizontal,
  X,
} from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { PickerOptionRow } from "@/components/picker-option-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SearchField } from "@/components/search-field";
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

const EMPTY_ILLUSTRATION = require("../assets/workspace/concern-empty_state.png");

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
  const [picker, setPicker] = useState<PickerName | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

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
      [...new Set(history.map((entry) => historyParts(entry.request).year))]
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

  const pickerConfig = getPickerConfig(picker, status, tenancy, requestType);
  const loading =
    (exitQuery.isFetching && !exitQuery.data)
    || (roomChangeQuery.isFetching && !roomChangeQuery.data);
  const narrowed = search.trim().length > 0
    || status !== "ALL"
    || tenancy !== "ALL"
    || requestType !== "ALL"
    || year !== "ALL"
    || month !== "ALL";

  function choosePickerValue(value: string) {
    if (picker === "STATUS") {
      setStatus(value as StatusFilter);
    } else if (picker === "TENANCY") {
      setTenancy(value as TenancyFilter);
    } else if (picker === "TYPE") {
      setRequestType(value as RequestTypeFilter);
    }
    setPicker(null);
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        title="Past"
        italicTail="requests."
        subtitle="Expired exit and room-change requests from your tenancies."
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <FilterBubble
          icon={SlidersHorizontal}
          label={status === "ALL" ? "Status" : titleCase(status)}
          onPress={() => setPicker("STATUS")}
        />
        <FilterBubble
          icon={CalendarDays}
          label={dateFilterLabel(month, year)}
          onPress={() => setDatePickerOpen(true)}
        />
        <FilterBubble
          icon={ListFilter}
          label={requestType === "ALL" ? "Type" : requestType === "EXIT" ? "Exit" : "Room change"}
          onPress={() => setPicker("TYPE")}
        />
        <FilterBubble
          icon={KeyRound}
          label={tenancy === "ALL" ? "Tenancy" : tenancy === "CURRENT" ? "Current" : "Past"}
          onPress={() => setPicker("TENANCY")}
        />
      </View>

      <SearchField
        autoCapitalize="characters"
        onChangeText={setSearch}
        placeholder="Search by request reference"
        value={search}
      />

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

      {picker && pickerConfig ? (
        <FilterPickerDialog
          onClose={() => setPicker(null)}
          onSelect={choosePickerValue}
          options={pickerConfig.options}
          title={pickerConfig.title}
          value={pickerConfig.value}
        />
      ) : null}

      {datePickerOpen ? (
        <DateFilterDialog
          month={month}
          onChange={(nextMonth, nextYear) => {
            setMonth(nextMonth);
            setYear(nextYear);
          }}
          onClose={() => setDatePickerOpen(false)}
          year={year}
          years={years}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function FilterBubble({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof CalendarDays;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? colors.neutralSoft : colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 999,
        borderWidth: 1,
        flexBasis: "47%",
        flexDirection: "row",
        flexGrow: 1,
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 44,
        paddingHorizontal: spacing.md,
      })}
    >
      <Icon color={colors.ink} size={16} strokeWidth={2.1} />
      <Text numberOfLines={1} style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.display, fontSize: 14 }}>
        {label}
      </Text>
      <ChevronDown color={colors.muted} size={15} strokeWidth={2.1} />
    </Pressable>
  );
}

function FilterPickerDialog({
  onClose,
  onSelect,
  options,
  title,
  value,
}: {
  onClose: () => void;
  onSelect: (value: string) => void;
  options: PickerOption[];
  title: string;
  value: string;
}) {
  const { colors, fonts } = useTheme();

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: radii.card,
            maxHeight: "75%",
            overflow: "hidden",
            width: "100%",
          }}
        >
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 19,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            {title}
          </Text>
          <ScrollView
            contentContainerStyle={{ paddingBottom: spacing.sm, paddingHorizontal: spacing.lg }}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 440 }}
          >
            {options.map((option) => (
              <PickerOptionRow
                key={option.value}
                label={option.label}
                onPress={() => onSelect(option.value)}
                selected={option.value === value}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DateFilterDialog({
  month,
  onChange,
  onClose,
  year,
  years,
}: {
  month: string;
  onChange: (month: string, year: string) => void;
  onClose: () => void;
  year: string;
  years: PickerOption[];
}) {
  const { colors, fonts } = useTheme();
  const [step, setStep] = useState<"MONTH" | "YEAR">("MONTH");
  const options = step === "MONTH"
    ? [
        { label: "Any month", value: "ALL" },
        ...MONTH_NAMES.map((label, index) => ({
          label,
          value: String(index + 1).padStart(2, "0"),
        })),
      ]
    : [{ label: "Any year", value: "ALL" }, ...years];
  const selectedValue = step === "MONTH" ? month : year;

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <Pressable
        accessibilityLabel="Close date filter"
        accessibilityRole="button"
        onPress={onClose}
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: radii.card,
            maxHeight: "82%",
            overflow: "hidden",
            width: "100%",
          }}
        >
          <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                minHeight: 36,
              }}
            >
              {step === "YEAR" ? (
                <Pressable
                  accessibilityLabel="Back to month"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setStep("MONTH")}
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.surfaceSunken,
                    borderRadius: 999,
                    height: 32,
                    justifyContent: "center",
                    width: 32,
                  }}
                >
                  <ChevronLeft color={colors.ink} size={21} strokeWidth={2.3} />
                </Pressable>
              ) : <View style={{ width: 32 }} />}
              <Text
                style={{
                  color: colors.ink,
                  flex: 1,
                  fontFamily: fonts.display,
                  fontSize: 21,
                  textAlign: "center",
                }}
              >
                {step === "MONTH" ? "Month" : "Year"}
              </Text>
              {step === "MONTH" ? (
                <Pressable
                  accessibilityLabel="Choose year"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setStep("YEAR")}
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.surfaceSunken,
                    borderRadius: 999,
                    height: 32,
                    justifyContent: "center",
                    width: 32,
                  }}
                >
                  <ChevronRight color={colors.ink} size={21} strokeWidth={2.3} />
                </Pressable>
              ) : <View style={{ width: 32 }} />}
            </View>

            {month !== "ALL" || year !== "ALL" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                {month !== "ALL" ? (
                  <DateSelectionChip
                    onClear={() => onChange("ALL", year)}
                    value={MONTH_NAMES[Number(month) - 1]}
                  />
                ) : null}
                {year !== "ALL" ? (
                  <DateSelectionChip
                    onClear={() => onChange(month, "ALL")}
                    value={year}
                  />
                ) : null}
              </View>
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: spacing.sm, paddingHorizontal: spacing.lg }}
            showsVerticalScrollIndicator={false}
            style={{ marginTop: spacing.sm, maxHeight: 340 }}
          >
            {options.map((option) => (
              <PickerOptionRow
                key={option.value}
                label={option.label}
                onPress={() => {
                  if (step === "MONTH") {
                    onChange(option.value, year);
                  } else {
                    onChange(month, option.value);
                  }
                }}
                selected={option.value === selectedValue}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DateSelectionChip({
  onClear,
  value,
}: {
  onClear: () => void;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: colors.primary,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        minHeight: 30,
        paddingHorizontal: spacing.sm,
      }}
    >
      <Text numberOfLines={1} style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 12 }}>
        {value}
      </Text>
      <Pressable
        accessibilityLabel={`Clear ${value}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClear}
        style={{ alignItems: "center", height: 20, justifyContent: "center", width: 20 }}
      >
        <X color={colors.onPrimary} size={12} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

function getPickerConfig(
  picker: PickerName | null,
  status: StatusFilter,
  tenancy: TenancyFilter,
  requestType: RequestTypeFilter,
) {
  if (picker === "STATUS") {
    return { options: STATUS_OPTIONS, title: "Request status", value: status };
  }
  if (picker === "TENANCY") {
    return { options: TENANCY_OPTIONS, title: "Tenancy", value: tenancy };
  }
  if (picker === "TYPE") {
    return { options: TYPE_OPTIONS, title: "Request type", value: requestType };
  }
  return null;
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
