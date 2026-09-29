import { useEffect, useState } from "react";

/**
 * When sending a cash-payment code will next be accepted.
 *
 * <p>Module state rather than component state, on purpose. The server refuses
 * a code for up to an hour once its limits are hit, and a block kept
 * in the payment sheet vanished the moment the sheet closed — reopening it, or
 * switching to UPI and back to Cash, offered a Save button the server was
 * certain to refuse. Kept here it lasts for the app session, which is as long
 * as anyone would be standing at the door with the money.
 *
 * <p>Keyed by what the server limits on. The per-number limit and the resend
 * cooldown follow the TENANT, so every bill of theirs is blocked together; the
 * per-device limit follows this phone, so every tenant is.
 */
const blockedUntil = new Map<string, number>();
const listeners = new Set<() => void>();

const DEVICE_KEY = "device";
const tenancyKey = (tenancyId: string) => `tenancy:${tenancyId}`;

/**
 * Records a refusal. `seconds` is the server's own figure, so the countdown
 * ends when a new code would actually be accepted.
 */
export function blockCashCodes(tenancyId: string, seconds: number, wholeDevice: boolean) {
  const key = wholeDevice ? DEVICE_KEY : tenancyKey(tenancyId);
  const until = Date.now() + seconds * 1000;
  blockedUntil.set(key, Math.max(blockedUntil.get(key) ?? 0, until));
  listeners.forEach((refresh) => refresh());
}

function secondsLeft(tenancyId: string) {
  const until = Math.max(
    blockedUntil.get(tenancyKey(tenancyId)) ?? 0,
    blockedUntil.get(DEVICE_KEY) ?? 0,
  );
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

/**
 * Seconds until a cash code can be sent for this tenancy, counting down live.
 *
 * <p>Ticks only while blocked: the payment sheet is a large form, and
 * re-rendering it every second for a timer showing zero would be waste.
 */
export function useCashCodeWait(tenancyId: string): number {
  const [left, setLeft] = useState(() => secondsLeft(tenancyId));

  useEffect(() => {
    const refresh = () => setLeft(secondsLeft(tenancyId));
    refresh();
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [tenancyId]);

  useEffect(() => {
    if (left <= 0) {
      return;
    }
    const timer = setTimeout(() => setLeft(secondsLeft(tenancyId)), 1000);
    return () => clearTimeout(timer);
  }, [left, tenancyId]);

  return left;
}

/** "14:32", or "0:45" under a minute — a wait read at a glance, not worked out. */
export function waitClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}
