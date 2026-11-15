import { useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { AlertModal } from "@/components/alert-modal";
import { AppTextInput } from "@/components/app-text-input";
import { FieldError } from "@/components/field-error";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Camera, ChevronDown, ImagePlus, MessageSquareWarning, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { PickerOptionRow } from "@/components/picker-option-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ActionButton, FormInput, RequiredMark } from "@/features/owner/owner-ui";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { cardShadow, softShadow } from "@/theme/shadows";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import type { ConcernCategory } from "@/store/services/concern-api";
import { uploadAssets } from "@/features/uploads/upload-asset";
import { useCreateConcernMutation } from "@/store/services/concern-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { EmptyState } from "@/components/empty-state";
import { REQUESTS_NOT_STARTED, tenancyNotStarted } from "@/features/tenancy/starts-soon-bubble";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

const CONCERN_CATEGORY_OPTIONS = [
  { label: "Maintenance", subtitle: "Repairs, fixtures or property damage", value: "MAINTENANCE" },
  { label: "Cleaning", subtitle: "Cleanliness or housekeeping", value: "CLEANING" },
  { label: "Wi-Fi", subtitle: "Internet access or connection", value: "WIFI" },
  { label: "Mess", subtitle: "Meals or dining service", value: "MESS" },
  { label: "Water", subtitle: "Water supply or quality", value: "WATER" },
  { label: "Electricity", subtitle: "Power, wiring or electrical issues", value: "ELECTRICITY" },
  { label: "Noise", subtitle: "Disturbance or quiet-hours issues", value: "NOISE" },
  { label: "Security", subtitle: "Access, safety or security", value: "SECURITY" },
  { label: "Payment", subtitle: "Rent, deposit or payment issues", value: "PAYMENT" },
  { label: "Lift", subtitle: "Lift or elevator issues", value: "LIFT" },
  { label: "Other", subtitle: "Anything that does not fit above", value: "OTHER" },
] as const satisfies readonly {
  label: string;
  subtitle: string;
  value: ConcernCategory;
}[];

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
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const activeTenancy = activeTenancyQuery.data;
  // Nothing chosen to begin with (user, 2026-11-11).
  const [category, setCategory] = useState<ConcernCategory | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<LocalConcernPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  // Uploads run before the mutation, and are the slow half — the button has to
  // cover both or it sits idle while photos are in flight.
  const busy = uploading || createState.isLoading;
  const form = useFormErrors<"category" | "title" | "description">();
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
      ...(category ? {} : { category: "Select a category." }),
      ...(trimmedTitle ? {} : { title: "Add a short title for the concern." }),
      ...(trimmedDescription ? {} : { description: "Add the concern details before submitting." }),
    };
    if (!form.validate(problems) || !category) {
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

  const loadFailed = loadFailure(activeTenancyQuery);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  if (activeTenancy && tenancyNotStarted(activeTenancy.tenancy.startDate)) {
    return (
      <ScreenScrollView contentContainerStyle={{ paddingBottom: spacing.md }}>
        <ScreenHeader italicTail="concern." title="Raise" />
        <EmptyState
          icon={MessageSquareWarning}
          title="Your tenancy has not started"
          description={REQUESTS_NOT_STARTED.concern}
        />
      </ScreenScrollView>
    );
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
    <ScreenScrollView bottomPaddingCovered contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }} safeAreaEdges={["top"]}>
      <ScreenHeader
        italicTail="concern."
        subtitle="Tell the property team what needs attention and add photos if they help."
        title="Raise"
      />

      {/* Labels on the fields themselves, no section headers (user, 2026-11-11). */}
      <View style={{ gap: 6 }}>
        <Text style={[type.label, { color: colors.muted }]}>
          Category<RequiredMark required />
        </Text>
        <CategoryPickerField error={Boolean(form.errors.category)} onPress={() => setCategoryPickerOpen(true)} value={category} />
        {form.errors.category ? <Text style={[type.caption, { color: colors.danger }]}>{form.errors.category}</Text> : null}
      </View>

      <FormInput
        error={form.errors.title}
        label="Title"
        labelAccessory={<Text style={[type.caption, { color: colors.kicker, fontVariant: ["tabular-nums"], marginLeft: "auto" }]}>{title.length}/160</Text>}
        maxLength={160}
        onChangeText={(value) => {
          setTitle(value);
          form.clearField("title");
        }}
        placeholder="Give the issue a short, clear title"
        required
        value={title}
      />

      <FormInput
        error={form.errors.description}
        label="What happened?"
        labelAccessory={<Text style={[type.caption, { color: colors.kicker, fontVariant: ["tabular-nums"], marginLeft: "auto" }]}>{description.length}/1000</Text>}
        maxLength={1000}
        multiline
        onChangeText={(value) => {
          setDescription(value);
          form.clearField("description");
        }}
        placeholder="Describe the issue and include any useful details."
        required
        value={description}
      />

      <PhotoAttachmentSection
        onOpenCamera={openCamera}
        onPickFromDevice={pickFromDevice}
        onRemovePhoto={(photoId) => setPhotos((current) => current.filter((photo) => photo.id !== photoId))}
        photos={photos}
        uploadProgress={uploadProgress}
      />


      {categoryPickerOpen ? (
        <CategoryPickerSheet
          onClose={() => setCategoryPickerOpen(false)}
          onSelect={(value) => {
            setCategory(value);
            setCategoryPickerOpen(false);
            setError(null);
            form.clearField("category");
          }}
          value={category}
        />
      ) : null}

      {form.serverError ? (
        <AlertModal message={form.serverError} onClose={form.dismissServerError} />
      ) : null}
    </ScreenScrollView>

      {/* Create concern, a fixed footer (user, 2026-11-11). */}
      <PinnedFooter>
        <View style={{ flexDirection: "row" }}>
          <ActionButton disabled={busy || form.blocked} label={busy ? "Creating…" : "Create concern"} onPress={() => void submitConcern()} />
        </View>
      </PinnedFooter>
    </View>
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
        gap: spacing.sm,
      }}
    >
      <Text style={[type.label, { color: colors.muted }]}>
        Add photos ({photos.length}/{MAX_LOCAL_PHOTOS})
      </Text>

      <View
        style={{
          flexDirection: "row",
          gap: spacing.sm,
          paddingTop: spacing.xs,
        }}
      >
        <PhotoActionButton icon={ImagePlus} label="Gallery" onPress={onPickFromDevice} />
        <PhotoActionButton icon={Camera} label="Take a photo" onPress={onOpenCamera} />
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
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radii.card,
                borderWidth: 1,
                width: 92,
                ...cardShadow(colors.shadow),
              }}
            >
              <Image
                source={{ uri: photo.uri }}
                style={{ backgroundColor: colors.neutralSoft, borderTopLeftRadius: radii.card - 1, borderTopRightRadius: radii.card - 1, height: 72, width: "100%" }}
              />
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", padding: 6 }}>
                <FitText numberOfLines={1} style={[type.body, { color: colors.muted, flex: 1, fontSize: 10 }]}>
                  {photo.name}
                </FitText>
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
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      // Grey fill, no border, ink label: a file picker's button (user, 2026-10-28).
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderRadius: 12,
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
          backgroundColor: colors.surface,
          borderRadius: 999,
          height: 30,
          justifyContent: "center",
          width: 30,
        }}
      >
        <Icon color={colors.ink} size={15} strokeWidth={2.3} />
      </View>
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function CategoryPickerField({
  error = false,
  onPress,
  value,
}: {
  error?: boolean;
  onPress: () => void;
  value: ConcernCategory | null;
}) {
  const { colors, fonts, type } = useTheme();
  const selected = CONCERN_CATEGORY_OPTIONS.find((option) => option.value === value)
    ?? { label: "Select category", subtitle: "Pick the closest match", value: null };

  return (
    <AnimatedPressable
      accessibilityLabel={`Concern category, ${selected.label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: error ? colors.danger : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        minHeight: 72,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderColor: colors.borderStrong,
          borderWidth: 1,
          borderRadius: 999,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        <MessageSquareWarning color={colors.ink} size={20} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <FitText
          numberOfLines={1}
          style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17 }}
        >
          {selected.label}
        </FitText>
        <FitText numberOfLines={1} style={[type.caption, { color: colors.kicker }]}>
          {selected.subtitle}
        </FitText>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: 999,
          height: 32,
          justifyContent: "center",
          width: 32,
        }}
      >
        <ChevronDown color={colors.ink} size={16} strokeWidth={2.2} />
      </View>
    </AnimatedPressable>
  );
}

function CategoryPickerSheet({
  onClose,
  onSelect,
  value,
}: {
  onClose: () => void;
  onSelect: (value: ConcernCategory) => void;
  value: ConcernCategory | null;
}) {
  const { colors, type } = useTheme();

  return (
    // The list straight under the title (user, 2026-11-11), like the floor picker.
    <SheetShell
      animated
      belowRule={(
        <Text style={[type.caption, { color: colors.muted, fontSize: 12.5, lineHeight: 17 }]}>
          Select the closest match. You can explain the full issue in the details section.
        </Text>
      )}
      onClose={onClose}
      size="content"
      title="Select category"
    >
      <View>
        {CONCERN_CATEGORY_OPTIONS.map((option) => (
          <PickerOptionRow
            key={option.value}
            label={option.label}
            onPress={() => onSelect(option.value)}
            selected={option.value === value}
            subtitle={option.subtitle}
          />
        ))}
      </View>
    </SheetShell>
  );
}

