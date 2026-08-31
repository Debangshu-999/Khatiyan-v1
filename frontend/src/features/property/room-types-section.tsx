import { useState } from "react";
import { View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import {
  RoomTypeBoard,
  removalMessage,
  removalTitle,
  type RoomTypeEntry,
} from "@/features/property/room-type-board";
import { RoomTypeSheet } from "@/features/property/room-type-sheet";
import {
  useCreateRoomMoldMutation,
  useListRoomMoldsQuery,
  useRetireRoomMoldMutation,
  useUpdateRoomMoldMutation,
  type RoomConditioning,
  type RoomType,
  type SaveRoomMoldPayload,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";

/** What the sheet is open on. A null entry means creating. */
type Editing = { conditioning: RoomConditioning; entry: RoomTypeEntry | null; sharingType: RoomType };

/**
 * The room types of an existing property, saved as they are edited.
 *
 * <p>The board plus everything needed to persist it. Shared by the standalone
 * room types screen and the Room types section of edit-property, which are the
 * same job reached two ways — the registration wizard is the odd one out, since
 * there is no property to save against yet and it holds drafts instead.
 *
 * <p>Follows `PropertyImagesSection`: a section that owns its own queries and
 * writes each change immediately, rather than joining the surrounding form's
 * save button. A mold is not a field of the property, and making it wait for
 * Save would mean an owner could edit a type, discard the form, and be unable
 * to tell which of the two had happened.
 */
export function RoomTypesSection({
  occupancies,
  onChanged,
  propertyId,
}: {
  /**
   * Which occupancies get a tab.
   *
   * <p>Passed in rather than read from the property so the section can follow
   * an occupancy the owner has just ticked in the form above it and not yet
   * saved — a tab that only appears after Save would look broken.
   */
  occupancies: RoomType[];
  /** Fired after any change lands, so a surrounding form can note it happened. */
  onChanged?: () => void;
  propertyId: string;
}) {
  const toast = useToast();

  const molds = useListRoomMoldsQuery({ propertyId }, { skip: !propertyId });
  const [createMold, create] = useCreateRoomMoldMutation();
  const [updateMold, update] = useUpdateRoomMoldMutation();
  const [retireMold] = useRetireRoomMoldMutation();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<RoomTypeEntry | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // A RoomMold already carries every field the board reads, so it passes
  // straight through — retired ones excluded, since they are no longer offered.
  const entries = (molds.data ?? []).filter((mold) => mold.active);

  function slot(sharingType: RoomType, conditioning: RoomConditioning) {
    return entries.filter((entry) => entry.sharingType === sharingType && entry.conditioning === conditioning);
  }

  async function save(payload: SaveRoomMoldPayload) {
    if (!editing) {
      return;
    }
    try {
      if (editing.entry) {
        await updateMold({ moldId: editing.entry.id, payload, propertyId }).unwrap();
        toast.ok("Room type updated.");
      } else {
        await createMold({ payload, propertyId }).unwrap();
        toast.ok("Room type created.");
      }
      setEditing(null);
      onChanged?.();
    } catch (caught) {
      setServerError(errorMessage(caught) || "Could not save this room type. Please try again.");
    }
  }

  async function remove(entry: RoomTypeEntry) {
    try {
      await retireMold({ moldId: entry.id, propertyId }).unwrap();
      setRemoving(null);
      toast.ok("Room type removed.");
      onChanged?.();
    } catch (caught) {
      setRemoving(null);
      setServerError(errorMessage(caught) || "Could not remove this room type. Please try again.");
    }
  }

  if (molds.isLoading) {
    return (
      <View style={{ gap: spacing.md }}>
        <SkeletonCard />
      </View>
    );
  }

  return (
    <>
      <RoomTypeBoard
        entries={entries}
        occupancies={occupancies}
        onCreate={(sharingType, conditioning) => setEditing({ conditioning, entry: null, sharingType })}
        onEdit={(entry) => setEditing({ conditioning: entry.conditioning, entry, sharingType: entry.sharingType })}
        onRemove={setRemoving}
      />

      {editing ? (
        <RoomTypeSheet
          conditioning={editing.conditioning}
          entry={editing.entry}
          onClose={() => setEditing(null)}
          onSave={(payload) => void save(payload)}
          saving={create.isLoading || update.isLoading}
          sharingType={editing.sharingType}
          // The same size in the other variant, so the two can be priced
          // against each other. For a dorm, matching on beds matters: a 10-bed
          // non-AC says nothing useful about a 6-bed AC.
          siblingRentPaise={
            slot(editing.sharingType, editing.conditioning === "AC" ? "NON_AC" : "AC").find(
              (entry) => editing.entry == null || entry.bedCount === editing.entry.bedCount,
            )?.baseRentPaise ?? null
          }
          takenBedCounts={slot(editing.sharingType, editing.conditioning)
            .filter((entry) => entry.id !== editing.entry?.id)
            .map((entry) => entry.bedCount)}
        />
      ) : null}

      {removing ? (
        <ConfirmDeleteDialog
          confirmLabel="Remove"
          message={removalMessage(removing)}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
          title={removalTitle(removing)}
        />
      ) : null}

      {serverError ? <AlertModal message={serverError} onClose={() => setServerError(null)} /> : null}
    </>
  );
}
