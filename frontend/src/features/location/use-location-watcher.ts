import { useEffect, useRef } from "react";
import * as Location from "expo-location";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { updateLocationFrom } from "@/store/slices/location-slice";

/** Moved this far before the place is looked up again. */
const MOVED_METRES = 150;
/** And no sooner than this after the last update. */
const MIN_INTERVAL_MS = 30_000;

/**
 * Keeps the place at the top of Home current as the device moves (user, 2026-11-14:
 * "detect movement"). Once location is granted, it watches the position and looks the
 * place up again only after the device has moved {@link MOVED_METRES}, at most every
 * {@link MIN_INTERVAL_MS}. Nothing runs while standing still, and it stops when Home
 * unmounts. It never asks for permission: the first fetch does that.
 */
export function useLocationWatcher() {
  const dispatch = useAppDispatch();
  const ready = useAppSelector((state) => state.location.status === "ready");
  const last = useRef<{ latitude: number; longitude: number } | null>(null);
  const latitude = useAppSelector((state) => state.location.latitude);
  const longitude = useAppSelector((state) => state.location.longitude);

  // The place on screen is where movement is measured from.
  useEffect(() => {
    if (latitude != null && longitude != null) last.current = { latitude, longitude };
  }, [latitude, longitude]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (cancelled || permission?.status !== "granted") return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: MOVED_METRES, timeInterval: MIN_INTERVAL_MS },
        (position) => {
          const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          if (last.current && metresBetween(last.current, next) < MOVED_METRES) return;
          last.current = next;
          void dispatch(updateLocationFrom(next));
        },
      ).catch(() => null);
      if (cancelled) subscription?.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [dispatch, ready]);
}

/** Straight-line distance on the earth's surface, in metres. */
function metresBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
