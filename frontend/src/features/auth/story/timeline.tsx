import { createContext, useContext, type ReactNode } from "react";
import { G } from "react-native-svg";

/**
 * The sign-in story's clock (user, 2026-11-14): every moving part of a scene is a
 * keyframe track sampled at the scene's time, the way the approved HTML preview
 * used CSS keyframes. The story is drawn at a stop-motion frame rate, so a plain
 * re-render per frame is all the engine there is.
 */

export type Pose = {
  o?: number;
  tx?: number;
  ty?: number;
  s?: number;
  sx?: number;
  r?: number;
};
export type Keyframes = readonly (readonly [number, Pose])[];
export type Track = {
  kf: Keyframes;
  dur: number;
  delay?: number;
  /** A stepped timing per keyframe segment, like CSS steps(n). */
  steps?: number;
  count?: number;
  alternate?: boolean;
  ease?: "linear" | "out" | "inOut";
};

const REST: Required<Pose> = { o: 1, r: 0, s: 1, sx: 1, tx: 0, ty: 0 };
const KEYS = ["o", "tx", "ty", "s", "sx", "r"] as const;

function timing(u: number, track: Track) {
  if (track.steps)
    return Math.min(1, Math.floor(u * track.steps) / track.steps);
  if (track.ease === "out") return 1 - (1 - u) * (1 - u);
  if (track.ease === "inOut")
    return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
  return u;
}

/** Where the track is at `t` ms, held at its first frame before and its last after (fill both). */
export function progressAt(t: number, track: Track) {
  const local = t - (track.delay ?? 0);
  const count = track.count ?? 1;
  if (local <= 0) return 0;
  if (local >= track.dur * count) {
    const whole = Number.isInteger(count);
    const last = whole ? count - 1 : Math.floor(count);
    const within = whole ? 1 : count - Math.floor(count);
    return track.alternate && last % 2 === 1 ? 1 - within : within;
  }
  const iteration = Math.floor(local / track.dur);
  const within = (local - iteration * track.dur) / track.dur;
  return track.alternate && iteration % 2 === 1 ? 1 - within : within;
}

export function sample(t: number, track: Track): Required<Pose> {
  const p = progressAt(t, track);
  const out = { ...REST };
  for (const key of KEYS) {
    const points = track.kf
      .filter(([, pose]) => pose[key] !== undefined)
      .map(([offset, pose]) => [offset, pose[key] as number] as const);
    if (points.length === 0) continue;
    if (points[0][0] > 0) points.unshift([0, REST[key]]);
    if (points[points.length - 1][0] < 1) points.push([1, REST[key]]);
    let i = 0;
    while (i < points.length - 2 && p > points[i + 1][0]) i += 1;
    const [a0, av] = points[i];
    const [a1, bv] = points[i + 1];
    const u = a1 === a0 ? 1 : Math.max(0, Math.min(1, (p - a0) / (a1 - a0)));
    out[key] = av + (bv - av) * timing(u, track);
  }
  return out;
}

export function transformOf(
  pose: Required<Pose>,
  origin: readonly [number, number] = [0, 0],
) {
  const parts: string[] = [];
  if (pose.tx || pose.ty) parts.push(`translate(${pose.tx} ${pose.ty})`);
  if (pose.r || pose.s !== 1 || pose.sx !== 1) {
    const [ox, oy] = origin;
    parts.push(`translate(${ox} ${oy})`);
    if (pose.r) parts.push(`rotate(${pose.r})`);
    if (pose.s !== 1 || pose.sx !== 1)
      parts.push(`scale(${pose.s * pose.sx} ${pose.s})`);
    parts.push(`translate(${-ox} ${-oy})`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

/** The scene's own time, in ms since it came on. */
export const SceneTime = createContext(0);

/** A group moved by one track. Nest two for two tracks. */
export function A({
  children,
  origin,
  track,
}: {
  children: ReactNode;
  origin?: readonly [number, number];
  track?: Track;
}) {
  const t = useContext(SceneTime);
  if (!track) return <G>{children}</G>;
  const pose = sample(t, track);
  return (
    <G opacity={pose.o} transform={transformOf(pose, origin)}>
      {children}
    </G>
  );
}

export const track = (
  kf: Keyframes,
  dur: number,
  delay = 0,
  more: Omit<Track, "kf" | "dur" | "delay"> = {},
): Track => ({ delay, dur, kf, ...more });

/** The preview's keyframes, one for one. */
export const K = {
  bounce: [
    [0, {}],
    [0.4, { s: 1.12, ty: -10 }],
    [1, {}],
  ],
  coinFly: [
    [0, { o: 0, tx: 0, ty: 0 }],
    [0.1, { o: 1 }],
    [0.5, { tx: 104, ty: -96 }],
    [0.88, { o: 1, tx: 206, ty: -78 }],
    [1, { o: 0, tx: 210, ty: -76 }],
  ],
  doorOpen: [
    [0, { sx: 1 }],
    [1, { sx: 0.12 }],
  ],
  drip: [
    [0, { o: 1, ty: 0 }],
    [1, { o: 0, ty: 24 }],
  ],
  dropIn: [
    [0, { o: 0, ty: -46 }],
    [1, { o: 1, ty: 0 }],
  ],
  fadeIn: [
    [0, { o: 0 }],
    [1, { o: 1 }],
  ],
  fadeOut: [
    [0, { o: 1 }],
    [1, { o: 0 }],
  ],
  keyPass: [
    [0, { r: 0, tx: 0, ty: 0 }],
    [0.5, { r: -30, tx: 26, ty: -18 }],
    [1, { r: 0, tx: 53, ty: 0 }],
  ],
  pop: [
    [0, { o: 0, s: 0.3 }],
    [0.6, { o: 1, s: 1.14 }],
    [1, { o: 1, s: 1 }],
  ],
  press: [
    [0, { s: 1 }],
    [0.5, { s: 0.86 }],
    [1, { s: 1 }],
  ],
  raise: [
    [0, { r: 95 }],
    [1, { r: 0 }],
  ],
  ripple: [
    [0, { o: 0.8, s: 0.2 }],
    [1, { o: 0, s: 1.6 }],
  ],
  rise: [
    [0, { ty: 160 }],
    [1, { ty: 0 }],
  ],
  scan: [
    [0, { ty: 0 }],
    [0.5, { ty: 24 }],
    [1, { ty: 0 }],
  ],
  settle: [
    [0, { s: 1 }],
    [0.5, { s: 1.08 }],
    [1, { s: 1 }],
  ],
  shake: [
    [0, {}],
    [0.25, { r: -4, tx: -2, ty: 1 }],
    [0.75, { r: 4, tx: 2, ty: -1 }],
    [1, {}],
  ],
  slideUp: [
    [0, { o: 0, ty: 64 }],
    [1, { o: 1, ty: 0 }],
  ],
  steam: [
    [0, { o: 0, ty: 6 }],
    [0.35, { o: 0.9 }],
    [1, { o: 0, ty: -16 }],
  ],
  stride: [
    [0, { r: 0 }],
    [0.25, { r: 22 }],
    [0.75, { r: -22 }],
    [1, { r: 0 }],
  ],
  strideB: [
    [0, { r: 0 }],
    [0.25, { r: -22 }],
    [0.75, { r: 22 }],
    [1, { r: 0 }],
  ],
  tear: [
    [0, { o: 1 }],
    [1, { o: 0, r: 38, tx: 30, ty: 70 }],
  ],
  thumbTap: [
    [0, {}],
    [0.6, { tx: -24, ty: -8 }],
    [0.8, { tx: -24, ty: -4 }],
    [1, { tx: -24, ty: -8 }],
  ],
  twinkle: [
    [0, { o: 0.2 }],
    [0.5, { o: 1 }],
    [1, { o: 0.2 }],
  ],
  wave: [
    [0, { r: -14 }],
    [1, { r: 14 }],
  ],
} satisfies Record<string, Keyframes>;

export const slideX = (dx: number): Keyframes => [
  [0, { tx: dx }],
  [1, { tx: 0 }],
];
export const moveX = (dx: number): Keyframes => [
  [0, { tx: 0 }],
  [1, { tx: dx }],
];
