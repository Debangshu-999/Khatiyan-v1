import { Pencil, Plus, Trash2 } from "lucide-react-native";
import { EmptyStayOut } from "@/components/empty-art";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { CountTabPills } from "@/components/filter-bubbles";
import { Card } from "@/components/card";
import { CardNameRow, CardStatus, cardText, smallerCardText } from "@/components/card-name-row";
import { EmptyState } from "@/components/empty-state";
import { FitText } from "@/components/fit-text";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SingleOptionPicker } from "@/components/option-picker";
import { SheetShell } from "@/components/sheet-shell";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { OwnerDataListSkeleton } from "@/components/skeletons/owner";
import { StayOutEmptyIcon } from "@/components/stay-out-icon";
import { useToast } from "@/components/toast";
import { istToday } from "@/features/analytics/period";
import { BookingDateField } from "@/features/booking/booking-date-field";
import { MEAL_LABEL } from "@/features/food/food-ui";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, FormInput } from "@/features/owner/owner-ui";
import { StayOutReasonBox, StayOutSpanPanel, StayOutStateChip } from "@/features/tenancy/stay-out-card";
import {
  leavingPart,
  mealsOff,
  nextDay,
  returnPart,
  stayOutDay,
  stayOutShortDay,
} from "@/features/tenancy/stay-out-ui";
import type { MealType } from "@/store/services/property-api";
import {
  useCancelStayOutMutation,
  useChangeStayOutMutation,
  useDeclareStayOutMutation,
  useGetMyStayOutsQuery,
  type StayOut,
} from "@/store/services/stay-out-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The tenant's stay outs (user, 2026-11-08): the nights they will be away and
 * from which meal to which. Declared here, changed here, cancelled before they
 * leave. Cards and buttons as on the owner app's lists, as the user asked.
 */
export default function TenancyStayOutsScreen() {
  const { colors, type } = useTheme();
  const listQuery = useGetMyStayOutsQuery();
  const list = listQuery.data;
  const [editing, setEditing] = useState<StayOut | "new" | null>(null);
  // The owner's filter bubbles, with Past for the finished ones (user, 2026-11-14).
  const [filter, setFilter] = useState<"all" | "away" | "upcoming" | "past">("all");
  const [cancelling, setCancelling] = useState<StayOut | null>(null);
  const [cancelStayOut] = useCancelStayOutMutation();
  const toast = useToast();
  const errors = useFormErrors<"none">();

  const loadFailed = loadFailure(listQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }
  const loading = listQuery.isLoading || !list;
  const live = list?.stayOuts.filter((stay) => stay.state !== "DONE") ?? [];
  const away = live.filter((stay) => stay.state === "AWAY");
  const upcoming = live.filter((stay) => stay.state === "UPCOMING");
  const done = list?.stayOuts.filter((stay) => stay.state === "DONE") ?? [];
  // All is everything: away and upcoming first, the past after them (user, 2026-11-14).
  const shown = filter === "away" ? away : filter === "upcoming" ? upcoming : filter === "past" ? done : [...away, ...upcoming, ...done];

  const canDeclare = Boolean(list?.available);

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
    <ScreenScrollView
      // The button is a fixed footer (user, 2026-11-08), so the list clears it.
      bottomPaddingCovered={canDeclare}
      contentContainerStyle={canDeclare ? { paddingBottom: PINNED_FOOTER_CLEARANCE } : undefined}
      safeAreaEdges={["top", "bottom"]}
    >
      <ScreenHeader italicTail="outs." subtitle="Tell your property when you will be away." title="My stay" />

      {loading ? <OwnerDataListSkeleton actions={1} bodyLines={2} rows={2} /> : null}

      {!loading && !list.available ? (
        <EmptyState artworkNode={<EmptyStayOut size={120} />} title="Stay outs are for monthly stays at PGs and hostels" />
      ) : null}

      {!loading && list.available ? (
        <>
          <CountTabPills
            onChange={setFilter}
            options={[
              { count: live.length + done.length, label: "All", value: "all" },
              { count: away.length, label: "Away", value: "away" },
              { count: upcoming.length, label: "Upcoming", value: "upcoming" },
              { count: done.length, label: "Past", value: "past" },
            ]}
            value={filter}
          />
          {/* Centred in the room the pinned footer leaves (user, 2026-11-08). */}
          {shown.length === 0 ? (
            <EmptyState
              artworkNode={<EmptyStayOut size={120} />}
              footerHeight={PINNED_FOOTER_CLEARANCE}
              title={
                filter === "away"
                  ? "You are not away"
                  : filter === "upcoming"
                    ? "No stay outs coming up"
                    : filter === "past"
                      ? "No past stay outs"
                      : "No stay outs yet"
              }
            />
          ) : null}
          {shown.map((stay) =>
            stay.state === "DONE" ? (
              <StayOutCard key={stay.id} meals={list.meals} stay={stay} />
            ) : (
              <StayOutCard
                key={stay.id}
                meals={list.meals}
                onCancel={() => setCancelling(stay)}
                onChange={() => setEditing(stay)}
                stay={stay}
              />
            ),
          )}
        </>
      ) : null}

    </ScreenScrollView>

      {canDeclare ? (
        <PinnedFooter>
          <View style={{ flexDirection: "row" }}>
            <ActionButton icon={Plus} label="Declare a stay out" onPress={() => setEditing("new")} />
          </View>
        </PinnedFooter>
      ) : null}

      {editing && list ? (
        <StayOutSheet
          checkoutDate={list.checkoutDate}
          meals={list.meals}
          onClose={() => setEditing(null)}
          stay={editing === "new" ? null : editing}
        />
      ) : null}

      {cancelling ? (
        <ConfirmDialog
          confirmLabel="Cancel stay out"
          destructive
          message={`You will be counted for meals from ${stayOutDay(cancelling.leaveDate)} again.`}
          onCancel={() => setCancelling(null)}
          onConfirm={() => {
            const stay = cancelling;
            setCancelling(null);
            cancelStayOut(stay.id)
              .unwrap()
              .then(() => toast.show("Stay out cancelled."))
              .catch((error) => errors.failFromServer(errorMessage(error)));
          }}
          title="Cancel this stay out?"
        />
      ) : null}
      {errors.serverError ? <AlertModal message={errors.serverError} onClose={errors.dismissServerError} /> : null}
    </View>
  );
}

function StayOutCard({
  meals,
  onCancel,
  onChange,
  stay,
}: {
  meals: MealType[];
  onCancel?: () => void;
  onChange?: () => void;
  stay: StayOut;
}) {
  const { colors, fonts, type } = useTheme();
  const off = mealsOff(stay, meals).reduce((total, day) => total + day.meals.length, 0);
  const nights = Math.round((Date.parse(stay.returnDate) - Date.parse(stay.leaveDate)) / 86_400_000);
  const summary = [`${nights} ${nights === 1 ? "night" : "nights"}`, meals.length ? `${off} ${off === 1 ? "meal" : "meals"} off` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        {/* The dates are the card's name, the status a slim pill beside them (user, 2026-11-08). */}
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: cardText(16) }}>
              {/* No weekday, and an arrow for the span (user, 2026-11-08). */}
              {`${stayOutShortDay(stay.leaveDate)}  →  ${stayOutShortDay(stay.returnDate)}`}
            </FitText>
            <Text style={[smallerCardText(type.caption), { color: colors.muted }]}>{summary}</Text>
          </View>
          {/* Sentence case, bold, with an icon (user, 2026-11-08). */}
          <StayOutStateChip state={stay.state} />
        </View>

        <StayOutSpanPanel
          firstMealBack={stay.firstMealBack}
          lastMealHere={stay.lastMealHere}
          leaveDate={stay.leaveDate}
          meals={meals}
          returnDate={stay.returnDate}
        />

        {stay.reason ? <StayOutReasonBox reason={stay.reason} /> : null}

        {stay.state !== "DONE" && (onChange || onCancel) ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {onChange ? (
              <ActionButton compact icon={Pencil} label={stay.canChangeLeaving ? "Change" : "Change return"} onPress={onChange} variant="secondary" />
            ) : null}
            {onCancel && stay.canCancel ? <ActionButton compact icon={Trash2} label="Cancel" onPress={onCancel} variant="dangerFilled" /> : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

type Field = "leaveDate" | "returnDate";

/** Declares a stay out, or changes one. Once gone, only the return can move. */
function StayOutSheet({
  checkoutDate,
  meals,
  onClose,
  stay,
}: {
  checkoutDate: string | null;
  meals: MealType[];
  onClose: () => void;
  stay: StayOut | null;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const today = istToday();
  const leavingLocked = Boolean(stay && !stay.canChangeLeaving);
  const [leaveDate, setLeaveDate] = useState(stay?.leaveDate ?? "");
  const [lastMealHere, setLastMealHere] = useState<MealType | null>(stay?.lastMealHere ?? null);
  const [returnDate, setReturnDate] = useState(stay?.returnDate ?? "");
  const [firstMealBack, setFirstMealBack] = useState<MealType | null>(stay?.firstMealBack ?? null);
  const [reason, setReason] = useState(stay?.reason ?? "");
  const [declare, declareState] = useDeclareStayOutMutation();
  const [change, changeState] = useChangeStayOutMutation();
  const form = useFormErrors<Field>();
  const saving = declareState.isLoading || changeState.isLoading;

  const lastOptions = useMemo(
    () => [{ label: meals.length ? `Before ${MEAL_LABEL[meals[0]].toLowerCase()}` : "Before meals", value: "NONE" as const },
      ...meals.map((meal) => ({ label: MEAL_LABEL[meal], value: meal }))],
    [meals],
  );
  const firstOptions = useMemo(
    () => [...meals.map((meal) => ({ label: MEAL_LABEL[meal], value: meal })),
      { label: meals.length ? `After ${MEAL_LABEL[meals[meals.length - 1]].toLowerCase()}` : "After meals", value: "NONE" as const }],
    [meals],
  );
  const off = mealsOff({ firstMealBack, lastMealHere, leaveDate, returnDate }, meals);
  const offCount = off.reduce((total, day) => total + day.meals.length, 0);

  async function submit() {
    const ok = form.validate({
      ...(leaveDate ? {} : { leaveDate: "Choose the day you leave." }),
      ...(!returnDate ? { returnDate: "Choose the day you are back." }
        : leaveDate && returnDate <= leaveDate ? { returnDate: "Come back at least a day after you leave." } : {}),
    });
    if (!ok) return;
    const body = { firstMealBack, lastMealHere, leaveDate, reason: reason.trim() || null, returnDate };
    try {
      if (stay) {
        await change({ body, id: stay.id }).unwrap();
        toast.show("Stay out changed.");
      } else {
        await declare(body).unwrap();
        toast.show("Stay out declared. Your property can see it.");
      }
      onClose();
    } catch (error) {
      form.failFromServer(errorMessage(error));
    }
  }

  return (
    <SheetShell
      footer={<ActionButton disabled={saving || form.blocked} label={saving ? "Saving" : stay ? "Save changes" : "Declare stay out"} onPress={() => void submit()} />}
      onClose={onClose}
      size="content"
      title={stay ? "Change stay out" : "Declare a stay out"}
    >
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <BookingDateField
              disabled={leavingLocked}
              error={form.errors.leaveDate}
              label="Leaving on"
              required
              maximum={checkoutDate ?? "2100-01-01"}
              minimum={today}
              onChange={(next) => { setLeaveDate(next); form.clearField("leaveDate"); }}
              value={leaveDate}
            />
          </View>
          {meals.length ? (
            <View style={{ flex: 1 }}>
              {/* A centred modal of choices, the shared picker's (user, 2026-11-08). */}
              {/* Gone already: the leaving part is history, so it offers only what it was. */}
              <SingleOptionPicker
                centered
                label="Last meal here"
                onChange={(next) => setLastMealHere(next === "NONE" ? null : next)}
                options={leavingLocked ? lastOptions.filter((option) => option.value === (lastMealHere ?? "NONE")) : lastOptions}
                required
                showIcon={false}
                value={lastMealHere ?? "NONE"}
              />
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <BookingDateField
              error={form.errors.returnDate}
              label="Back on"
              required
              maximum={checkoutDate ?? "2100-01-01"}
              minimum={leaveDate ? nextDay(leaveDate) : nextDay(today)}
              onChange={(next) => { setReturnDate(next); form.clearField("returnDate"); }}
              value={returnDate}
            />
          </View>
          {meals.length ? (
            <View style={{ flex: 1 }}>
              <SingleOptionPicker
                centered
                label="First meal back"
                onChange={(next) => setFirstMealBack(next === "NONE" ? null : next)}
                options={firstOptions}
                required
                showIcon={false}
                value={firstMealBack ?? "NONE"}
              />
            </View>
          ) : null}
        </View>

        {/* The tenant's own words, not a fixed list (user, 2026-11-08). */}
        <FormInput label="Reason" maxLength={200} multiline onChangeText={setReason} placeholder="Going home for the weekend" value={reason} />

        {meals.length && leaveDate && returnDate > leaveDate ? (
          // Two cards (user, 2026-11-08): the count, then a table of each day's meals.
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                backgroundColor: colors.surfaceSunken,
                borderCurve: "continuous",
                borderRadius: 10,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 2,
              }}
            >
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                {`${offCount} ${offCount === 1 ? "meal" : "meals"} off your plan`}
              </Text>
            </View>
            <View
              style={{
                borderColor: colors.border,
                borderCurve: "continuous",
                borderRadius: 10,
                borderWidth: 1,
                overflow: "hidden",
              }}
            >
              <View style={{ backgroundColor: colors.surfaceSunken, flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 }}>
                <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansSemiBold, width: 96 }]}>Day</Text>
                <Text style={[type.caption, { color: colors.muted, flex: 1, fontFamily: fonts.sansSemiBold }]}>Meals</Text>
              </View>
              {off.map((day) => (
                <View
                  key={day.day}
                  style={{
                    borderTopColor: colors.border,
                    borderTopWidth: 1,
                    flexDirection: "row",
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 13, width: 96 }}>
                    {stayOutDay(day.day)}
                  </Text>
                  <Text style={{ color: colors.inkSoft, flex: 1, fontFamily: fonts.sans, fontSize: 13 }}>
                    {day.meals.map((meal, index) => (index === 0 ? MEAL_LABEL[meal] : MEAL_LABEL[meal].toLowerCase())).join(", ")}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}

