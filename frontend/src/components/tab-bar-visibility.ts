import { useEffect, useSyncExternalStore } from "react";

let hiders = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function change(by: number) {
  hiders += by;
  listeners.forEach((listener) => listener());
}

/** Takes the app's bottom tabs away while something inside a tab fills the screen (user, 2026-11-02). */
export function useHideTabBar(hidden: boolean) {
  useEffect(() => {
    if (!hidden) return;
    change(1);
    return () => change(-1);
  }, [hidden]);
}

export function useTabBarHidden() {
  return useSyncExternalStore(subscribe, () => hiders > 0, () => false);
}
