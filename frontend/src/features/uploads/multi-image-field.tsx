import { useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Camera, FileText, HardDrive, ImagePlus } from "lucide-react-native";
import { DeleteIcon as Trash2 } from "@/components/delete-icon";

import { AlertModal } from "@/components/alert-modal";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { UploadRulesInfo } from "@/features/uploads/upload-rules-info";
import { uploadAssets, UploadError, type UploadTarget } from "@/features/uploads/upload-asset";
import { isDocumentUrl } from "@/features/uploads/upload-limits";
import { ActionButton, IconButton } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/**
 * A capped set of photos, for the places that want more than one but not many.
 *
 * <p>Separate from {@code SingleImageField} rather than a `max` prop on it.
 * That field's value is a string and three screens hold it as one; widening it
 * to an array would have rewritten all of them to gain nothing. This one owns
 * the array and the cap.
 *
 * <p>The two ways in come first and the attachments sit under them, so the
 * buttons keep their place as photos arrive. They stop being offered once the
 * cap is reached — a disabled button that says why beats one that accepts a
 * third photo and then refuses it.
 */
export function MultiImageField({
  disabled,
  documentTarget,
  label,
  libraryLabel = "Gallery",
  max,
  onChange,
  showList = true,
  target,
  urls,
}: {
  /** False when the caller draws the photos itself, as a carousel (2026-10-29). */
  showList?: boolean;
  disabled?: boolean;
  /**
   * Take files from the device instead of the gallery: one "Device" button in
   * Gallery's place opens the file picker for photos and PDFs alike, photos
   * uploaded to `target` and PDFs here, counted against the same cap. Images
   * are files too, so there is no separate Gallery (user, 2026-10-28).
   */
  documentTarget?: UploadTarget;
  label: string;
  /** Name shown on the photo-library action. Gallery, app-wide (user, 2026-10-28). */
  libraryLabel?: string;
  /** How many photos this field accepts. */
  max: number;
  onChange: (urls: string[]) => void;
  target: UploadTarget;
  urls: string[];
}) {
  const { colors, type } = useTheme();
  const [uploading, setUploading] = useState(false);
  // A refusal with nothing on screen to correct — the AlertModal channel.
  const opErrors = useFormErrors<never>();

  const full = urls.length >= max;
  const busy = uploading || disabled;

  async function attach(assets: ImagePicker.ImagePickerAsset[]) {
    // Clamped again here. selectionLimit is honoured on Android and iOS 14+,
    // but allowsMultipleSelection is documented for iOS and web only — so a
    // platform that ignores one of them must not be able to push a third photo
    // past the cap.
    const room = max - urls.length;
    const picked = assets.slice(0, Math.max(0, room));
    if (picked.length === 0) {
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadAssets(
        picked.map((asset) => ({
          mimeType: asset.mimeType,
          name: asset.fileName ?? label,
          size: asset.fileSize,
          uri: asset.uri,
        })),
        target,
      );
      onChange([...urls, ...uploaded.map((file) => file.url)].slice(0, max));
    } catch (uploadError) {
      // Only copy written for a person reaches the modal; anything else is a
      // developer message and goes to the log. See UploadError.
      if (!(uploadError instanceof UploadError)) {
        console.error("Image upload failed", uploadError);
      }
      opErrors.failFromServer(
        uploadError instanceof UploadError
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

    // The picker itself refuses the third photo, rather than letting somebody
    // choose five and discovering the cap afterwards. The limit is what is
    // still FREE, not the cap, so picking one then opening it again offers one.
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: max - urls.length > 1,
      mediaTypes: ["images"],
      quality: 0.75,
      selectionLimit: Math.max(1, max - urls.length),
    });
    if (!result.canceled && result.assets.length > 0) {
      await attach(result.assets);
    }
  }

  async function pickDocuments() {
    if (!documentTarget) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: max - urls.length > 1,
      type: ["application/pdf", "image/*"],
    });
    if (result.canceled) return;
    const picked = result.assets.slice(0, Math.max(0, max - urls.length));
    if (picked.length === 0) return;
    setUploading(true);
    try {
      // In the order picked, each to its own target: a PDF must not be stored as an image.
      const added: string[] = [];
      for (const [index, asset] of picked.entries()) {
        const pdf = asset.mimeType === "application/pdf" || /\.pdf$/i.test(asset.name ?? "");
        const [file] = await uploadAssets(
          [{
            mimeType: asset.mimeType,
            name: asset.name || `${label} ${index + 1}${pdf ? ".pdf" : ""}`,
            size: asset.size,
            uri: asset.uri,
          }],
          pdf ? documentTarget : target,
        );
        added.push(file.url);
      }
      onChange([...urls, ...added].slice(0, max));
    } catch (uploadError) {
      if (!(uploadError instanceof UploadError)) {
        console.error("Document upload failed", uploadError);
      }
      opErrors.failFromServer(
        uploadError instanceof UploadError
          ? uploadError.message
          : "Could not upload the document. Try again.",
      );
    } finally {
      setUploading(false);
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
      await attach([result.assets[0]]);
    }
  }

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
      {/* The rules sit beside the label, where they can be read BEFORE picking
          — the alternative is choosing a photo and being told about it after. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
          {label}
        </Text>
        <UploadRulesInfo documents={documentTarget ? "pdf" : false} max={max} />
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {documentTarget ? (
          <ActionButton
            disabled={busy || full}
            icon={HardDrive}
            label="Device"
            onPress={() => void pickDocuments()}
            variant="upload"
          />
        ) : (
          <ActionButton
            disabled={busy || full}
            icon={ImagePlus}
            label={libraryLabel}
            onPress={() => void pickFromLibrary()}
            variant="upload"
          />
        )}
        <ActionButton
          disabled={busy || full}
          icon={Camera}
          label="Camera"
          onPress={() => void capturePhoto()}
          variant="upload"
        />
      </View>

      {full ? (
        <Text style={[type.caption, { color: colors.kicker }]}>
          {max} {documentTarget ? "files" : "photos"} attached. Remove one to add another.
        </Text>
      ) : null}

      {uploading ? (
        <View style={rowStyle}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
            Uploading...
          </Text>
        </View>
      ) : null}

      {(showList ? urls : []).map((url, index) => (
        <View
          key={url}
          style={{
            ...rowStyle,
            // Sunken rather than a tint: jadeSoft is two points off white and
            // reads as nothing, and primarySoft is banned as a fill.
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.borderStrong,
          }}
        >
          {isDocumentUrl(url) ? (
            <View style={{ alignItems: "center", borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 48, justifyContent: "center", width: 48 }}>
              <FileText color={colors.ink} size={22} strokeWidth={2} />
            </View>
          ) : (
            <Image resizeMode="cover" source={{ uri: url }} style={{ borderRadius: 8, height: 48, width: 48 }} />
          )}
          <FitText numberOfLines={1} style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>
            {isDocumentUrl(url)
              ? urls.length > 1 ? `PDF ${index + 1}` : "PDF attached"
              : urls.length > 1 ? `Photo ${index + 1}` : "Photo attached"}
          </FitText>
          {/* A bin, not a cross. A cross beside an attachment reads as "close
              this", and the only thing it could close is the row itself. */}
          <IconButton
            accessibilityLabel={`Remove ${isDocumentUrl(url) ? "PDF" : "photo"} ${index + 1}`}
            icon={Trash2}
            onPress={() => onChange(urls.filter((kept) => kept !== url))}
          />
        </View>
      ))}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </View>
  );
}
