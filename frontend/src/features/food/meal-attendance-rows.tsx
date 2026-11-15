import type { ComponentType, ReactNode } from "react";
import { Text, View } from "react-native";
import { Ban, Check, ChevronRight, Clock3, Utensils, X, type LucideProps } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FitText } from "@/components/fit-text";
import { LoadFailedCard, loadFailure } from "@/components/load-failed";
import { SheetShell } from "@/components/sheet-shell";
import { GhostIcon, GhostPill, GhostText } from "@/components/skeleton-boundary";
import { SkeletonCard } from "@/components/skeleton";
import { MEAL_LABEL, MealGlyph } from "@/features/food/food-ui";
import { formatMealMoment } from "@/features/food/meal-pass";
import { TenantAvatar } from "@/features/owner/tenancy-list";
import { RoomsSummaryIcon } from "@/features/property/room-summary-icons";
import { useAppSelector } from "@/store/hooks";
import {
  useGetMealAttendanceMealQuery,
  type MealAttendanceDayMeal,
  type MealAttendancePerson,
} from "@/store/services/food-api";
import { cardShadow, useSoftShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The meal being looked at, for the sheet. */
export type OpenMeal = { date: string; meal: MealAttendanceDayMeal };

function dayLine(date: string) {
  const day = new Date(`${date}T12:00:00`);
  return `${day.toLocaleDateString("en-GB", { weekday: "long" })} ${day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/** Whether anyone can be listed for it: nobody is counted at a meal that is upcoming or was not recorded. */
export function mealHasPeople(meal: MealAttendanceDayMeal) {
  return meal.expected > 0 && (meal.state === "OPEN" || meal.recorded);
}

/** A plain bowl, with three lines of steam over it while the meal is being served. */
function StatusBowl({ color, size = 15, steam }: { color: string; size?: number; steam: boolean }) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d={`M3 12h18a9 8 0 0 1-18 0ZM8 22h8${steam ? "M8 3v5M12 3v5M16 3v5" : ""}`}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.4}
      />
    </Svg>
  );
}

/** A meal nobody scanned is not recorded, never everyone skipping. */
function useMealStatus(meal: MealAttendanceDayMeal): { color: string; icon: ReactNode; label: string } {
  const { colors } = useTheme();
  const count = `${meal.attended}/${meal.expected}`;
  if (meal.state === "UPCOMING") {
    return { color: colors.primary, icon: <Clock3 color={colors.primary} size={14} strokeWidth={2.6} />, label: "Upcoming" };
  }
  if (meal.state === "OPEN") {
    return { color: colors.jade, icon: <StatusBowl color={colors.jade} steam />, label: `Serving ${count}` };
  }
  if (meal.recorded) {
    // Only today's meals carry a time: in the history a day's meals are all served, so it says how many came.
    return { color: colors.ink, icon: <StatusBowl color={colors.ink} steam={false} />, label: meal.time ? `Served ${count}` : `${count} attended` };
  }
  return { color: colors.muted, icon: <Ban color={colors.muted} size={14} strokeWidth={2.6} />, label: "Not recorded" };
}

/** One meal in a card of them: its name, and how it went on the right in the same row (user, 2026-11-02). */
export function MealRow({ first, meal, onOpen }: { first: boolean; meal: MealAttendanceDayMeal; onOpen: () => void }) {
  const { colors, fonts } = useTheme();
  const canOpen = mealHasPeople(meal);
  const status = useMealStatus(meal);
  // Greyed out, as there is nothing behind it (user, 2026-11-02). Upcoming stays as it is: it is still to come.
  const notRecorded = meal.state === "DONE" && !meal.recorded;
  return (
    <AnimatedPressable
      accessibilityLabel={`${MEAL_LABEL[meal.mealType]}, ${status.label}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canOpen }}
      disabled={!canOpen}
      onPress={onOpen}
      style={{
        alignItems: "center",
        borderTopColor: colors.border,
        borderTopWidth: first ? 0 : 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingVertical: 9,
      }}
    >
      <View style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, minWidth: 0, opacity: notRecorded ? 0.45 : 1 }}>
      <GhostPill height={17} width={17}><MealGlyph color={colors.ink} meal={meal.mealType} /></GhostPill>
      <View style={{ flex: 1, minWidth: 0 }}>
        <GhostText ghostWidth="45%" numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>
          {MEAL_LABEL[meal.mealType]}
        </GhostText>
        {meal.time ? (
          <GhostText ghostWidth="70%" numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5 }}>
            {meal.time}
          </GhostText>
        ) : null}
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
        <GhostPill height={14} width={14}>{status.icon}</GhostPill>
        <GhostText ghostWidth={70} style={{ color: status.color, fontFamily: fonts.sansBold, fontSize: 12.5 }}>{status.label}</GhostText>
      </View>
      </View>
      {/* The chevron says a row opens. A row that does not keeps its status at the card's edge. */}
      {canOpen ? <GhostIcon color={colors.kicker} icon={ChevronRight} size={16} strokeWidth={2.4} /> : null}
    </AnimatedPressable>
  );
}

/** Who ate at a meal, in a sheet from the bottom instead of opening in place (user, 2026-11-02). */
export function AttendanceDataSheet({ onClose, open }: { onClose: () => void; open: OpenMeal }) {
  const { colors, fonts } = useTheme();
  return (
    <SheetShell
      onClose={onClose}
      contentMaxSize="tall"
      size="content"
      title={
        <>
          {`${MEAL_LABEL[open.meal.mealType]}, `}
          <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 15 }}>{dayLine(open.date)}</Text>
        </>
      }
    >
      <View style={{ gap: spacing.md }}>
        <MealPeople date={open.date} meal={open.meal} />
      </View>
    </SheetShell>
  );
}

/** A card of who ate and a card of who has not. An empty side is not shown: everyone ate, or nobody has yet. */
function MealPeople({ date, meal }: { date: string; meal: MealAttendanceDayMeal }) {
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const query = useGetMealAttendanceMealQuery(
    { date, mealType: meal.mealType, propertyId },
    { pollingInterval: meal.state === "OPEN" ? 30_000 : 0, skip: !propertyId },
  );
  const failure = loadFailure(query);
  if (failure) {
    return <LoadFailedCard error={failure.error} onReload={failure.reload} />;
  }
  if (!query.data) {
    return <SkeletonCard />;
  }
  return (
    <>
      {query.data.attended.length > 0 ? <PeopleCard people={query.data.attended} title="Attended" tone="success" /> : null}
      {query.data.notAttended.length > 0 ? (
        <PeopleCard
          people={query.data.notAttended}
          // Yet to attend only while it is being served: on a past meal they skipped it.
          title={query.data.state === "OPEN" ? "Yet to attend" : "Skipped"}
          tone={query.data.state === "OPEN" ? "warning" : "danger"}
        />
      ) : null}
    </>
  );
}

type PeopleTone = "success" | "warning" | "danger";

/** A coloured head that names the group and counts it, so the two cards read apart at a glance. */
function PeopleCard({ people, title, tone }: { people: MealAttendancePerson[]; title: string; tone: PeopleTone }) {
  const softShadow = useSoftShadow();
  const { colors, fonts } = useTheme();
  const look = {
    danger: { icon: X, ink: colors.danger, tint: colors.dangerSoft },
    success: { icon: Check, ink: colors.jade, tint: colors.successSoft },
    warning: { icon: Clock3, ink: colors.warning, tint: colors.warningSoft },
  }[tone];
  const Icon = look.icon;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        overflow: "hidden",
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "center", backgroundColor: look.tint, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <View style={{ alignItems: "center", backgroundColor: look.ink, borderRadius: 999, height: 26, justifyContent: "center", width: 26 }}>
          <Icon color={colors.surface} size={15} strokeWidth={3} />
        </View>
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 16 }}>{title}</Text>
        <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: 999, minWidth: 30, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
          <Text style={{ color: look.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>{people.length}</Text>
        </View>
      </View>
      <View style={{ gap: spacing.sm, padding: spacing.sm }}>
        {people.map((person) => <PersonCard key={person.tenancyId} person={person} />)}
      </View>
    </View>
  );
}

function PersonCard({ person }: { person: MealAttendancePerson }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.sm,
      }}
    >
      <TenantAvatar name={person.tenantName} photoUrl={person.tenantPhotoUrl} />
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <FitText numberOfLines={1} style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 15 }}>
            {person.tenantName ?? "Tenant"}
          </FitText>
          {person.attendedAt ? (
            <Text style={{ color: colors.jade, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
              {formatMealMoment(person.attendedAt)}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {person.roomNumber ? <PersonFact icon={RoomsSummaryIcon} label={`Room ${person.roomNumber}`} /> : null}
          {person.profileName ? <PersonFact icon={Utensils} label={person.profileName} /> : null}
        </View>
      </View>
    </View>
  );
}

function PersonFact({ icon: Icon, label }: { icon: ComponentType<LucideProps>; label: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderRadius: 999, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
      <Icon color={colors.inkSoft} size={13} strokeWidth={2.4} />
      <Text numberOfLines={1} style={{ color: colors.inkSoft, flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
