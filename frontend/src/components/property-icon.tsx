import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { LucideProps } from "lucide-react-native";

/**
 * The app's property mark: a house beside a tall building.
 *
 * <p>Material's `home-city-outline`. It says what the old hand-drawn SVG said —
 * the estate this app manages runs from a converted house to a block of floors —
 * but as a finished glyph, where the drawn one lost its window rows at the small
 * sizes it is mostly used at. Outline, so it sits with lucide's outline icons.
 * Used everywhere a property is named: the selector, the dashboard, the tabs,
 * the account row, chat avatars.
 *
 * <p>Takes `LucideProps` so it is a drop-in wherever a lucide icon was passed as
 * a component — several screens hold these in a `Record<..., ComponentType>`,
 * which is how the owner module list and the tab bar pass their icons. Stroke
 * width has no meaning for a font glyph and is ignored.
 */
export function PropertyIcon({ color = "currentColor", size = 24 }: LucideProps) {
  return <MaterialCommunityIcons color={color} name="home-city-outline" size={Number(size)} />;
}
