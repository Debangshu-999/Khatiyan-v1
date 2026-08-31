import { Image, Text, View } from "react-native";
import { Pencil, Plus, Star, Trash2 } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The photo list, shared by registration and edit-property.
 *
 * <p>Insert area on top, photos stacked under it — the shape the notice
 * attachments use. A wrap of square tiles left a caption nowhere to go but under
 * a 104px thumbnail, where it truncated after two words; a row gives it the
 * whole width beside the picture.
 *
 * <p>Presentational only, because the two callers store photos in different
 * places: edit-property writes each change to the server as it happens, while
 * registration holds uploaded URLs in memory until the property it would attach
 * them to exists. Same list, two owners.
 */
export function AddPhotoTarget({
  busy,
  hint = "Choose from your gallery",
  label = "Add listing photo",
  onPress,
}: {
  busy?: boolean;
  /** The line under the label — what pressing it actually does. */
  hint?: string;
  label?: string;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel="Add a listing photo"
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={{
        alignItems: "center",
        // A dashed hairline in the lightest grey read as a disabled placeholder
        // rather than the one thing on the section you are meant to press —
        // which matters most where photos are optional, since a target that
        // looks switched off is a target nobody tries.
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 16,
        borderStyle: "dashed",
        borderWidth: 1.5,
        gap: spacing.sm,
        justifyContent: "center",
        opacity: busy ? 0.5 : 1,
        paddingVertical: spacing.xl,
        width: "100%",
      }}
    >
      {/* Outlined container, ink glyph — the app's icon rule. A filled disc is
          reserved for status, and this is an action. */}
      <View
        style={{
          alignItems: "center",
          borderColor: colors.ink,
          borderRadius: 999,
          borderWidth: 1.5,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <Plus color={colors.ink} size={19} strokeWidth={2.6} />
      </View>

      <View style={{ alignItems: "center", gap: 1 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{label}</Text>
        <Text style={[type.caption, { color: colors.muted }]}>{hint}</Text>
      </View>
    </AnimatedPressable>
  );
}

export function UploadProgress({ progress }: { progress: { completed: number; total: number } | null }) {
  const { colors, type } = useTheme();

  if (!progress) {
    return null;
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]}>
        Uploading {Math.min(progress.completed + 1, progress.total)} of {progress.total}…
      </Text>
      <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 4, overflow: "hidden" }}>
        <View
          style={{
            backgroundColor: colors.ink,
            height: 4,
            width: `${Math.round((progress.completed / Math.max(progress.total, 1)) * 100)}%`,
          }}
        />
      </View>
    </View>
  );
}

/**
 * One photo: the picture, what it is of, and the things you can do to it.
 *
 * <p>The caption gets the row's width rather than a line under a square tile,
 * which is the whole reason this is a list and not a grid.
 *
 * <p>`onEditCaption` is optional because captions do not exist until the
 * property does — the create endpoint takes a URL and an id and nothing else —
 * so during registration the pencil would open a sheet whose answer had nowhere
 * to be saved.
 */
export function PhotoRow({
  busy,
  cover,
  muted,
  onEditCaption,
  onMakeCover,
  onRemove,
  title,
  uri,
}: {
  busy?: boolean;
  cover: boolean;
  /** Renders the title in the placeholder grey, for "No caption" and the like. */
  muted?: boolean;
  onEditCaption?: () => void;
  onMakeCover: () => void;
  onRemove: () => void;
  title: string;
  uri: string;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.sm,
      }}
    >
      {/* The star sits ON the photo: it is a property of that picture, and in
          the action row it read as a third button rather than as this photo's
          state. Solid ground under it, because it lies over a photograph that
          could be any colour. */}
      <View style={{ height: 64, width: 64 }}>
        <Image
          resizeMode="cover"
          source={{ uri }}
          style={{ backgroundColor: colors.surfaceSunken, borderRadius: 10, height: 64, width: 64 }}
        />
        <AnimatedPressable
          accessibilityLabel={cover ? "This is the cover photo" : "Make this the cover photo"}
          accessibilityRole="button"
          accessibilityState={{ selected: cover }}
          disabled={busy || cover}
          hitSlop={6}
          onPress={onMakeCover}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 999,
            borderWidth: 1,
            height: 24,
            justifyContent: "center",
            left: 3,
            opacity: busy && !cover ? 0.5 : 1,
            position: "absolute",
            top: 3,
            width: 24,
          }}
        >
          <Star
            color={cover ? colors.warning : colors.ink}
            fill={cover ? colors.warning : "transparent"}
            size={13}
            strokeWidth={2.4}
          />
        </AnimatedPressable>
      </View>

      {/* No "Cover photo" line: the filled star on the picture already says it,
          and a label repeating a mark right beside it is the same fact twice. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ color: muted ? colors.kicker : colors.ink, fontWeight: "700" }}>
          {title}
        </Text>
      </View>

      {/* Tighter than the row gap: these are actions on the same photo, and
          spaced like the caption beside them they read as unrelated things. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: 2 }}>
        {onEditCaption ? (
          <AnimatedPressable
            accessibilityLabel="Edit this photo's caption"
            accessibilityRole="button"
            disabled={busy}
            hitSlop={6}
            onPress={onEditCaption}
            style={{ alignItems: "center", height: 36, justifyContent: "center", opacity: busy ? 0.5 : 1, width: 36 }}
          >
            <Pencil color={colors.primary} size={17} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}

        <AnimatedPressable
          accessibilityLabel="Remove this photo"
          accessibilityRole="button"
          disabled={busy}
          hitSlop={8}
          onPress={onRemove}
          style={{ alignItems: "center", height: 36, justifyContent: "center", opacity: busy ? 0.5 : 1, width: 36 }}
        >
          <Trash2 color={colors.danger} size={18} strokeWidth={2.2} />
        </AnimatedPressable>
      </View>
    </View>
  );
}
