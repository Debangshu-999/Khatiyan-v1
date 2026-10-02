import { useMemo, useRef } from "react";
import { PanResponder } from "react-native";

/** How far a swipe must travel, sideways, to change section. */
const SWIPE_DISTANCE = 56;

/**
 * Swiping sideways to move between a screen's sections, the way its pills do
 * (user, 2026-10-02): left for the next, right for the previous.
 *
 * <p>Claims the gesture only once it is clearly sideways (well over twice as
 * much horizontal travel as vertical), so the list's own vertical scroll keeps
 * every gesture that is mostly up or down.
 *
 * @param order    the sections in pill order; ones not shown should be left out.
 * @param current  the section showing.
 * @param onChange moves to a section, with the side it should arrive from.
 */
export function useSectionSwipe<T extends string>(
  order: T[],
  current: T,
  onChange: (next: T, from: "left" | "right") => void,
) {
  // Read at release time, so the responder is built once and never stale.
  const latest = useRef({ current, onChange, order });
  latest.current = { current, onChange, order };

  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2.2,
        onPanResponderRelease: (_event, gesture) => {
          const { current: showing, onChange: change, order: sections } = latest.current;
          const at = sections.indexOf(showing);
          if (at < 0 || Math.abs(gesture.dx) < SWIPE_DISTANCE) return;
          if (gesture.dx < 0 && at < sections.length - 1) change(sections[at + 1], "right");
          if (gesture.dx > 0 && at > 0) change(sections[at - 1], "left");
        },
        onPanResponderTerminationRequest: () => true,
      }).panHandlers,
    [],
  );
}

/** The side a section arrives from when moving between two of them. */
export function arrivalSide<T>(order: T[], from: T, to: T): "left" | "right" {
  return order.indexOf(to) >= order.indexOf(from) ? "right" : "left";
}
