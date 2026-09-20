import { ActivityIndicator, Image, View, type ImageStyle, type StyleProp } from "react-native";

import { useTheme } from "@/theme/use-theme";

const LOGO_LIGHT = require("../../assets/brand/logo-light-trimmed.png");
const LOGO_DARK = require("../../assets/brand/logo-dark-trimmed.png");

/**
 * The logo artwork's own background colours, sampled from the files.
 *
 * <p>The logo is a flat image with its background baked in, so anything that
 * frames it (the loading screen, the tile on the auth banner) paints exactly
 * this colour or the edge of the image shows. The native splash in `app.json`
 * uses the same two values, which is what makes the hand-off from the splash to
 * the loading screen invisible.
 */
export const BRAND_LOGO_BACKGROUND = { dark: "#0A0E14", light: "#FEFEFE" } as const;

/**
 * Sized so the logo lands where the native splash drew it: the splash image is
 * 200dp including the artwork's empty margin, this file's artwork is trimmed, so
 * the logo itself comes out the same size and the hand-off does not jump.
 */
const LOADING_LOGO_SIZE = 156;

/** The full Khatiyan logo, light or dark to match the app's theme. */
export function BrandLogo({ size, style }: { size: number; style?: StyleProp<ImageStyle> }) {
  const { isDark } = useTheme();

  return (
    <Image
      accessibilityLabel="Khatiyan"
      accessibilityRole="image"
      resizeMode="contain"
      source={isDark ? LOGO_DARK : LOGO_LIGHT}
      style={[{ height: size, width: size }, style]}
    />
  );
}

/**
 * The one screen the app shows while it is waiting to know where to go: on
 * launch, and between signing in and the home screen.
 *
 * <p>Every wait uses this, not a bare spinner. Launch, account select and the
 * tabs layout each wait in turn, and when each drew its own blank background
 * with a spinner, signing in went through a run of empty white screens. With
 * the same logo in the same place they read as one continuous screen.
 */
export function BrandLoadingScreen() {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: isDark ? BRAND_LOGO_BACKGROUND.dark : BRAND_LOGO_BACKGROUND.light,
        flex: 1,
        justifyContent: "center",
      }}
    >
      <BrandLogo size={LOADING_LOGO_SIZE} />
      {/* Out of the layout flow, so the logo stays dead centre like the splash. */}
      <ActivityIndicator color={colors.primary} style={{ bottom: "22%", position: "absolute" }} />
    </View>
  );
}
