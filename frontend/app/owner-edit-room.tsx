import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AlertModal } from "@/components/alert-modal";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, rupeesToPaise } from "@/features/owner/owner-ui";
import {
  RoomDraftRow,
  draftNumber,
  emptyDraft,
  type RoomDraft,
  type RoomDraftError,
} from "@/features/property/room-draft-row";
import {
  useListAllPropertyRoomsQuery,
  useListRoomMoldsQuery,
  useRecutRoomMutation,
  useUpdateRoomAmenitiesMutation,
  useUpdateRoomMutation,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Editing one room, on the form that created it.
 *
 * <p>A screen rather than a modal, and the same fields as Add room — the
 * questions do not change once a room exists, and answering them in a sheet
 * over the list meant a different-looking form for the same job.
 *
 * <p>Changing the type here is a <b>recut</b>, not a field edit: it re-takes the
 * bed count from the new type and refuses to shrink a room below the beds
 * already occupied or reserved. That is why the type sits on this form at all —
 * it is the upgrade path, and the alternative was deleting the room and losing
 * its number and its history.
 */
export default function OwnerEditRoomScreen() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { propertyId, roomId } = useLocalSearchParams<{ propertyId?: string; roomId?: string }>();

  const rooms = useListAllPropertyRoomsQuery(propertyId ?? "", { skip: !propertyId });
  const molds = useListRoomMoldsQuery({ propertyId: propertyId ?? "" }, { skip: !propertyId });

  const [recutRoom] = useRecutRoomMutation();
  const [updateRoom] = useUpdateRoomMutation();
  const [updateAmenities] = useUpdateRoomAmenitiesMutation();

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<RoomDraftError>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoomDraft | null>(null);

  const room = (rooms.data ?? []).find((entry) => entry.id === roomId) ?? null;
  const live = useMemo(() => (molds.data ?? []).filter((option) => option.active), [molds.data]);

  /**
   * The form, seeded once from the room.
   *
   * <p>Derived rather than set in an effect: an effect would re-seed on every
   * refetch of the rooms list and quietly discard whatever was half-typed.
   *
   * <p>The number goes in whole, with no prefix. Splitting "A-101" into a prefix
   * and a number is guesswork — the room already has the name it has, and the
   * two fields exist for writing new ones, not for taking old ones apart.
   */
  const seeded: RoomDraft | null = room
    ? (draft ??
      emptyDraft({
        amenities: room.amenities,
        customAmenities: room.customAmenities,
        floor: room.floor ?? "",
        id: room.id,
        moldId: room.moldId,
        rent: String(Math.round(room.baseRentPaise / 100)),
        roomNumber: room.roomNumber,
      }))
    : null;

  const dirty = Boolean(
    room &&
      seeded &&
      (draftNumber(seeded) !== room.roomNumber ||
        seeded.floor !== (room.floor ?? "") ||
        seeded.moldId !== room.moldId ||
        rupeesToPaise(seeded.rent) !== room.baseRentPaise ||
        seeded.amenities.join() !== room.amenities.join() ||
        seeded.customAmenities.join() !== room.customAmenities.join()),
  );
  const unsaved = useUnsavedChanges(dirty);

  async function submit() {
    if (!propertyId || !room || !seeded) {
      return;
    }

    const rentPaise = rupeesToPaise(seeded.rent);
    const problems: RoomDraftError = {};
    if (!seeded.moldId) {
      problems.mold = "Choose a room type.";
    }
    if (!seeded.roomNumber.trim()) {
      problems.number = "Enter the room number.";
    }
    if (!seeded.floor.trim()) {
      problems.floor = "Enter the floor.";
    }
    if (rentPaise == null) {
      problems.rent = "Enter the rent.";
    }
    setErrors(problems);
    if (Object.keys(problems).length > 0 || rentPaise == null) {
      return;
    }

    const mold = live.find((option) => option.id === seeded.moldId);
    if (!mold) {
      return;
    }

    setSaving(true);
    try {
      // Order matters and is not incidental: a recut re-takes rent and
      // amenities from the new type, so it has to run FIRST or it would
      // overwrite the two edits that follow it.
      if (seeded.moldId !== room.moldId) {
        await recutRoom({ moldId: mold.id, propertyId, roomId: room.id }).unwrap();
      }

      await updateRoom({
        payload: {
          baseRentPaise: rentPaise,
          capacity: mold.bedCount,
          conditioning: mold.conditioning,
          floor: seeded.floor.trim(),
          roomNumber: draftNumber(seeded),
          roomType: mold.sharingType,
        },
        propertyId,
        roomId: room.id,
      }).unwrap();

      await updateAmenities({
        amenities: seeded.amenities,
        customAmenities: seeded.customAmenities,
        propertyId,
        roomId: room.id,
      }).unwrap();

      unsaved.markSaved();
      toast.ok(`Room ${draftNumber(seeded)} updated.`);
      router.back();
    } catch (caught) {
      // Three calls, so a failure can leave the earlier ones applied. The screen
      // stays open on the live data rather than pretending nothing happened.
      setServerError(errorMessage(caught) || "Could not save this room. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScreenScrollView
        safeAreaEdges={["top"]}
        contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE - spacing.lg, paddingTop: 0 }}
        surface={colors.formSurface}
      >
        <ScreenHeader
          eyebrow="Rooms"
          italicTail={room ? `room ${room.roomNumber}.` : "room."}
          onBack={() => unsaved.guard(() => router.back())}
          subtitle="Changing the type re-cuts the room from it, keeping its number and its history."
          title="Edit"
        />

        <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
          {rooms.isLoading || molds.isLoading ? (
            <SkeletonCard />
          ) : !room || !seeded ? (
            <Text style={[type.body, { color: colors.muted }]}>
              That room is no longer in this property.
            </Text>
          ) : (
            <RoomDraftRow
              draft={seeded}
              errors={errors}
              expanded
              index={0}
              molds={live}
              onChange={(patch) => {
                setDraft({ ...seeded, ...patch });
                setErrors({});
              }}
              onRemove={() => {}}
              onToggle={() => {}}
              removable={false}
              standalone
            />
          )}
        </View>
      </ScreenScrollView>

      {room ? (
        <PinnedFooter>
          <ActionButton
            disabled={saving || !dirty}
            label={saving ? "Saving…" : dirty ? "Save changes" : "No changes"}
            onPress={() => void submit()}
          />
        </PinnedFooter>
      ) : null}

      {unsaved.dialog}

      {serverError ? <AlertModal message={serverError} onClose={() => setServerError(null)} /> : null}
    </>
  );
}
