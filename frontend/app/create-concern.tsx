import { useState } from "react";
import { ActivityIndicator, Image, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ArrowLeft, Camera, ImagePlus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import type { ConcernCategory, ConcernPriority } from "@/store/services/concern-api";
import { useCreateConcernMutation } from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
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

const CONCERN_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const satisfies readonly ConcernPriority[];
const MAX_LOCAL_PHOTOS = 4;

type LocalConcernPhoto = {
  id: string;
  name: string;
  uri: string;
};

export default function CreateConcernScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const [createConcern, createState] = useCreateConcernMutation();
  const [category, setCategory] = useState<ConcernCategory>("MAINTENANCE");
  const [priority, setPriority] = useState<ConcernPriority>("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<LocalConcernPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addPhotoAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    setPhotos((current) => {
      const remaining = MAX_LOCAL_PHOTOS - current.length;
      const nextPhotos = assets.slice(0, remaining).map((asset, index) => ({
        id: `${Date.now()}-${index}-${asset.assetId ?? asset.uri}`,
        name: asset.fileName ?? `Photo ${current.length + index + 1}`,
        uri: asset.uri,
      }));

      return [...current, ...nextPhotos];
    });
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
      addPhotoAssets(result.assets);
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
      addPhotoAssets(result.assets);
      setError(null);
    }
  };

  const submitConcern = async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      setError("Add a short title for the concern.");
      return;
    }

    if (!trimmedDescription) {
      setError("Add the concern details before submitting.");
      return;
    }

    try {
      await createConcern({
        category,
        description: trimmedDescription,
        priority,
        title: trimmedTitle,
      }).unwrap();
      router.replace({ pathname: "/concerns", params: { createdConcern: "1" } });
    } catch {
      setError("Could not raise this concern. Please try again.");
    }
  };

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="CONCERNS"
        italicTail="concern."
        subtitle="Add category, priority, details and optional photos for the property team."
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

          <OptionGroup
            label="Priority"
            options={CONCERN_PRIORITIES}
            selected={priority}
            onSelect={(value) => {
              setPriority(value);
              setError(null);
            }}
          />

          <FormField
            label="Title"
            maxLength={160}
            onChangeText={(value) => {
              setTitle(value);
              setError(null);
            }}
            placeholder="Short issue title"
            value={title}
          />

          <PhotoAttachmentSection
            onOpenCamera={openCamera}
            onPickFromDevice={pickFromDevice}
            onRemovePhoto={(photoId) => setPhotos((current) => current.filter((photo) => photo.id !== photoId))}
            photos={photos}
          />

          <FormField
            label="Details"
            maxLength={1000}
            multiline
            onChangeText={(value) => {
              setDescription(value);
              setError(null);
            }}
            placeholder="What happened? Add enough detail for the property team."
            value={description}
          />

          {error ? (
            <Text style={[type.body, { color: colors.danger, fontWeight: "700" }]} selectable>
              {error}
            </Text>
          ) : null}

          <AnimatedPressable
            accessibilityRole="button"
            onPress={submitConcern}
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 14,
              justifyContent: "center",
              minHeight: 52,
              opacity: createState.isLoading ? 0.75 : 1,
              padding: spacing.md,
            }}
          >
            {createState.isLoading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 15, fontWeight: "800" }} selectable>
                Create concern
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </Card>
    </ScreenScrollView>
  );
}

function PhotoAttachmentSection({
  onOpenCamera,
  onPickFromDevice,
  onRemovePhoto,
  photos,
}: {
  onOpenCamera: () => void;
  onPickFromDevice: () => void;
  onRemovePhoto: (photoId: string) => void;
  photos: LocalConcernPhoto[];
}) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 16,
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
                backgroundColor: colors.primarySoft,
                borderRadius: 10,
                height: 34,
                justifyContent: "center",
                width: 34,
              }}
            >
              <ImagePlus color={colors.primary} size={17} strokeWidth={2.3} />
            </View>
            <Text style={[type.eyebrow, { color: colors.primary }]} selectable>
              Photos
            </Text>
          </View>
          <Text style={[type.body, { color: colors.kicker, fontSize: 12 }]} selectable>
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
                <Text numberOfLines={1} style={[type.body, { color: colors.muted, flex: 1, fontSize: 10 }]} selectable>
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
          backgroundColor: colors.primarySoft,
          borderRadius: 9,
          height: 30,
          justifyContent: "center",
          width: 30,
        }}
      >
        <Icon color={colors.primary} size={15} strokeWidth={2.3} />
      </View>
      <Text style={[type.eyebrow, { color: colors.inkSoft, flex: 1, fontSize: 10.5 }]} selectable>
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
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
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
              <Text style={[type.eyebrow, { color: active ? colors.primary : colors.inkSoft, fontSize: 10 }]} selectable>
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
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          {label}
        </Text>
        <Text style={[type.body, { color: colors.kicker, fontFamily: fonts.mono, fontSize: 11 }]} selectable>
          {value.length}/{maxLength}
        </Text>
      </View>
      <TextInput
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
