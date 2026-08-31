import Svg, { Circle, Ellipse, Line, Path, Rect } from "react-native-svg";

import type { RoomAmenity } from "@/store/services/property-api";

/**
 * Drawn here rather than taken from the icon set.
 *
 * <p>Lucide has a television and a wall vent and nothing else on this list: no
 * cupboard, no geyser, no toilet, no folded bedding. Substituting its nearest
 * neighbours is how the cupboard ended up as a shirt. Six hand-drawn glyphs on
 * one grid at one stroke weight read as a set; four borrowed ones and two
 * approximations do not.
 *
 * <p>They ride on `react-native-svg`, which is already a direct dependency —
 * lucide itself renders through it — so nothing new is loaded into Expo Go.
 */
export type AmenityIconProps = {
  color: string;
  size?: number;
};

const STROKE = 1.7;

/** Shared frame: one 24-unit grid, so every glyph sits at the same weight. */
function Glyph({ children, color, size = 20 }: AmenityIconProps & { children: React.ReactNode }) {
  return (
    <Svg
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={STROKE}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </Svg>
  );
}

/** Two doors, a shelf across the top, and a handle either side of the seam. */
export function CupboardIcon(props: AmenityIconProps) {
  return (
    <Glyph {...props}>
      <Rect height={18} rx={1.5} width={16} x={4} y={3} />
      <Line x1={4} x2={20} y1={7.5} y2={7.5} />
      <Line x1={12} x2={12} y1={7.5} y2={21} />
      <Line x1={10.6} x2={10.6} y1={12} y2={15} />
      <Line x1={13.4} x2={13.4} y1={12} y2={15} />
    </Glyph>
  );
}

/** A screen on a stand. */
export function TelevisionIcon(props: AmenityIconProps) {
  return (
    <Glyph {...props}>
      <Rect height={12} rx={2} width={18} x={3} y={4} />
      <Line x1={12} x2={12} y1={16} y2={19} />
      <Line x1={8} x2={16} y1={19.5} y2={19.5} />
    </Glyph>
  );
}

/**
 * A wall unit with its louvre and the air coming off it.
 *
 * <p>The snowflake matters: without it a box with three strokes under it is a
 * vent, which is what it means in every other icon set.
 */
export function AirConditionerIcon(props: AmenityIconProps) {
  return (
    <Glyph {...props}>
      <Rect height={7} rx={1.5} width={18} x={3} y={4} />
      <Line x1={5.5} x2={18.5} y1={8.5} y2={8.5} />
      <Line x1={12} x2={12} y1={13} y2={19} />
      <Line x1={9.4} x2={14.6} y1={14.5} y2={17.5} />
      <Line x1={14.6} x2={9.4} y1={14.5} y2={17.5} />
    </Glyph>
  );
}

/** A storage water heater: tank, top band, dial, and the outlet on its side. */
export function GeyserIcon(props: AmenityIconProps) {
  return (
    <Glyph {...props}>
      <Rect height={17} rx={3.5} width={11} x={5} y={3} />
      <Line x1={5} x2={16} y1={7.5} y2={7.5} />
      <Circle cx={10.5} cy={13} r={2} />
      <Path d="M16 11.5h3.5V15" />
    </Glyph>
  );
}

/**
 * Seen from the front: cistern, seat, pedestal, floor.
 *
 * <p>Drawn face-on because the side profile did not survive being small — a
 * tapering bowl over a stem reads as a wine glass at 20px, which is a bad thing
 * to put next to "attached".
 */
export function ToiletIcon(props: AmenityIconProps) {
  return (
    <Glyph {...props}>
      <Rect height={4.5} rx={1} width={8} x={8} y={2.5} />
      <Line x1={12} x2={12} y1={7} y2={8.6} />
      <Ellipse cx={12} cy={12.4} rx={5.4} ry={3.8} />
      <Path d="M7.6 15.1 6.6 20.4h10.8l-1-5.3" />
      <Line x1={5.6} x2={18.4} y1={20.8} y2={20.8} />
    </Glyph>
  );
}

/**
 * A folded stack: mattress, sheet, blanket.
 *
 * <p>Three separated bars, not one box with two lines through it — that is a
 * list icon, and it read as one.
 */
export function BeddingIcon(props: AmenityIconProps) {
  return (
    <Glyph {...props}>
      <Rect height={4} rx={2} width={16} x={4} y={5.5} />
      <Rect height={4} rx={2} width={16} x={4} y={10.5} />
      <Rect height={4} rx={2} width={16} x={4} y={15.5} />
    </Glyph>
  );
}

export const ROOM_AMENITY_ICONS: Record<RoomAmenity, (props: AmenityIconProps) => React.ReactElement> = {
  ATTACHED_TOILET: ToiletIcon,
  BEDDING: BeddingIcon,
  CUPBOARD: CupboardIcon,
  GEYSER: GeyserIcon,
  TV: TelevisionIcon,
};
