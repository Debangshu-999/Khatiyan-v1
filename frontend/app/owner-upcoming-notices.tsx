import { useState } from "react";
import { Dimensions, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CalendarClock, Clock, Edit3, Info, Megaphone, Repeat2, X } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { CollapsibleFilterBubbles } from "@/components/filter-bubbles";
import { InfoModal } from "@/components/info-modal";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import {
  ActionButton,
  FormInput,
  IconButton,
  ViewOnlyChip,
  humanizeToken,
} from "@/features/owner/owner-ui";
import { NoticeCardBody } from "@/features/notice/notice-card-body";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import {
  type NoticePriority,
  type NoticeSummary,
  useDelayNoticeMutation,
  useListUpcomingNoticesQuery,
  useUpdateNoticeMutation,
} from "@/store/services/notice-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type UpcomingFilter = "all" | "normal" | "recurring";

const PRIORITIES: NoticePriority[] = ["NORMAL", "IMPORTANT", "URGENT", "EMERGENCY"];

/**
 * The three-hour window before a notice reaches tenants.
 *
 * <p>Recurring notices materialise one row per day, so editing an occurrence
 * here changes that day alone — tomorrow regenerates from the template. That is
 * what makes "attach today's menu to the lunch notice" possible without the
 * attachment sticking around all week.
 *
 * <p>Deleting is deliberately absent: this screen is for catching a notice
 * before it lands, not for managing the notice list. Deletion stays in Notices.
 */
export default function OwnerUpcomingNoticesScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);

  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const canManageNotices = canManageResource("NOTICES");

  const [filter, setFilter] = useState<UpcomingFilter>("all");
  const [delaying, setDelaying] = useState<NoticeSummary | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const upcomingQuery = useListUpcomingNoticesQuery(selectedProperty?.id ?? "", {
    skip: !selectedProperty,
    // The window is time-relative, so a stale list ages into being wrong.
    pollingInterval: 60_000,
    refetchOnMountOrArgChange: true,
  });

  const upcoming = upcomingQuery.data ?? [];
  const notices = upcoming.filter((notice) => {
    if (filter === "normal") {
      return notice.recurringNoticeId === null;
    }
    if (filter === "recurring") {
      return notice.recurringNoticeId !== null;
    }
    return true;
  });

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Notices"
        onBack={() => router.back()}
        badge={!canManageNotices ? <ViewOnlyChip /> : null}
        italicTail="soon."
        subtitle={
          selectedProperty
            ? `Notices reaching ${selectedProperty.name} within the next three hours.`
            : "Select a property from Home first."
        }
        title="Going live"
        trailing={
          <Pressable
            accessibilityLabel="What does this screen show?"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setInfoOpen(true)}
            style={{ alignItems: "center", height: 30, justifyContent: "center", width: 30 }}
          >
            <Info color={colors.kicker} size={18} strokeWidth={2.2} />
          </Pressable>
        }
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Upcoming notices are scoped to the active owner property."
          eyebrow="Property required"
          icon={Megaphone}
          title="No property selected"
        />
      ) : null}

      {selectedProperty ? (
        <>
          <Section
            eyebrow="Next three hours"
            title={`${notices.length} ${notices.length === 1 ? "notice" : "notices"}`}
            trailingInline
            trailing={
              <CollapsibleFilterBubbles
                onChange={setFilter}
                options={[
                  { label: "All", value: "all" as const },
                  { label: "Scheduled", value: "normal" as const },
                  { label: "Recurring", value: "recurring" as const },
                ]}
                value={filter}
              />
            }
          >
            {upcomingQuery.isLoading ? (
              <SkeletonCard />
            ) : notices.length > 0 ? (
              notices.map((notice) => (
                <UpcomingNoticeCard
                  canManage={canManageNotices}
                  key={notice.id}
                  notice={notice}
                  onDelay={() => setDelaying(notice)}
                  onEdit={() => router.push(`/owner-notice-detail?noticeId=${notice.id}&edit=1`)}
                  onOpen={() => router.push(`/owner-notice-detail?noticeId=${notice.id}`)}
                />
              ))
            ) : (
              <NothingUpcoming filter={filter} />
            )}
          </Section>
        </>
      ) : null}

      {delaying ? (
        <DelaySheet
          notice={delaying}
          onClose={() => setDelaying(null)}
          onDelayed={() => {
            setDelaying(null);
            toast.show("Notice postponed.", "success");
          }}
        />
      ) : null}

      {infoOpen ? <UpcomingInfoModal onClose={() => setInfoOpen(false)} /> : null}
    </ScreenScrollView>
  );
}

/**
 * Centred rather than boxed: an empty three-hour window is the normal state, so
 * it reads as reassurance instead of a card reporting a gap.
 */
function NothingUpcoming({ filter }: { filter: UpcomingFilter }) {
  const { colors, fonts, type } = useTheme();

  // Sits in the middle of the space the list would have filled, rather than
  // riding up under the section rule. Roughly half the viewport is what is left
  // below the header, filter bar and section heading.
  const minHeight = Math.round(Dimensions.get("window").height * 0.46);

  return (
    <View
      style={{
        alignItems: "center",
        gap: spacing.md,
        justifyContent: "center",
        minHeight,
        paddingHorizontal: spacing.lg,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.ink,
          borderCurve: "continuous",
          borderRadius: 18,
          borderWidth: 1,
          height: 58,
          justifyContent: "center",
          width: 58,
        }}
      >
        <CalendarClock color={colors.ink} size={26} strokeWidth={2} />
      </View>
      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, }}>
          All clear
        </Text>
        <Text style={[type.body, { color: colors.muted, maxWidth: 320, textAlign: "center" }]}>
          {filter === "recurring"
            ? "No recurring notice is due in the next three hours."
            : filter === "normal"
              ? "No scheduled notice is due in the next three hours."
              : "Nothing upcoming. Notices appear here before tenants see them."}
        </Text>
      </View>
    </View>
  );
}

function UpcomingInfoModal({ onClose }: { onClose: () => void }) {
  const { colors, type } = useTheme();

  return (
    <InfoModal onClose={onClose} title="Upcoming notices">
      <Text style={[type.body, { color: colors.muted, lineHeight: 22 }]}>
        Every notice publishing in the next three hours — one-off notices you scheduled ahead, and today&apos;s run of
        each recurring notice.
      </Text>
      <Text style={[type.body, { color: colors.muted, lineHeight: 22 }]}>
        Edit one to change its wording before tenants see it, or delay it to push the go-live time back. A recurring
        notice gets a fresh copy each day, so edits and delays here apply to today only.
      </Text>
      <Text style={[type.body, { color: colors.muted, lineHeight: 22 }]}>
        Deleting a notice stays in the Notices screen.
      </Text>
    </InfoModal>
  );
}


function UpcomingNoticeCard({
  canManage,
  notice,
  onDelay,
  onEdit,
  onOpen,
}: {
  canManage: boolean;
  notice: NoticeSummary;
  onDelay: () => void;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const { colors, type } = useTheme();
  const isRecurring = notice.recurringNoticeId !== null;

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={[type.eyebrow, { color: priorityColor(notice.priority, colors) }]}>
            {humanizeToken(notice.priority)}
          </Text>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 999,
              flexDirection: "row",
              gap: 4,
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
            }}
          >
            {isRecurring ? <Repeat2 color={colors.kicker} size={13} /> : <Clock color={colors.kicker} size={13} />}
            <Text style={[type.caption, { color: colors.kicker, fontWeight: "700" }]}>
              {isRecurring ? "RECURRING" : "SCHEDULED"}
            </Text>
          </View>
        </View>

        {/* Tapping the notice itself opens its detail screen. */}
        <NoticeCardBody attachmentCount={notice.attachments.length} body={notice.body} onPress={onOpen} title={notice.title} />

        <Text style={[type.caption, { color: colors.kicker }]}>
          Goes live {countdownLabel(notice.visibleFrom)} · {formatTimeOfDay(notice.visibleFrom)}
          {notice.visibleUntil ? ` to ${formatTimeOfDay(notice.visibleUntil)}` : ""}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <ActionButton disabled={!canManage} icon={Edit3} label="Edit" onPress={onEdit} variant="secondary" />
          <ActionButton disabled={!canManage} icon={Clock} label="Delay" onPress={onDelay} variant="secondary" />
        </View>
      </View>
    </Card>
  );
}

/**
 * Postpones the go-live time. The window slides whole, so a notice keeps the
 * duration it was written for rather than being silently shortened.
 */
function DelaySheet({
  notice,
  onClose,
  onDelayed,
}: {
  notice: NoticeSummary;
  onClose: () => void;
  onDelayed: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [picked, setPicked] = useState<Date>(new Date(notice.visibleFrom));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delayNotice, delayState] = useDelayNoticeMutation();

  const originalStart = new Date(notice.visibleFrom);
  const durationMs = notice.visibleUntil ? new Date(notice.visibleUntil).getTime() - originalStart.getTime() : null;
  const newEnd = durationMs === null ? null : new Date(picked.getTime() + durationMs);

  function onPick(event: DateTimePickerEvent, selected?: Date) {
    setPickerOpen(false);
    if (event.type === "dismissed" || !selected) {
      return;
    }

    // The picker only offers a time, so keep the notice's own date.
    const next = new Date(originalStart);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setPicked(next);
    setError(null);
  }

  async function submit() {
    if (picked.getTime() <= Date.now()) {
      setError("Pick a time later than right now.");
      return;
    }
    if (picked.getTime() < originalStart.getTime()) {
      setError("A notice can be postponed, not brought forward.");
      return;
    }
    if (picked.getTime() === originalStart.getTime()) {
      setError("Pick a later time to postpone this notice.");
      return;
    }

    try {
      await delayNotice({ noticeId: notice.id, visibleFrom: picked.toISOString() }).unwrap();
      onDelayed();
    } catch {
      setError("Could not postpone the notice. Try again.");
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      {/* Same shell as AddClauseSheet: the sheet needs maxHeight plus a
          shrinkable ScrollView or its content runs off the bottom of the
          screen, and Expo 56 Android needs the KAV to lift it. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: spacing.sm,
                justifyContent: "space-between",
                marginBottom: spacing.md,
              }}
            >
              <Text
                style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}
                numberOfLines={1}
              >
                Delay notice
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>

            <ScrollView
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
            <Text style={[type.body, { color: colors.muted }]} numberOfLines={2}>
              {notice.title}
            </Text>

            <View style={{ gap: spacing.xs }}>
              <Text style={[type.caption, { color: colors.kicker, fontWeight: "700" }]}>NEW START TIME</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerOpen(true)}
                style={{
                  alignItems: "center",
                  borderColor: colors.border,
                  borderRadius: 14,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <Clock color={colors.kicker} size={16} />
                <Text style={[type.body, { color: colors.ink }]}>{formatTimeOfDay(picked.toISOString())}</Text>
              </Pressable>
            </View>

            <Text style={[type.caption, { color: colors.kicker }]}>
              {newEnd
                ? `Was ${formatTimeOfDay(notice.visibleFrom)} to ${formatTimeOfDay(notice.visibleUntil ?? "")} · becomes ${formatTimeOfDay(picked.toISOString())} to ${formatTimeOfDay(newEnd.toISOString())}`
                : `Was ${formatTimeOfDay(notice.visibleFrom)} · becomes ${formatTimeOfDay(picked.toISOString())}`}
            </Text>

            {notice.recurringNoticeId ? (
              <Text style={[type.caption, { color: colors.kicker }]}>
                Today only. Tomorrow keeps the recurring schedule.
              </Text>
            ) : null}

            {error ? (
              <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]}>
                {error}
              </Text>
            ) : null}

            <ActionButton
                disabled={delayState.isLoading}
                icon={Clock}
                label={delayState.isLoading ? "Postponing…" : "Postpone"}
                onPress={submit}
              />
            </ScrollView>

            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
          </View>
        </View>
      </KeyboardAvoidingView>

      {pickerOpen ? <DateTimePicker mode="time" onChange={onPick} value={picked} /> : null}
    </Modal>
  );
}

// Chips, not a switcher: these narrow one list rather than showing a different
// thing. Same distinction as the notices Published/Visible/Archived filter.
function priorityColor(priority: NoticePriority, colors: ReturnType<typeof useTheme>["colors"]) {
  return priority === "EMERGENCY" || priority === "URGENT" ? colors.danger : colors.kicker;
}

function formatTimeOfDay(value: string) {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** "in 12 min" / "in 2 h 05 m" — the horizon is only three hours wide. */
function countdownLabel(visibleFrom: string) {
  const minutes = Math.round((new Date(visibleFrom).getTime() - Date.now()) / 60_000);

  if (minutes <= 0) {
    return "any moment";
  }
  if (minutes < 60) {
    return `in ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `in ${hours} h ${String(rest).padStart(2, "0")} m`;
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (properties.length === 0) {
    return null;
  }
  return properties.find((property) => property.id === selectedPropertyId) ?? properties[0];
}
