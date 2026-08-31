import { useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { AlertModal } from "@/components/alert-modal";
import { AppTextInput } from "@/components/app-text-input";
import { FieldError } from "@/components/field-error";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ArrowLeft, Camera, ImagePlus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import type { ConcernCategory } from "@/store/services/concern-api";
import { uploadAssets } from "@/features/uploads/upload-asset";
import { useCreateConcernMutation } from "@/store/services/concern-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CONCERN_CATEGORIES = [
  "MAINTENANCE",
  "CLEANING",
  "WIFI",
  "MESS",
  "WATER",
  "ELECTRICITY",
  "NOISE",
  "SECURITY",
  "PAYMENT",
  "LIFT",
  "OTHER",
] as const satisfies readonly ConcernCategory[];

const MAX_LOCAL_PHOTOS = 4;

/**
 * A photo already in storage.
 *
 * <p>Uploaded as it is picked rather than at submit. Batching the uploads into
 * the create call put the bytes inside the request, which on a slow connection
 * times the whole thing out — and the person loses the concern, not just the
 * photos. Abandoning the form now leaks the assets; the orphan sweep reclaims
 * them, which is the cheaper failure.
 */
type LocalConcernPhoto = {
  id: string;
  name: string;
  /** Remote URL, used for the thumbnail too. */
  uri: string;
  publicId: string;
};

export default function CreateConcernScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [createConcern, createState] = useCreateConcernMutation();
  const [category, setCategory] = useState<ConcernCategory>("MAINTENANCE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<LocalConcernPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  // Uploads run before the mutation, and are the slow half — the button has to
  // cover both or it sits idle while photos are in flight.
  const busy = uploading || createState.isLoading;
  const form = useFormErrors<"title" | "description">();
  // Photo/permission problems are not about a field and cannot be corrected in
  // one, so they take the modal alongside server refusals.
  const setError = (value: string | null) => {
    if (value) {
      form.failFromServer(value);
    }
  };

  const addPhotoAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const remaining = MAX_LOCAL_PHOTOS - photos.length;
    const accepted = assets.slice(0, remaining);
    if (accepted.length === 0) {
      return;
    }

    try {
      setUploading(true);
      const uploaded = await uploadAssets(
        accepted.map((asset, index) => ({
          mimeType: asset.mimeType,
          name: asset.fileName ?? `Photo ${photos.length + index + 1}`,
          size: asset.fileSize,
          uri: asset.uri,
        })),
        "CONCERN_PHOTO",
        (completed, total) => setUploadProgress({ completed, total }),
      );
      setPhotos((current) => [
        ...current,
        ...uploaded.map((asset, index) => ({
          id: asset.publicId,
          name: accepted[index]?.fileName ?? `Photo ${current.length + index + 1}`,
          publicId: asset.publicId,
          uri: asset.url,
        })),
      ].slice(0, MAX_LOCAL_PHOTOS));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error && uploadError.message
          ? uploadError.message
          : "Could not upload the photo. Try again.",
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const pickFromDevice = async () => {
    if (photos.length >= MAX_LOCAL_PHOTOS) {
      setError("You can attach up to 4 photos.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError("Allow photo library access to attach images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.75,
      selectionLimit: MAX_LOCAL_PHOTOS - photos.length,
    });

    if (!result.canceled) {
      await addPhotoAssets(result.assets);
      setError(null);
    }
  };

  const openCamera = async () => {
    if (photos.length >= MAX_LOCAL_PHOTOS) {
      setError("You can attach up to 4 photos.");
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setError("Allow camera access to capture a concern photo.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      mediaTypes: ["images"],
      quality: 0.75,
    });

    if (!result.canceled) {
      await addPhotoAssets(result.assets);
      setError(null);
    }
  };

  const submitConcern = async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    const problems = {
      ...(trimmedTitle ? {} : { title: "Add a short title for the concern." }),
      ...(trimmedDescription ? {} : { description: "Add the concern details before submitting." }),
    };
    if (!form.validate(problems)) {
      return;
    }

    try {
      // The photos are already in storage; only their handles travel with the
      // concern, so this request stays small however many were attached.
      await createConcern({
        category,
        description: trimmedDescription,
        photos: photos.map((photo, index) => ({
          displayOrder: index,
          photoPublicId: photo.publicId,
          photoUrl: photo.uri,
        })),
        title: trimmedTitle,
      }).unwrap();
      router.replace({ pathname: "/concerns", params: { createdConcern: "1" } });
    } catch (createError) {
      form.failFromServer(errorMessage(createError));
    }
  };

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="CONCERNS"
        italicTail="concern."
        subtitle="Add category, details and optional photos for the property team."
        title="Raise"
        trailing={
          <AnimatedPressable
            accessibilityLabel="Back to concerns"
            onPress={() => router.back()}
            style={{
              alignItems: "center",
              borderColor: colors.border,
              borderRadius: 12,
              borderWidth: 1,
              height: 42,
              justifyContent: "center",
              width: 42,
            }}
          >
            <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
          </AnimatedPressable>
        }
      />

      <Card>
        <View style={{ gap: spacing.md }}>
          <OptionGroup
            label="Category"
            options={CONCERN_CATEGORIES}
            selected={category}
            onSelect={(value) => {
              setCategory(value);
              setError(null);
            }}
          />

          <FormField
            label="Title"
            maxLength={160}
            onChangeText={(value) => {
              setTitle(value);
              form.clearField("title");
            }}
            placeholder="Short issue title"
            value={title}
          />
          <FieldError message={form.errors.title} />

          <PhotoAttachmentSection
            onOpenCamera={openCamera}
            onPickFromDevice={pickFromDevice}
            onRemovePhoto={(photoId) => setPhotos((current) => current.filter((photo) => photo.id !== photoId))}
            photos={photos}
            uploadProgress={uploadProgress}
          />

          <FormField
            label="Details"
            maxLength={1000}
            multiline
            onChangeText={(value) => {
              setDescription(value);
              form.clearField("description");
            }}
            placeholder="What happened? Add enough detail for the property team."
            value={description}
          />
          <FieldError message={form.errors.description} />


          <AnimatedPressable
            accessibilityRole="button"
            disabled={busy || form.blocked}
            onPress={submitConcern}
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 14,
              justifyContent: "center",
              minHeight: 52,
              opacity: busy || form.blocked ? 0.75 : 1,
              padding: spacing.md,
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 15, }}>
                Create concern
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </Card>

      {form.serverError ? (
        <AlertModal message={form.serverError} onClose={form.dismissServerError} />
      ) : null}
    </ScreenScrollView>
  );
}

function PhotoAttachmentSection({
  onOpenCamera,
  onPickFromDevice,
  onRemovePhoto,
  photos,
  uploadProgress,
}: {
  onOpenCamera: () => void;
  onPickFromDevice: () => void;
  onRemovePhoto: (photoId: string) => void;
  photos: LocalConcernPhoto[];
  uploadProgress: { completed: number; total: number } | null;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View style={{ gap: spacing.xs }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View
              style={{
                alignItems: "center",
                borderColor: colors.ink,
                borderWidth: 1,
                borderRadius: 10,
                height: 34,
                justifyContent: "center",
                width: 34,
              }}
            >
              <ImagePlus color={colors.ink} size={17} strokeWidth={2.3} />
            </View>
            <Text style={[type.eyebrow, { color: colors.primary }]}>
              Photos
            </Text>
          </View>
          <Text style={[type.body, { color: colors.kicker, fontSize: 12 }]}>
            {photos.length}/{MAX_LOCAL_PHOTOS}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          gap: spacing.sm,
          paddingTop: spacing.xs,
        }}
      >
        <PhotoActionButton icon={ImagePlus} label="Device" onPress={onPickFromDevice} />
        <PhotoActionButton icon={Camera} label="Camera" onPress={onOpenCamera} />
      </View>

      {uploadProgress ? (
        <View style={{ gap: 6, paddingTop: spacing.xs }}>
          <Text style={[type.caption, { color: colors.ink, fontFamily: fonts.sansBold }]}>
            Uploading {Math.min(uploadProgress.completed + 1, uploadProgress.total)} of {uploadProgress.total}…
          </Text>
          <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 4, overflow: "hidden" }}>
            <View
              style={{
                backgroundColor: colors.ink,
                height: 4,
                width: `${Math.round((uploadProgress.completed / Math.max(uploadProgress.total, 1)) * 100)}%`,
              }}
            />
          </View>
        </View>
      ) : null}

      {photos.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {photos.map((photo) => (
            <View
              key={photo.id}
              style={{
                borderColor: colors.border,
                borderRadius: 14,
                borderWidth: 1,
                overflow: "hidden",
                width: 92,
              }}
            >
              <Image
                source={{ uri: photo.uri }}
                style={{ backgroundColor: colors.neutralSoft, height: 72, width: "100%" }}
              />
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", padding: 6 }}>
                <Text numberOfLines={1} style={[type.body, { color: colors.muted, flex: 1, fontSize: 10 }]}>
                  {photo.name}
                </Text>
                <AnimatedPressable
                  accessibilityLabel="Remove photo"
                  onPress={() => onRemovePhoto(photo.id)}
                  style={{ alignItems: "center", height: 22, justifyContent: "center", width: 22 }}
                >
                  <X color={colors.primary} size={14} strokeWidth={2.4} />
                </AnimatedPressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PhotoActionButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof ImagePlus;
  label: string;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: spacing.sm,
        justifyContent: "flex-start",
        minHeight: 50,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.ink,
          borderWidth: 1,
          borderRadius: 9,
          height: 30,
          justifyContent: "center",
          width: 30,
        }}
      >
        <Icon color={colors.ink} size={15} strokeWidth={2.3} />
      </View>
      <Text style={[type.eyebrow, { color: colors.inkSoft, flex: 1, fontSize: 10.5 }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function OptionGroup<T extends string>({
  label,
  onSelect,
  options,
  selected,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: readonly T[];
  selected: T;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {options.map((option) => {
          const active = option === selected;

          return (
            <AnimatedPressable
              accessibilityRole="button"
              key={option}
              onPress={() => onSelect(option)}
              style={{
                backgroundColor: active ? colors.primarySoft : colors.surfaceRaised,
                borderColor: active ? colors.primary : colors.border,
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={[type.eyebrow, { color: active ? colors.primary : colors.inkSoft, fontSize: 10 }]}>
                {humanizeToken(option)}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function FormField({
  label,
  maxLength,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  maxLength: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          {label}
        </Text>
        <Text style={[type.body, { color: colors.kicker, fontFamily: fonts.mono, fontSize: 11 }]}>
          {value.length}/{maxLength}
        </Text>
      </View>
      <AppTextInput
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 15,
          minHeight: multiline ? 120 : 52,
          padding: spacing.md,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
    </View>
  );
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
