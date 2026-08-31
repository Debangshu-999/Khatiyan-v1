import Svg, { Path } from "react-native-svg";
import type { LucideProps } from "lucide-react-native";

/**
 * The app's property mark: an apartment block beside a house.
 *
 * <p>Drawn here rather than taken from the icon set. Lucide's `Building2` is an
 * office tower, and a PG is neither an office nor only a tower — the estate this
 * app manages runs from a four-storey block to a converted house, and the mark
 * has to cover both. One glyph, used everywhere a property is named: the
 * selector, the dashboard snapshot, the floor picker, the account row.
 *
 * <p>Takes `LucideProps` so it is a drop-in wherever a lucide icon was passed as
 * a component — several screens hold these in a `Record<..., ComponentType>`,
 * which is how the owner module list and the tab bar pass their icons.
 */

/**
 * Thinner than the lucide default of 2.
 *
 * <p>This mark carries two buildings and six window dashes where a lucide icon
 * carries three or four strokes, so the same weight reads much heavier — at the
 * sizes it is used, a 2px stroke closed the gaps between the windows and turned
 * the tower into a block.
 */
const DEFAULT_STROKE = 1.6;

export function PropertyIcon({ color = "currentColor", size = 24, strokeWidth = DEFAULT_STROKE }: LucideProps) {
  return (
    <Svg
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {/* The block's roof cap, then its body — open on the right, where the
          house overlaps it. */}
      <Path d="M6.2 6.4V4.9L10 3.4l3.8 1.5v1.5" />
      <Path d="M13.8 11.2V6.4H3.9v14.2h5.3" />

      {/* Three rows of windows, not the five the reference draws. Dashes at
          2.7px apart merged into a solid block at the 18-26px this is actually
          used at — the tower has to read by the RHYTHM of its rows, and three
          well-spaced ones say "many floors" where seven crowded ones say
          "smudge". */}
      <Path d="M6 9.6h2.2M10.2 9.6h2.2M6 13.1h2.2M10.2 13.1h2.2M6 16.6h2.2M10.2 16.6h2.2" />

      {/* The house: a wide roof over two walls, with its door. */}
      <Path d="M10.9 14.3 15.9 12l5 2.3" />
      <Path d="M12.2 15.9v4.7h7.5v-4.7" />
      <Path d="M14.6 20.6v-3h2.7v3" />
    </Svg>
  );
}
