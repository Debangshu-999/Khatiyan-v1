import { Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AnimatedPressable } from "@/components/animated-pressable";
import { useTheme } from "@/theme/use-theme";

/**
 * Opens a property's address in the phone's maps app.
 *
 * <p>
 * Written once and used on both sides of the app: the discovery listing, where
 * somebody is deciding whether to visit, and the tenant's own stay, where they
 * are getting home. Two copies of this drifted apart once already — one was a
 * bare glyph, the other did not exist.
 *
 * <p>
 * <b>A pale blue fill, no border.</b> Two standing rules bend here, both on
 * purpose and both at the user's direction: icons are normally an outlined
 * container with an ink glyph, and `primarySoft` is otherwise barred as a
 * background anywhere in the app. This is the only control on a card of text —
 * outlined it read as a border drawn around nothing, and filled solid it
 * shouted over the address it belongs to.
 */
export function DirectionsButton({
  parts,
  url,
}: {
  /**
   * The destination address, street to pincode. Blanks are dropped, so a caller
   * can pass whatever its own data happens to hold.
   *
   * <p>Not the property's NAME. The server's own builder
   * (`DiscoveryGeoSupport.propertyDirectionsUrl`) uses address through pincode
   * and nothing else — a PG's name is rarely a place Maps knows, and leading
   * with one can move the geocode off the address underneath it.
   */
  parts: (string | null | undefined)[];
  /** A stored directions link, when the listing carries one. Preferred. */
  url?: string | null;
}) {
  const { colors } = useTheme();

  function open() {
    if (url) {
      void Linking.openURL(url);
      return;
    }

    // dir, not search. The search endpoint drops the reader on the place card
    // and leaves them to press Directions themselves — which is what this
    // button was for. This is the same URL the server stamps into
    // `directionsUrl`, so both paths land on the same screen.
    const destination = encodeURIComponent(parts.filter(Boolean).join(", "));
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  }

  return (
    <AnimatedPressable
      accessibilityLabel="Open directions"
      accessibilityRole="button"
      hitSlop={8}
      onPress={open}
      // The app's icon-button footprint — 36pt, fully rounded — with a tinted
      // ground instead of a hairline. The glyph stays small inside it: the
      // ground is what makes the target readable, so the mark does not also
      // have to fill it.
      style={{
        alignItems: "center",
        backgroundColor: colors.primarySoft,
        borderRadius: 18,
        height: 36,
        justifyContent: "center",
        width: 36,
      }}
    >
      <MaterialCommunityIcons color={colors.primary} name="directions" size={18} />
    </AnimatedPressable>
  );
}
