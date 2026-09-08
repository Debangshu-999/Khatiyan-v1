import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/theme/use-theme";

/**
 * The wash behind a screen whose header carries an illustration.
 *
 * <p>
 * <b>The rule:</b> a screen with a header asset gets this gradient; a screen
 * without one is flat white. The tint is there to give the artwork a ground to
 * sit on — without it an illustration floats on white with nothing holding it
 * to the heading — so a screen with no artwork has nothing for it to do, and
 * the wash reads as a stray colour at the top of the page.
 *
 * <p>
 * Shared because it was copied inline into every screen that wanted it, which
 * is how the height and the stop positions started to differ between them.
 */
export function HeaderGradient({ height = 260 }: { height?: number }) {
  const { colors } = useTheme();

  return (
    <View style={{ backgroundColor: colors.surface, flex: 1 }}>
      <LinearGradient
        colors={[colors.primarySoft, colors.surface]}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        style={{ height }}
      />
    </View>
  );
}
