import { Pressable } from "react-native";

export type TapSlot = { key: string; x: number; width: number; label: string };

/**
 * Invisible tap targets laid over a chart, one per column or point.
 *
 * <p>Taps live here rather than on the SVG shapes: react-native-svg hands a
 * shape's press handlers to the DOM on web, which rejects them with an "unknown
 * event handler" warning. A plain Pressable works the same on every platform,
 * and a slot the full height of the plot makes a short column as easy to tap as
 * a tall one.
 */
export function TapSlots({ height, onPress, slots, top }: { height: number; onPress: (key: string) => void; slots: TapSlot[]; top: number }) {
  return (
    <>
      {slots.map((slot) => (
        <Pressable
          accessibilityLabel={slot.label}
          accessibilityRole="button"
          key={slot.key}
          onPress={() => onPress(slot.key)}
          style={{ height, left: slot.x, position: "absolute", top, width: slot.width }}
        />
      ))}
    </>
  );
}
