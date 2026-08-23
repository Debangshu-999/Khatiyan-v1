import { useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, IconButton } from "@/features/owner/owner-ui";
import { uploadAsset, type UploadTarget } from "@/features/uploads/upload-asset";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Attaches exactly one stored image to a record — a payment proof, a photo of a
 * nearby place — from the library or the camera.
 *
 * <p><b>The picked file is uploaded here, not at submit time.</b> This replaces
 * screens that handed the picker's own {@code uri} to their form state, which
 * then saved it as the stored URL. That URI names a file inside this install's
 * sandbox: it resolves on the device that picked it, until the OS clears the
 * cache, and nowhere else ever. Every record written that way holds a dead
 * link — including for the person a payment proof exists to protect, who is
 * looking at it from a different phone.
 *
 * <p>Uploading on pick rather than on submit means the caller always holds a
 * real URL, and a failed upload is reported while the person is still looking
 * at the picker rather than at the end of a form they thought they had filled
 * in. The cost is an orphaned Cloudinary object when someone attaches an image
 * and then abandons the form; that is the same trade the concern and property
 * screens make, and the cheaper of the two mistakes.
 *
 * <p>For several images at once, see the property and notice sections — they
 * manage an ordered list and a per-file progress count, which is a different
 * control, not a longer version of this one.
 */
export function SingleImageField({
  attachedLabel = "Image attached",
  disabled,
  label,
  onChange,
  target,
  url,
}: {
  /** Shown beside the thumbnail once stored, e.g. "Proof attached". */
  attachedLabel?: string;
  disabled?: boolean;
  label: string;
  /** The stored URL, or "" once cleared. Never a device URI. */
  onChange: (value: string) => void;
  /** Decides the folder and the accepted formats — the server maps it. */
  target: UploadTarget;
  url: string;
}) {
  const { colors, type } = useTheme();
  // Uploads and permission denials happen mid-operation — there is no field to
  // correct, so they surface as a modal rather than a line under the buttons.
  const opErrors = useFormErrors<never>();
  const [uploading, setUploading] = useState(false);

  async function attach(asset: ImagePicker.ImagePickerAsset) {
    setUploading(true);
    try {
      const uploaded = await uploadAsset(
        {
          mimeType: asset.mimeType,
          name: asset.fileName ?? label,
          size: asset.fileSize,
          uri: asset.uri,
        },
        target,
      );
      onChange(uploaded.url);
    } catch (uploadError) {
      opErrors.failFromServer(
        uploadError instanceof Error && uploadError.message
          ? uploadError.message
          : "Could not upload the image. Try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      opErrors.failFromServer("Allow photo library access to attach an image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      await attach(result.assets[0]);
    }
  }

  async function capturePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      opErrors.failFromServer("Allow camera access to capture an image.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      await attach(result.assets[0]);
    }
  }

  const busy = uploading || disabled;
  const rowStyle = {
    alignItems: "center" as const,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: spacing.sm,
    padding: spacing.sm,
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
        {label}
      </Text>

      {uploading ? (
        <View style={rowStyle}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
            Uploading...
          </Text>
        </View>
      ) : url ? (
        <View style={rowStyle}>
          <Image resizeMode="cover" source={{ uri: url }} style={{ borderRadius: 8, height: 48, width: 48 }} />
          <Text numberOfLines={1} style={[type.caption, { color: colors.muted, flex: 1 }]}>
            {attachedLabel}
          </Text>
          <IconButton accessibilityLabel="Remove image" icon={X} onPress={() => onChange("")} />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ActionButton
          disabled={busy}
          icon={ImagePlus}
          label={url ? "Replace" : "Choose image"}
          onPress={() => void pickFromLibrary()}
          variant="secondary"
        />
        <ActionButton
          disabled={busy}
          icon={Camera}
          label="Camera"
          onPress={() => void capturePhoto()}
          variant="secondary"
        />
      </View>

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </View>
  );
}
