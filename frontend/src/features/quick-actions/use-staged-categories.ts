import { startTransition, useEffect, useState } from "react";

/**
 * Commit the lightweight screen/skeleton first, then mount one category per
 * frame instead of every icon and pressable during the opening transition.
 * Also runs during route prefetch, so a warmed screen is ready before the tap.
 */
export function useStagedCategories(total: number, enabled: boolean) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    if (!enabled || visible >= total) return;
    const frame = requestAnimationFrame(() => {
      startTransition(() => setVisible((current) => Math.min(current + 1, total)));
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, total, visible]);
  return Math.min(visible, total);
}
