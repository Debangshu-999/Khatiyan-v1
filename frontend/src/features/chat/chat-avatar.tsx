import { Image, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useIsSkeleton } from "@/components/skeletons/boundary";
import { Skeleton } from "@/components/skeletons/primitives";

import { initialsOf } from "@/features/chat/chat-time";
import { useTheme } from "@/theme/use-theme";

/**
 * Somebody's face, or their initials.
 *
 * <p>Photos are rare — uploading one is declared but not wired — so initials are
 * the case to get right rather than the fallback to tolerate. The circle is
 * drawn either way, so a run of rows keeps its rhythm whether or not anyone has
 * a picture.
 */
export function ChatAvatar({
  name,
  photoUrl,
  size = 40,
  team,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  /**
   * The property's management team rather than a person: marked as a group.
   *
   * <p>A group glyph rather than a building. The tenant is writing to whoever
   * manages the place, several people behind one thread, and a building read
   * as "the property" instead of "the people you are talking to".
   */
  team?: boolean;
}) {
  const { colors } = useTheme();
  const isSkeleton = useIsSkeleton();

  // A plain disc while a list is loading, so sample names never show as initials.
  if (isSkeleton) {
    return <Skeleton height={size} radius={999} width={size} />;
  }

  if (team) {
    return (
      <View
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderRadius: 999,
          borderWidth: 1,
          height: size,
          justifyContent: "center",
          width: size,
        }}
      >
        <MaterialCommunityIcons color={colors.primary} name="account-group" size={Math.round(size * 0.52)} />
      </View>
    );
  }

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{
          backgroundColor: colors.surfaceSunken,
          borderRadius: 999,
          height: size,
          width: size,
        }}
      />
    );
  }

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderRadius: 999,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Text style={{ color: colors.inkSoft, fontSize: size * 0.32, fontWeight: "700" }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}
