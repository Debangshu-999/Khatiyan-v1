import { useState } from "react";
import { Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { PropertyImageGrid } from "@/features/property/property-image-grid";
import { uploadAssets } from "@/features/uploads/upload-asset";
import {
  useAddPropertyImagesMutation,
  useListPropertyImagesQuery,
  useMakePropertyImageCoverMutation,
  useRemovePropertyImageMutation,
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
export function PropertyImagesSection({ propertyId }: { propertyId: string }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const imagesQuery = useListPropertyImagesQuery(propertyId, { skip: !propertyId });
  const [addImages, addState] = useAddPropertyImagesMutation();
  const [removeImage, removeState] = useRemovePropertyImageMutation();
  const [makeCover, coverState] = useMakePropertyImageCoverMutation();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  const images = imagesQuery.data ?? [];
  const busy = uploading || addState.isLoading || removeState.isLoading || coverState.isLoading;

  async function pickAndUpload() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error("Allow photo library access to add listing images.");
      return;
    }
    const remaining = MAX_PROPERTY_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`A property can have at most ${MAX_PROPERTY_IMAGES} images.`);
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

    try {
      setUploading(true);
      const uploaded = await uploadAssets(
        result.assets.map((asset, index) => ({
          mimeType: asset.mimeType,
          name: asset.fileName ?? `Property image ${images.length + index + 1}`,
          size: asset.fileSize,
          uri: asset.uri,
        })),
        "PROPERTY_IMAGE",
        (completed, total) => setProgress({ completed, total }),
      );
      await addImages({
        images: uploaded.map((asset) => ({ publicId: asset.publicId, url: asset.url })),
        propertyId,
      }).unwrap();
      toast.success(uploaded.length === 1 ? "Image added." : `${uploaded.length} images added.`);
    } catch (error) {
      toast.error(errorText(error, "Could not add the images. Try again."));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function remove(imageId: string) {
    try {
      await removeImage({ imageId, propertyId }).unwrap();
      toast.success("Image removed.");
    } catch (error) {
      toast.error(errorText(error, "Could not remove the image."));
    }
  }

  async function promote(imageId: string) {
    try {
      await makeCover({ imageId, propertyId }).unwrap();
      toast.success("Cover updated.");
    } catch (error) {
      toast.error(errorText(error, "Could not change the cover."));
    }
  }

  // isLoading is only true on the very first fetch for a cache key, so an empty
  // gallery mid-refetch would otherwise flash the "no images" copy.
  if (imagesQuery.isFetching && images.length === 0) {
    return <SkeletonCard />;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <PropertyImageGrid
        busy={busy}
        max={MAX_PROPERTY_IMAGES}
        onAdd={() => void pickAndUpload()}
        onMakeCover={(tile) => void promote(tile.key)}
        onRemove={(tile) => void remove(tile.key)}
        progress={progress}
        tiles={images.map((image) => ({ cover: image.cover, key: image.id, uri: image.url }))}
      />
      {images.length === 0 ? (
        <Text style={[type.caption, { color: colors.danger }]}>
          A listing needs at least one image to appear in search.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What to show when a gallery call fails.
 *
 * <p>Server messages are logged, not shown. Most are written for whoever is
 * reading the stack trace — "Property image with id … not found" tells the
 * owner nothing they can act on. The exception is a deliberate rule we wrote
 * for them, which the backend marks VALIDATION_ERROR.
 */
function errorText(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: { message?: string; code?: string } }).data;
    console.error("Property image request failed:", data);
    if (data?.code === "VALIDATION_ERROR" && data.message) {
      return data.message;
    }
    return fallback;
  }
  console.error("Property image request failed:", error);
  return fallback;
}
