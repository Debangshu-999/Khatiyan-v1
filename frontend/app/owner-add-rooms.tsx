import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, Info, ListPlus, Plus, Rows3 } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { FieldError } from "@/components/field-error";
import { FieldHint } from "@/components/field-hint";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, formatMoneyPaise, rupeesToPaise } from "@/features/owner/owner-ui";
import { AmenityPicker } from "@/features/property/amenity-picker";
import { MoldPicker } from "@/features/property/mold-picker";
import {
  RoomDraftRow,
  draftNumber,
  emptyDraft,
  type RoomDraft,
  type RoomDraftError,
} from "@/features/property/room-draft-row";
import {
  useCreateRoomsFromMoldMutation,
  useListRoomMoldsQuery,
  type RoomAmenity,
  type RoomSpec,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Mirrors the server's per-request ceiling on `CreateRoomsFromMoldRequest`. */
const MAX_ROOMS_PER_REQUEST = 60;

/**
 * Which kind of batch is being written.
 *
 * <p>Null until chosen. Not a tab switcher: these are not two views of one form
 * but two different pieces of work — a series is one type repeated down a
 * corridor, a list is a floor where every room differs — and sliding between
 * them would throw away everything typed into the other.
 */
type BulkPath = "series" | "list" | null;

type Field = "floor" | "mold" | "series";

/**
 * Creating rooms, cut from room types.
 *
 * <p>Three ways in, all landing on one request. Add room fills a single form.
 * Bulk add asks which kind of batch first, then either a series — one type, one
 * floor, a run of numbers — or a hand-written list where every room carries its
 * own type, floor, rent and amenities.
 *
 * <p>Whatever the mix, it goes in one call: the server checks the whole batch
 * for repeats and clashes before writing anything, so a floor never lands
 * half-created.
 */
export default function OwnerAddRoomsScreen() {
  const { colors, fonts, type } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const form = useFormErrors<Field>();
  const { mode, propertyId } = useLocalSearchParams<{ mode?: string; propertyId?: string }>();

  const bulk = mode === "bulk";

  const molds = useListRoomMoldsQuery({ propertyId: propertyId ?? "" }, { skip: !propertyId });
  const [createRooms, { isLoading }] = useCreateRoomsFromMoldMutation();

  const [path, setPath] = useState<BulkPath>(null);

  // The series: one type and floor, a run of numbers, one set of amenities.
  const [moldId, setMoldId] = useState<string | null>(null);
  const [floor, setFloor] = useState("");
  const [prefix, setPrefix] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [amenities, setAmenities] = useState<RoomAmenity[]>([]);
  const [customAmenities, setCustomAmenities] = useState<string[]>([]);

  // The single room, and the hand-written list: same shape, different length.
  const [drafts, setDrafts] = useState<RoomDraft[]>(() => [emptyDraft()]);
  const [openRow, setOpenRow] = useState(0);
  const [rowErrors, setRowErrors] = useState<Record<string, RoomDraftError>>({});

  const [serverError, setServerError] = useState<string | null>(null);

  /**
   * Anything typed counts, on whichever path is open.
   *
   * <p>Not "is the form valid" — a half-filled row is exactly what somebody
   * would be sorry to lose, and it is the state a stray back gesture is most
   * likely to catch.
   */
  const dirty =
    path !== null ||
    Boolean(moldId || floor.trim() || prefix.trim() || start.trim() || end.trim()) ||
    drafts.some(
      (draft) => draft.moldId || draft.roomNumber.trim() || draft.floor.trim() || draft.rent.trim(),
    );
  const unsaved = useUnsavedChanges(dirty);

  const live = useMemo(() => (molds.data ?? []).filter((option) => option.active), [molds.data]);
  const mold = live.find((option) => option.id === moldId) ?? null;
  const moldKey = mold?.id ?? null;

  /**
   * The series' amenities follow its type until they are touched.
   *
   * <p>Keyed on the mold id rather than the amenities, so it seeds on a change
   * of type and never overwrites edits made afterwards.
   */
  useEffect(() => {
    const chosen = live.find((option) => option.id === moldKey);
    if (chosen) {
      setAmenities(chosen.amenities);
      setCustomAmenities(chosen.customAmenities);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moldKey]);

  /** The numbers a series describes, expanded as they are typed. */
  const seriesNumbers = useMemo<string[]>(() => {
    // Number("") is 0, not NaN, so blank fields passed every integer check and
    // produced a single room called "0".
    if (!start.trim() || !end.trim()) {
      return [];
    }
    const from = Number(start);
    const to = Number(end);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
      return [];
    }
    const out: string[] = [];
    for (let at = from; at <= to && out.length <= MAX_ROOMS_PER_REQUEST; at += 1) {
      out.push(`${prefix.trim()}${at}`);
    }
    return out;
  }, [end, prefix, start]);

  const usingList = !bulk || path === "list";
  const count = usingList ? drafts.filter((draft) => draftNumber(draft)).length : seriesNumbers.length;
  const choosing = bulk && path === null;

  function patchDraft(id: string, patch: Partial<RoomDraft>) {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
    setRowErrors((current) => {
      if (!current[id]) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  /** Every room the form describes, in the shape the server takes. */
  function buildSpecs(): RoomSpec[] | null {
    if (usingList) {
      const found: Record<string, RoomDraftError> = {};
      drafts.forEach((draft) => {
        const problems: RoomDraftError = {};
        if (!draft.moldId) {
          problems.mold = "Choose a room type.";
        }
        if (!draft.roomNumber.trim()) {
          problems.number = "Enter the room number.";
        }
        if (!draft.floor.trim()) {
          problems.floor = "Enter the floor.";
        }
        if (rupeesToPaise(draft.rent) == null) {
          problems.rent = "Enter the rent.";
        }
        if (Object.keys(problems).length > 0) {
          found[draft.id] = problems;
        }
      });
      setRowErrors(found);
      if (Object.keys(found).length > 0) {
        // Open the first offender: its fields are collapsed, so the errors would
        // otherwise be marked on a row nobody can see.
        setOpenRow(drafts.findIndex((draft) => found[draft.id]));
        return null;
      }
      return drafts.map((draft) => ({
        amenities: draft.amenities,
        baseRentPaise: rupeesToPaise(draft.rent),
        customAmenities: draft.customAmenities,
        floor: draft.floor.trim() || null,
        moldId: draft.moldId as string,
        roomNumber: draftNumber(draft),
      }));
    }

    const problems: Partial<Record<Field, string>> = {};
    if (!mold) {
      problems.mold = "Choose the room type these rooms are.";
    }
    if (!floor.trim()) {
      problems.floor = "Enter the floor these rooms are on.";
    }
    if (seriesNumbers.length === 0) {
      problems.series = "Enter a valid first and last number.";
    } else if (seriesNumbers.length > MAX_ROOMS_PER_REQUEST) {
      problems.series = `Create at most ${MAX_ROOMS_PER_REQUEST} rooms at a time.`;
    }
    if (!form.validate(problems) || !mold) {
      return null;
    }
    return seriesNumbers.map((roomNumber) => ({
      amenities,
      baseRentPaise: null,
      customAmenities,
      floor: floor.trim() || null,
      moldId: mold.id,
      roomNumber,
    }));
  }

  async function submit() {
    if (!propertyId) {
      return;
    }
    const rooms = buildSpecs();
    if (!rooms) {
      return;
    }

    try {
      const created = await createRooms({ payload: { rooms }, propertyId }).unwrap();
      // Before the exit: otherwise leaving challenges the owner over changes
      // that were just written.
      unsaved.markSaved();
      toast.ok(`${created.length} ${created.length === 1 ? "room" : "rooms"} created.`);
      router.back();
    } catch (caught) {
      // All or nothing on a clash: the server names the conflicts and writes
      // nothing, so what is on screen is still exactly what to fix.
      setServerError(errorMessage(caught) || "Could not create these rooms. Please try again.");
    }
  }

  return (
    <>
      <ScreenScrollView
        safeAreaEdges={["top"]}
        // A gutter less than the full clearance: that constant assumes a screen
        // ending in a card, and this one ends in a row of chips.
        contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE - spacing.lg, paddingTop: 0 }}
        surface={colors.formSurface}
      >
        <ScreenHeader
          eyebrow="Rooms"
          italicTail={bulk ? "rooms." : "room."}
          // Back steps out of a chosen path first, so picking the wrong one is
          // one tap to undo rather than a trip out of the screen and in again.
          // Leaving the screen entirely goes through the guard.
          onBack={() => (path ? setPath(null) : unsaved.guard(() => router.back()))}
          subtitle={
            choosing
              ? "Two ways to add several at once. They are different enough to be worth choosing between."
              : path === "series"
                ? "One type, one floor, a run of numbers."
                : path === "list"
                  ? "Every room its own type, floor, rent and amenities."
                  : "The room is cut from a type, which sets its beds and fittings."
          }
          title={bulk ? "Add multiple" : "Add a"}
        />

        <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
          {molds.isLoading ? (
            <SkeletonCard />
          ) : live.length === 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.body, { color: colors.muted }]}>
                This property has no room types yet. A room is cut from a type, so there is nothing to create one
                from.
              </Text>
              <ActionButton
                label="Set up room types"
                onPress={() =>
                  router.replace({ params: { propertyId: propertyId ?? "" }, pathname: "/owner-room-types" })
                }
                variant="secondary"
              />
            </View>
          ) : choosing ? (
            <>
              <PathCard
                description="Rooms numbered in a run — 101 to 110 — all of one type, on one floor, with the same amenities. The fastest way to fill a uniform corridor."
                icon={Rows3}
                onPress={() => setPath("series")}
                title="A series of rooms"
              />
              <PathCard
                description="Rooms written down one at a time, each with its own type, floor, rent and amenities. For a landing where no two rooms are the same."
                icon={ListPlus}
                onPress={() => setPath("list")}
                title="A custom list of rooms"
              />
            </>
          ) : path === "series" ? (
            <>
              {/* What the rooms ARE — the type, and the floor they sit on. The
                  info line closes the section by saying what that type hands to
                  every room in the series, which is why the choice matters.

                  No card: the amenities block below draws its own border, and a
                  card around each section put a box inside a box. The gap
                  between the two groups is what separates them. */}
              <View style={{ gap: spacing.md }}>
                <MoldPicker
                  error={form.errors.mold}
                  molds={live}
                  onChange={(next) => {
                    setMoldId(next);
                    form.clearField("mold");
                  }}
                  value={moldId}
                />

                <FormInput
                  disabled={!mold}
                  error={form.errors.floor}
                  label="Floor"
                  onChangeText={(next) => {
                    setFloor(next);
                    form.clearField("floor");
                  }}
                  placeholder="Ground, 1, 2…"
                  required
                  value={floor}
                />

                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 6 }}>
                  <Info color={colors.kicker} size={14} strokeWidth={2.2} />
                  <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
                    {mold
                      ? `Every room in this series gets ${mold.bedCount} ${
                          mold.bedCount === 1 ? "bed" : "beds"
                        }, ${formatMoneyPaise(mold.baseRentPaise)} per bed and the amenities below${
                          floor.trim() ? `, on floor ${floor.trim()}` : ""
                        }.`
                      : "Choose a room type and it sets the beds, the rent and the amenities for every room in the series."}
                  </Text>
                </View>
              </View>

              {/* How they are NUMBERED, and what they come with. */}
              <View style={{ gap: spacing.md }}>
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        autoCapitalize="characters"
                        disabled={!mold}
                        label="Prefix"
                        onChangeText={setPrefix}
                        placeholder=""
                        value={prefix}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        disabled={!mold}
                        keyboardType="number-pad"
                        label="First"
                        onChangeText={(next) => {
                          setStart(next);
                          form.clearField("series");
                        }}
                        placeholder="101"
                        required
                        value={start}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        disabled={!mold}
                        keyboardType="number-pad"
                        label="Last"
                        onChangeText={(next) => {
                          setEnd(next);
                          form.clearField("series");
                        }}
                        placeholder="110"
                        required
                        value={end}
                      />
                    </View>
                  </View>
                  <FieldError message={form.errors.series} />

                  {/* What is about to be made, before the button is pressed. */}
                  {seriesNumbers.length > 0 ? (
                    <FieldHint
                      text={
                        seriesNumbers.length <= 8
                          ? `Creates ${seriesNumbers.join(", ")}`
                          : `Creates ${seriesNumbers.length} rooms: ${seriesNumbers.slice(0, 6).join(", ")} … ${seriesNumbers[seriesNumbers.length - 1]}`
                      }
                    />
                  ) : null}
                </View>

                {mold ? (
                  <AmenityPicker
                    amenities={amenities}
                    conditioning={mold.conditioning}
                    customAmenities={customAmenities}
                    onChangeAmenities={setAmenities}
                    onChangeCustom={setCustomAmenities}
                  />
                ) : (
                  <Text style={[type.caption, { color: colors.muted }]}>
                    Choose a room type and its amenities appear here, ready to adjust.
                  </Text>
                )}
              </View>
            </>
          ) : (
            <>
              {drafts.map((draft, index) => (
                <RoomDraftRow
                  draft={draft}
                  errors={rowErrors[draft.id]}
                  expanded={!bulk || openRow === index}
                  index={index}
                  key={draft.id}
                  molds={live}
                  onChange={(patch) => patchDraft(draft.id, patch)}
                  onRemove={() => {
                    setDrafts((current) => current.filter((entry) => entry.id !== draft.id));
                    setOpenRow((current) => (current >= index ? Math.max(0, current - 1) : current));
                  }}
                  onToggle={() => setOpenRow((current) => (current === index ? -1 : index))}
                  removable={bulk && drafts.length > 1}
                  standalone={!bulk}
                />
              ))}

              {bulk ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => {
                    // Length before the append, so the new row is the one that
                    // opens.
                    setOpenRow(drafts.length);
                    setDrafts((current) => [...current, emptyDraft()]);
                  }}
                  // Solid, not dashed. A dashed outline reads as a drop target
                  // or a placeholder for something absent; this is a button that
                  // does something every time it is pressed.
                  style={{
                    alignItems: "center",
                    borderColor: colors.borderStrong,
                    borderCurve: "continuous",
                    borderRadius: 16,
                    borderWidth: 1.5,
                    flexDirection: "row",
                    gap: spacing.sm,
                    justifyContent: "center",
                    paddingVertical: spacing.lg,
                  }}
                >
                  <Plus color={colors.ink} size={18} strokeWidth={2.6} />
                  <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                    Add another room
                  </Text>
                </AnimatedPressable>
              ) : null}
            </>
          )}
        </View>
      </ScreenScrollView>

      {live.length > 0 && !choosing ? (
        <PinnedFooter>
          <ActionButton
            disabled={isLoading}
            label={isLoading ? "Creating…" : count > 1 ? `Create ${count} rooms` : "Create room"}
            onPress={() => void submit()}
          />
        </PinnedFooter>
      ) : null}

      {unsaved.dialog}

      {serverError ? <AlertModal message={serverError} onClose={() => setServerError(null)} /> : null}
    </>
  );
}

/**
 * One of the two ways to add several rooms.
 *
 * <p>Cards rather than tabs because the choice is not a filter over one form —
 * it decides what the rest of the screen asks. The explanation is the point:
 * "series" and "list" mean nothing until somebody tells you which one your
 * floor is.
 */
function PathCard({
  description,
  icon: Icon,
  onPress,
  title,
}: {
  description: string;
  icon: typeof Rows3;
  onPress: () => void;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable accessibilityRole="button" onPress={onPress}>
      <Card style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View
            style={{
              alignItems: "center",
              borderColor: colors.ink,
              borderRadius: 999,
              borderWidth: 1.5,
              height: 34,
              justifyContent: "center",
              width: 34,
            }}
          >
            <Icon color={colors.ink} size={17} strokeWidth={2.2} />
          </View>
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 18 }}>{title}</Text>
          <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} />
        </View>
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>{description}</Text>
      </Card>
    </AnimatedPressable>
  );
}
