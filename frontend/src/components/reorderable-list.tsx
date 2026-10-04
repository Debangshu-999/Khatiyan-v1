import { useRef, useState, type ReactNode } from "react";
import { PanResponder, View, type GestureResponderHandlers, type PanResponderInstance } from "react-native";

/**
 * A short vertical list whose rows are rearranged by holding a handle and
 * moving it (user, 2026-10-04). Rows may be of different heights.
 *
 * <p>While a row is held it follows the finger, within the list's own length,
 * and the rows it passes step aside to show where it will land. The new order
 * is handed over once, when it is let go.
 *
 * <p>Everything about the drag is ordinary state, drawn through `style`, with
 * no animated values. That is deliberate: when the row is dropped, the new
 * order and the end of the drag reach the screen in one render, so nothing is
 * ever drawn in its new place with its old offset. Seven cards re-rendering as
 * a finger moves is cheap. This is not the tool for a long list.
 *
 * <p>It does not scroll the page for you. Tell the page to stop scrolling
 * while `onDraggingChange` says a row is held.
 */
export function ReorderableList<T>({
  gap,
  items,
  keyOf,
  onDraggingChange,
  onReorder,
  renderItem,
}: {
  gap: number;
  items: T[];
  keyOf: (item: T) => string;
  onDraggingChange?: (dragging: boolean) => void;
  /** The list in its new order, once, when a row is let go somewhere new. */
  onReorder: (items: T[]) => void;
  /** Spread `handle` onto the view the row is moved by. `held` is true for the row in the hand. */
  renderItem: (item: T, handle: GestureResponderHandlers, held: boolean) => ReactNode;
}) {
  const [drag, setDrag] = useState<{ dy: number; from: number; key: string; to: number } | null>(null);
  const heights = useRef(new Map<string, number>()).current;
  const responders = useRef(new Map<string, PanResponderInstance>()).current;
  // The handlers outlive the render they were made in, so they read these.
  const live = useRef({ drag, items, keyOf, onDraggingChange, onReorder });
  live.current = { drag, items, keyOf, onDraggingChange, onReorder };

  const heightAt = (index: number) => {
    const item = live.current.items[index];
    return item === undefined ? 0 : heights.get(live.current.keyOf(item)) ?? 0;
  };

  /**
   * How far the held row may travel: up to the first row's place and down to
   * the last one's, and no further (user, 2026-10-04). It could be carried out
   * of the list altogether, over the heading above it. Nothing broke, but a
   * row has nowhere to land out there.
   */
  function bounded(from: number, dy: number) {
    let above = 0;
    for (let index = 0; index < from; index += 1) {
      above += heightAt(index) + gap;
    }
    let below = 0;
    for (let index = from + 1; index < live.current.items.length; index += 1) {
      below += heightAt(index) + gap;
    }
    return Math.max(-above, Math.min(below, dy));
  }

  /** Where the held row would land, having travelled `dy` from its own place. */
  function landing(from: number, dy: number) {
    let to = from;
    let passed = 0;
    // Down: past the middle of each row below, one after another.
    while (to < live.current.items.length - 1 && dy > passed + (heightAt(to + 1) + gap) / 2) {
      passed += heightAt(to + 1) + gap;
      to += 1;
    }
    if (to !== from) {
      return to;
    }
    // Up: the same, through the rows above.
    while (to > 0 && -dy > passed + (heightAt(to - 1) + gap) / 2) {
      passed += heightAt(to - 1) + gap;
      to -= 1;
    }
    return to;
  }

  function end() {
    const current = live.current.drag;
    if (!current) {
      return;
    }
    setDrag(null);
    live.current.onDraggingChange?.(false);
    if (current.to !== current.from) {
      const next = [...live.current.items];
      const [moved] = next.splice(current.from, 1);
      next.splice(current.to, 0, moved);
      // In the same turn as the end of the drag, so both are drawn together.
      live.current.onReorder(next);
    }
  }

  function responderFor(key: string) {
    const existing = responders.get(key);
    if (existing) {
      return existing;
    }
    const created = PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const from = live.current.items.findIndex((item) => live.current.keyOf(item) === key);
        if (from < 0) {
          return;
        }
        setDrag({ dy: 0, from, key, to: from });
        live.current.onDraggingChange?.(true);
      },
      onPanResponderMove: (_event, gesture) => {
        setDrag((current) => {
          if (!current || current.key !== key) {
            return current;
          }
          const dy = bounded(current.from, gesture.dy);
          return { ...current, dy, to: landing(current.from, dy) };
        });
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
      // The page must not take the gesture back to scroll with it.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onStartShouldSetPanResponder: () => true,
    });
    responders.set(key, created);
    return created;
  }

  const heldHeight = drag ? heights.get(drag.key) ?? 0 : 0;

  return (
    <View style={{ gap }}>
      {items.map((item, index) => {
        const key = keyOf(item);
        const held = drag?.key === key;
        // A row between where the held one came from and where it would land
        // steps into the space it left.
        const aside = !drag || held
          ? 0
          : index > drag.from && index <= drag.to
            ? -(heldHeight + gap)
            : index < drag.from && index >= drag.to
              ? heldHeight + gap
              : 0;
        return (
          <View
            key={key}
            onLayout={(event) => heights.set(key, event.nativeEvent.layout.height)}
            style={{
              // Above the rows it passes over.
              elevation: held ? 8 : 0,
              opacity: held ? 0.96 : 1,
              transform: [{ translateY: held ? drag.dy : aside }],
              zIndex: held ? 1 : 0,
            }}
          >
            {renderItem(item, responderFor(key).panHandlers, held)}
          </View>
        );
      })}
    </View>
  );
}
