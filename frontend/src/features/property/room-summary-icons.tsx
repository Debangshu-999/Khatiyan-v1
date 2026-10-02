import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Path } from "react-native-svg";
import type { LucideProps } from "lucide-react-native";

/**
 * Room-stat glyphs shared by the Rooms & beds summary and the Manage tab
 * tiles, so the same fact carries the same mark on both screens.
 *
 * <p>Take `LucideProps` so they drop in wherever a lucide icon is passed.
 */

/** "Rooms": an open door. */
export function RoomsSummaryIcon({ color, size = 22 }: LucideProps) {
  return <MaterialCommunityIcons name="door-open" color={color as string} size={Number(size)} />;
}

/** "In service" / vacancy: a door standing open in its frame. */
export function InServiceIcon({ color, size = 22 }: LucideProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color as string} d="M5 3h8v2H7v15h6v2H5V3Zm4 3 10-4v20L9 18V6Z" />
      <Circle cx={12} cy={12} r={1.1} fill="#FFFFFF" />
    </Svg>
  );
}
