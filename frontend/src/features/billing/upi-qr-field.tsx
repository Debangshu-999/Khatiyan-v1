import { useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImagePlus, QrCode, Trash2 } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { FieldError } from "@/components/field-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, RequiredMark } from "@/features/owner/owner-ui";
import { uploadAsset, UploadError } from "@/features/uploads/upload-asset";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** How wide the preview is drawn — square, as a QR is always square. */
const PREVIEW_SIZE = 190;

/**
 * Matches {@code FIELD_RADIUS} on the payment details screen, the only place
 * this field is used. The frame reads as one of the form's inputs, so a corner
 * of its own would make it the odd element in the stack.
 */
const FRAME_RADIUS = 6;

/**
 * The owner's UPI QR, shown the way a tenant will see it.
 *
 * <p>
 * Not {@code SingleImageField}. That one presents an attachment as a filename on
 * a row, which is right for a payment proof nobody looks at twice — but this
 * image IS the payment instruction, and the owner needs to see it at the size
 * and shape their tenant will, so a blurry or cropped screenshot is obvious
 * here rather than after a tenant fails to scan it.
 *
 * <p>
 * <b>Gallery only, no camera.</b> A QR is displayed on another screen and
 * saved, or downloaded from a banking app — photographing one off a monitor
 * produces exactly the moiré and skew that make it unscannable, so the camera
 * is not offered rather than offered and regretted.
 */
export function UpiQrField({
  disabled,
  error,
  onChange,
  required,
  url,
}: {
  disabled?: boolean;
  /** Shown under the field, like any input's own error. */
  error?: string;
  /** Marks the label, the same way a required input does. */
  required?: boolean;
  /** The stored URL, or "" once cleared. Never a device URI. */
  onChange: (value: string) => void;
  url: string;
}) {
  const { colors, type } = useTheme();
  // Uploads and permission denials happen mid-operation, with no field to
  // correct — the modal channel rather than an inline error.
  const opErrors = useFormErrors<never>();
  const [uploading, setUploading] = useState(false);

  const busy = uploading || disabled;

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      opErrors.failFromServer("Allow photo library access to attach your QR code.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadAsset(
        {
          mimeType: asset.mimeType,
          name: asset.fileName ?? "upi-qr",
          size: asset.fileSize,
          uri: asset.uri,
        },
        "PAYMENT_PROOF",
      );
      onChange(uploaded.url);
    } catch (uploadError) {
      // Only our own message is safe to show. Anything else carries developer
      // text and goes to the log instead.
      if (!(uploadError instanceof UploadError)) {
        console.error("QR upload failed", uploadError);
      }
      opErrors.failFromServer(
        uploadError instanceof UploadError ? uploadError.message : "Could not upload the QR code. Try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
        UPI QR code
        <RequiredMark required={required} />
      </Text>

      {/* No container around this. The square already reads as a bounded object,
          and a border around a bordered preview made two frames for one field —
          out of step with the plain inputs it sits between. */}
      <View style={{ alignItems: "center", gap: spacing.sm }}>
        {/* The frame is the same square whether or not there is an image in it,
            so attaching one does not shove the rest of the form down the page. */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.border,
            borderRadius: FRAME_RADIUS,
            borderWidth: 1,
            height: PREVIEW_SIZE,
            justifyContent: "center",
            overflow: "hidden",
            width: PREVIEW_SIZE,
          }}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : url ? (
            <Image
              accessibilityLabel="Your UPI QR code"
              // `contain`, never `cover`. A cropped QR is an unscannable QR, and
              // cover would silently trim the finder patterns at the corners —
              // the exact parts a scanner needs.
              resizeMode="contain"
              source={{ uri: url }}
              style={{ height: PREVIEW_SIZE, width: PREVIEW_SIZE }}
            />
          ) : (
            <QrCode color={colors.kicker} size={54} strokeWidth={1.6} />
          )}

          {/* Inside the frame, bottom right, on its own disc so it stays visible
              over a white QR. A caption and a separate row under the image only
              pushed the form down for a control that belongs to the image. */}
          {url && !uploading ? (
            <AnimatedPressable
              accessibilityLabel="Remove QR code"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => onChange("")}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 999,
                borderWidth: 1,
                bottom: spacing.xs,
                height: 32,
                justifyContent: "center",
                position: "absolute",
                right: spacing.xs,
                width: 32,
              }}
            >
              <Trash2 color={colors.danger} size={16} strokeWidth={2.2} />
            </AnimatedPressable>
          ) : null}
        </View>

        {url ? null : (
          <ActionButton
            disabled={busy}
            icon={ImagePlus}
            label={uploading ? "Uploading…" : "Add from gallery"}
            onPress={() => void pickFromLibrary()}
            variant="secondary"
          />
        )}
      </View>

      <FieldError message={error} />

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </View>
  );
}
