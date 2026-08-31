import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ScrollView, Text, View } from "react-native";
import { BedDouble, Check, Plus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { AlertModal } from "@/components/alert-modal";
import { FieldError } from "@/components/field-error";
import { SheetShell } from "@/components/sheet-shell";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, formatMoneyPaise, humanizeToken, paiseToRupees, rupeesToPaise } from "@/features/owner/owner-ui";
import { AmenityPicker } from "@/features/property/amenity-picker";
import { AddPhotoTarget, PhotoRow, UploadProgress } from "@/features/property/photo-list";
import type { RoomTypeEntry } from "@/features/property/room-type-board";
import { uploadAssets } from "@/features/uploads/upload-asset";
import {
  ROOM_AMENITIES,
  type RoomAmenity,
  type RoomConditioning,
  type RoomType,
  type RoomTypeImage,
  type SaveRoomMoldPayload,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Beds fixed by the sharing type. Null means the owner has to say. */
const FIXED_BEDS: Record<RoomType, number | null> = {
  SINGLE: 1,
  DOUBLE: 2,
  TRIPLE: 3,
  FOUR_SHARING: 4,
  DORMITORY: null,
};

/** A dormitory starts where four-sharing stops. Mirrors `SharingBeds` on the server. */
const MIN_DORMITORY_BEDS = 5;

/** Matches RoomMold.MAX_IMAGES, so the sheet refuses before the server does. */
const MAX_TYPE_IMAGES = 10;

type Field = "beds" | "custom" | "rent";

/**
 * The form behind one room type.
 *
 * <p>Sharing size and AC variant are chosen before this opens and are not
 * editable in it: they are what the type IS, and changing either would silently
 * turn every room already cut from it into a room of a different kind. The
 * server refuses it outright — this simply never offers it.
 */
export function RoomTypeSheet({
  conditioning,
  entry,
  onClose,
  onSave,
  saving,
  sharingType,
  siblingRentPaise,
  takenBedCounts,
}: {
  conditioning: RoomConditioning;
  /**
   * Null when creating. Present when editing — a saved mold on the standalone
   * screen, an unsaved draft in the registration wizard. The form is the same
   * either way; only who stores the answer differs.
   */
  entry: RoomTypeEntry | null;
  onClose: () => void;
  onSave: (payload: SaveRoomMoldPayload) => void;
  saving?: boolean;
  sharingType: RoomType;
  /** The other variant's rent, if it has been set — shown so the two can be priced against each other. */
  siblingRentPaise: number | null;
  /**
   * Bed counts this variant already offers, excluding the one being edited.
   *
   * <p>The server keys a mold on its bed count as well, so a second 6-bed AC
   * dorm is a constraint violation. Caught here so it reads as a field error on
   * the field at fault rather than a refusal modal after the fact.
   */
  takenBedCounts: number[];
}) {
  const { colors, fonts, type } = useTheme();
  const form = useFormErrors<Field>();

  const fixedBeds = FIXED_BEDS[sharingType];
  const [beds, setBeds] = useState(() => (entry ? String(entry.bedCount) : ""));
  const [rent, setRent] = useState(() => (entry ? paiseToRupees(entry.baseRentPaise) : ""));
  const [amenities, setAmenities] = useState<RoomAmenity[]>(() => entry?.amenities ?? [...ROOM_AMENITIES]);
  const [customAmenities, setCustomAmenities] = useState<string[]>(() => entry?.customAmenities ?? []);
  const [images, setImages] = useState<RoomTypeImage[]>(() => entry?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /**
   * Uploads as each photo is picked, before the type is saved.
   *
   * <p>The bytes go straight to Cloudinary against a signed request, so this
   * works with no room type on the server yet — which is the whole reason it can
   * run inside the registration wizard, where nothing has been created.
   */
  async function pickImages() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadError("Allow photo library access to add room type photos.");
      return;
    }

    const remaining = MAX_TYPE_IMAGES - images.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.8,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadAssets(
        result.assets.map((asset, index) => ({
          mimeType: asset.mimeType,
          name: asset.fileName ?? `Room type photo ${images.length + index + 1}`,
          size: asset.fileSize,
          uri: asset.uri,
        })),
        "ROOM_TYPE_IMAGE",
        (completed, total) => setUploadProgress({ completed, total }),
      );
      setImages((current) => [...current, ...uploaded]);
    } catch {
      setUploadError("Could not upload those photos. Please check your connection and try again.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  const variantLabel = conditioning === "AC" ? "AC" : "Non-AC";
  const title = `${variantLabel} ${humanizeToken(sharingType).toLowerCase()}`;

  function toggle(amenity: RoomAmenity) {
    setAmenities((current) =>
      current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity],
    );
  }

  function submit() {
    const rentPaise = rupeesToPaise(rent);
    const bedCount = Number(beds);

    const found: Partial<Record<Field, string>> = {};
    if (rentPaise == null) {
      found.rent = "Enter the monthly rent.";
    }
    if (fixedBeds == null) {
      if (!beds.trim()) {
        found.beds = "Enter how many beds.";
      } else if (!Number.isInteger(bedCount)) {
        found.beds = "Beds must be a whole number.";
      } else if (bedCount < MIN_DORMITORY_BEDS) {
        found.beds = `A dormitory starts at ${MIN_DORMITORY_BEDS} beds — below that it is a ${humanizeToken("FOUR_SHARING").toLowerCase()} or smaller.`;
      } else if (takenBedCounts.includes(bedCount)) {
        found.beds = `You already have a ${bedCount}-bed ${variantLabel.toLowerCase()} dormitory. Edit that one, or pick another size.`;
      }
    }
    if (!form.validate(found)) {
      return;
    }

    onSave({
      amenities,
      baseRentPaise: rentPaise ?? 0,
      bedCount: fixedBeds == null ? bedCount : null,
      conditioning,
      customAmenities,
      images,
      sharingType,
    });
  }

  return (
    <SheetShell onClose={onClose} title={title}>
      <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }} keyboardShouldPersistTaps="handled">
        {fixedBeds == null ? (
          <FormInput
            error={form.errors.beds}
            keyboardType="number-pad"
            label="Beds in the room"
            onChangeText={(next) => {
              setBeds(next);
              form.clearField("beds");
            }}
            placeholder="6"
            required
            value={beds}
          />
        ) : (
          <LockedRow
            note={`Fixed by ${humanizeToken(sharingType).toLowerCase()}`}
            value={`${fixedBeds} ${fixedBeds === 1 ? "bed" : "beds"}`}
          />
        )}

        <View style={{ gap: 6 }}>
          <FormInput
            error={form.errors.rent}
            keyboardType="decimal-pad"
            label="Rent per bed, per month"
            onChangeText={(next) => {
              setRent(next);
              form.clearField("rent");
            }}
            placeholder="8000"
            prefix="₹"
            required
            value={rent}
          />
          {siblingRentPaise == null ? null : (
            <Text style={[type.caption, { color: colors.muted }]}>
              {conditioning === "AC" ? "Non-AC" : "AC"} is {formatMoneyPaise(siblingRentPaise)}.
            </Text>
          )}
        </View>

        <AmenityPicker
          amenities={amenities}
          conditioning={conditioning}
          customAmenities={customAmenities}
          onChangeAmenities={setAmenities}
          onChangeCustom={setCustomAmenities}
        />

        <View style={{ gap: spacing.sm }}>
          <View style={{ gap: 2 }}>
            <Text style={[type.label, { color: colors.inkSoft }]}>Room photos (optional)</Text>
            {/* Last in the sheet, and the only part that argues for itself. The
                rest of the form is facts the owner already knows; this one asks
                for work they can skip, so it has to say what the work buys. */}
            <Text style={[type.caption, { color: colors.muted }]}>
              Rooms with photos have higher chances of conversion into a real tenancy. Users prefer to see the
              rooms beforehand. Consider adding room photos.
            </Text>
          </View>

          {images.length < MAX_TYPE_IMAGES ? (
            <AddPhotoTarget
              busy={uploading}
              hint="Choose from your gallery"
              label="Add room photos"
              onPress={() => void pickImages()}
            />
          ) : null}

          <UploadProgress progress={uploadProgress} />

          {images.map((image, index) => (
            <PhotoRow
              busy={uploading}
              cover={index === 0}
              key={image.url}
              muted
              onMakeCover={() =>
                setImages((current) => [current[index], ...current.filter((_, at) => at !== index)])
              }
              onRemove={() => setImages((current) => current.filter((entry_) => entry_.url !== image.url))}
              title={index === 0 ? "Main photo" : `Photo ${index + 1}`}
              uri={image.url}
            />
          ))}
        </View>

        <ActionButton
          disabled={saving || form.blocked}
          label={saving ? "Saving…" : entry ? "Save changes" : `Create ${variantLabel.toLowerCase()} type`}
          onPress={submit}
        />

        {entry && entry.roomCount > 0 ? (
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
            {entry.roomCount} {entry.roomCount === 1 ? "room was" : "rooms were"} cut from this type. Changing it
            here sets the default for new rooms — it does not reprice the existing ones.
          </Text>
        ) : null}
      </ScrollView>

      {uploadError ? <AlertModal message={uploadError} onClose={() => setUploadError(null)} /> : null}
    </SheetShell>
  );
}

/** A value the form states rather than asks for. */
function LockedRow({ note, value }: { note: string; value: string }) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderRadius: 12,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <BedDouble color={colors.muted} size={16} strokeWidth={2.2} />
      <Text style={[type.bodyStrong, { color: colors.ink, flex: 1, fontSize: 14 }]}>{value}</Text>
      <Text style={[type.caption, { color: colors.muted }]}>{note}</Text>
    </View>
  );
}

