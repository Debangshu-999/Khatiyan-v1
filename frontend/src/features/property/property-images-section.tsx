import { useState } from "react";
import { Image, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { AddPhotoTarget, PhotoRow, UploadProgress } from "@/features/property/photo-list";
import { SkeletonCard } from "@/components/skeleton";
import { AlertModal } from "@/components/alert-modal";
import { ImageCaptionDialog, type CaptionedAsset } from "@/features/property/image-caption-dialog";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";

import { uploadAssets } from "@/features/uploads/upload-asset";
import {
  useAddPropertyImagesMutation,
  useListPropertyImagesQuery,
  useMakePropertyImageCoverMutation,
  useRemovePropertyImageMutation,
  type PropertyImage,
  useUpdatePropertyImageCaptionMutation,
} from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** Mirrors the backend cap on discovery.property_images. */
const MAX_PROPERTY_IMAGES = 10;

/**
 * The listing gallery for a property that already exists.
 *
 * <p>Unlike registration, every change here is immediate: the property is real,
 * so an added image has somewhere to belong the moment it uploads and there is
 * no submit to batch it into. Each mutation returns the whole reordered gallery,
 * so nothing is recomputed on this side.
 */
export function PropertyImagesSection({
  onChanged,
  propertyId,
}: {
  /**
   * Fired after any gallery change lands on the server.
   *
   * <p>The screen around this one has a Save button for its own fields. Without
   * this, adding an image or promoting a cover and then pressing Save was told
   * "No changes have been made" — true of the form, and the opposite of what
   * the reader had just done.
   */
  onChanged?: () => void;
  propertyId: string;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  // Gallery failures arrive mid-operation, with nothing on screen to correct.
  const opErrors = useFormErrors<never>();
  const imagesQuery = useListPropertyImagesQuery(propertyId, { skip: !propertyId });
  const [addImages, addState] = useAddPropertyImagesMutation();
  const [removeImage, removeState] = useRemovePropertyImageMutation();
  const [makeCover, coverState] = useMakePropertyImageCoverMutation();
  const [updateCaption, captionState] = useUpdatePropertyImageCaptionMutation();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  // Picked but not yet uploaded: the owner is being asked what each photo is of
  // before anything leaves the device.
  const [pendingAssets, setPendingAssets] = useState<ImagePicker.ImagePickerAsset[] | null>(null);
  // The photo whose caption is being rewritten, if any.
  const [editing, setEditing] = useState<PropertyImage | null>(null);

  const images = imagesQuery.data ?? [];
  const busy = uploading || addState.isLoading || removeState.isLoading || coverState.isLoading || captionState.isLoading;

  async function pickAndUpload() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      opErrors.failFromServer("Allow photo library access to add listing images.");
      return;
    }
    const remaining = MAX_PROPERTY_IMAGES - images.length;
    if (remaining <= 0) {
      opErrors.failFromServer(`A property can have at most ${MAX_PROPERTY_IMAGES} images.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.8,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }

    // Ask before uploading, not after: a caption sheet over an upload already in
    // flight would be asking about something the owner can no longer cancel.
    setPendingAssets(result.assets);
  }

  async function upload(captioned: CaptionedAsset[]) {
    const assets = pendingAssets ?? [];
    setPendingAssets(null);
    if (assets.length === 0) {
      return;
    }

    try {
      setUploading(true);
      const uploaded = await uploadAssets(
        assets.map((asset, index) => ({
          mimeType: asset.mimeType,
          name: asset.fileName ?? `Property image ${images.length + index + 1}`,
          size: asset.fileSize,
          uri: asset.uri,
        })),
        "PROPERTY_IMAGE",
        (completed, total) => setProgress({ completed, total }),
      );
      await addImages({
        // Positional: uploadAssets preserves the order it was given, which is
        // the order the sheet captioned them in.
        images: uploaded.map((asset, index) => ({
          caption: captioned[index]?.caption?.trim() || null,
          publicId: asset.publicId,
          url: asset.url,
        })),
        propertyId,
      }).unwrap();
      toast.success(uploaded.length === 1 ? "Image added." : `${uploaded.length} images added.`);
      onChanged?.();
    } catch (error) {
      opErrors.failFromServer(errorText(error, "Could not add the images. Try again."));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function remove(imageId: string) {
    try {
      await removeImage({ imageId, propertyId }).unwrap();
      toast.success("Image removed.");
      onChanged?.();
    } catch (error) {
      opErrors.failFromServer(errorText(error, "Could not remove the image."));
    }
  }

  async function saveCaption(image: PropertyImage, caption: string) {
    setEditing(null);
    try {
      await updateCaption({ caption: caption.trim() || null, imageId: image.id, propertyId }).unwrap();
      toast.success(caption.trim() ? "Caption updated." : "Caption removed.");
      onChanged?.();
    } catch (error) {
      opErrors.failFromServer(errorText(error, "Could not update the caption."));
    }
  }

  async function promote(imageId: string) {
    try {
      await makeCover({ imageId, propertyId }).unwrap();
      toast.success("Cover updated.");
      onChanged?.();
    } catch (error) {
      opErrors.failFromServer(errorText(error, "Could not change the cover."));
    }
  }

  // isLoading is only true on the very first fetch for a cache key, so an empty
  // gallery mid-refetch would otherwise flash the "no images" copy.
  if (imagesQuery.isFetching && images.length === 0) {
    return <SkeletonCard />;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {pendingAssets ? (
        <ImageCaptionDialog
          onCancel={() => setPendingAssets(null)}
          onDone={(captioned) => void upload(captioned)}
          uris={pendingAssets.map((asset) => asset.uri)}
        />
      ) : null}

      {/* The same dialog as the upload flow, given one photo and its current
          words. A second, nearly identical component would drift from this one
          the first time either changed. */}
      {editing ? (
        <ImageCaptionDialog
          confirmLabel="Save"
          initialCaptions={[editing.caption ?? ""]}
          onCancel={() => setEditing(null)}
          onDone={(captioned) => void saveCaption(editing, captioned[0]?.caption ?? "")}
          uris={[editing.url]}
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
      {images.length < MAX_PROPERTY_IMAGES ? (
        <AddPhotoTarget busy={busy} onPress={() => void pickAndUpload()} />
      ) : null}

      <UploadProgress progress={progress} />

      <View style={{ gap: spacing.xs }}>
        {images.map((image) => (
          <PhotoRow
            busy={busy}
            cover={image.cover}
            key={image.id}
            muted={!image.caption}
            onEditCaption={() => setEditing(image)}
            onMakeCover={() => void promote(image.id)}
            onRemove={() => void remove(image.id)}
            title={image.caption || "No caption"}
            uri={image.url}
          />
        ))}
      </View>

      {images.length === 0 ? (
        <Text style={[type.caption, { color: colors.danger }]}>
          A listing needs at least one image to appear in search.
        </Text>
      ) : null}
    </View>
  );
}

function errorText(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: { message?: string; code?: string } }).data;
    // A rule we wrote for the owner â€” "a listing needs at least one image" â€” is
    // the endpoint working, not failing. console.error raises a red LogBox over
    // the app, so removing the last photo looked like a crash on top of the
    // modal that had already explained it politely.
    if (data?.code === "VALIDATION_ERROR" && data.message) {
      return data.message;
    }
    console.error("Property image request failed:", data);
    return fallback;
  }
  console.error("Property image request failed:", error);
  return fallback;
}
