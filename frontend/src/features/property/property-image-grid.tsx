import { Image, Text, View } from "react-native";
import { Plus, Star, Trash2 } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type GalleryTile = {
  /** Stable key. A server image id, or the storage handle before attaching. */
  key: string;
  uri: string;
  /** Only the stored gallery knows its cover; a freshly picked list uses index 0. */
  cover: boolean;
};

/**
 * The tile grid both image editors share.
 *
 * <p>Presentation only — it owns no state and performs no upload. Both callers
 * upload as images are picked, but they differ in what removal means:
 * registration drops an entry it has not attached to anything yet, while the
 * edit modal deletes a row from a live listing. Same tiles, different verbs.
 */
export function PropertyImageGrid({
  busy,
  max,
  onAdd,
  onMakeCover,
  onRemove,
  progress,
  tiles,
}: {
  busy?: boolean;
  max: number;
  /** Batch upload position, e.g. {completed: 3, total: 10}. */
  progress?: { completed: number; total: number } | null;
  onAdd: () => void;
  /** Omitted during registration, where the first picked image is simply the cover. */
  onMakeCover?: (tile: GalleryTile) => void;
  onRemove: (tile: GalleryTile) => void;
  tiles: GalleryTile[];
}) {
  const { colors, fonts, type } = useTheme();
  const full = tiles.length >= max;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {tiles.map((tile) => (
          <View
            key={tile.key}
            style={{
              borderColor: tile.cover ? colors.ink : colors.border,
              borderCurve: "continuous",
              borderRadius: 14,
              // The cover is marked by a heavier border and a label, not a
              // coloured tile — same rule as everywhere else in the app.
              borderWidth: tile.cover ? 2 : 1,
              height: 104,
              overflow: "hidden",
              width: 104,
            }}
          >
            <Image source={{ uri: tile.uri }} style={{ height: "100%", width: "100%" }} />

            {tile.cover ? (
              <View
                style={{
                  backgroundColor: colors.ink,
                  bottom: 0,
                  left: 0,
                  paddingVertical: 3,
                  position: "absolute",
                  right: 0,
                }}
              >
                <Text
                  style={{ color: colors.surface, fontFamily: fonts.sansBold, fontSize: 10, textAlign: "center" }}
                >
                  COVER
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 4, position: "absolute", right: 4, top: 4 }}>
              {onMakeCover && !tile.cover ? (
                <TileButton
                  disabled={busy}
                  label="Make cover"
                  onPress={() => onMakeCover(tile)}
                >
                  <Star color={colors.ink} size={13} strokeWidth={2.4} />
                </TileButton>
              ) : null}
              <TileButton disabled={busy} label="Remove image" onPress={() => onRemove(tile)}>
                <Trash2 color={colors.danger} size={13} strokeWidth={2.4} />
              </TileButton>
            </View>
          </View>
        ))}

        {!full ? (
          <AnimatedPressable
            accessibilityLabel="Add image"
            accessibilityRole="button"
            disabled={busy}
            onPress={onAdd}
            style={{
              alignItems: "center",
              borderColor: colors.borderStrong,
              borderCurve: "continuous",
              borderRadius: 14,
              borderStyle: "dashed",
              borderWidth: 1,
              gap: 4,
              height: 104,
              justifyContent: "center",
              opacity: busy ? 0.5 : 1,
              width: 104,
            }}
          >
            <Plus color={colors.kicker} size={20} strokeWidth={2.2} />
            <Text style={[type.caption, { color: colors.kicker }]}>Add</Text>
          </AnimatedPressable>
        ) : null}
      </View>

      {progress ? (
        <View style={{ gap: 6 }}>
          <Text style={[type.caption, { color: colors.ink, fontFamily: fonts.sansBold }]}>
            Uploading {Math.min(progress.completed + 1, progress.total)} of {progress.total}…
          </Text>
          {/* A determinate bar, because the count is known. A spinner here would
              say "something is happening" when we can say how much is left. */}
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
      ) : (
        <Text style={[type.caption, { color: colors.muted }]}>
          {tiles.length} of {max} · the cover is the photo people see first in search.
        </Text>
      )}
    </View>
  );
}

function TileButton({
  children,
  disabled,
  label,
  onPress,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        alignItems: "center",
        // Solid, not translucent: these sit on top of a photograph and need to
        // stay legible whatever is behind them.
        backgroundColor: colors.surface,
        borderRadius: 8,
        height: 24,
        justifyContent: "center",
        width: 24,
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
