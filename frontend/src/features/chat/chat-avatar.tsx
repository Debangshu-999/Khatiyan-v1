import { Image, Text, View } from "react-native";
import { PropertyIcon } from "@/components/property-icon";

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
  /** A property rather than a person: marked with a building rather than initials. */
  team?: boolean;
}) {
  const { colors } = useTheme();

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
        <PropertyIcon color={colors.primary} size={size * 0.48} strokeWidth={2.2} />
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
