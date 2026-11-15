import type { ReactNode } from "react";
import { Circle, Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";

import { fonts } from "@/theme/typography";

/**
 * The auth band's drawing kit (user, 2026-11-14): flat vector art in the style of
 * the reference the user picked: no outlines, solid colours with one shade for
 * depth, tall people with round heads, dot eyes, a blush and rounded hands.
 */

// ---------- colour ----------

/** `hex` darkened (amount < 0) or lightened (amount > 0), -1..1. */
export function tone(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    return Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

export const C = {
  coral: "#F0663A",
  cream: "#FFF7EC",
  green: "#22A06B",
  greenSoft: "#DDF5E8",
  ink: "#1D2A44",
  muted: "#6B7A90",
  navy: "#1D2F45",
  pink: "#F47C7C",
  primary: "#3F6ED8",
  white: "#FFFFFF",
  yellow: "#FFC845",
};

// ---------- text ----------

type Weight = 400 | 500 | 600 | 700;
const FAMILY: Record<Weight, string> = { 400: fonts.sans, 500: fonts.sansMedium, 600: fonts.sansSemiBold, 700: fonts.sansBold };

export function T({ anchor = "start", children, fill = C.ink, size, weight = 500, x, y }: {
  anchor?: "start" | "middle" | "end";
  children: string;
  fill?: string;
  size: number;
  weight?: Weight;
  x: number;
  y: number;
}) {
  return (
    <SvgText fill={fill} fontFamily={FAMILY[weight]} fontSize={size} textAnchor={anchor} x={x} y={y}>
      {children}
    </SvgText>
  );
}

export const at = (x: number, y: number, children: ReactNode, scale = 1) => (
  <G transform={`translate(${x} ${y})${scale !== 1 ? ` scale(${scale})` : ""}`}>{children}</G>
);

// ---------- people ----------

export type Look = {
  apron?: boolean;
  /** Cap colour: a peaked cap, seen from the front. */
  cap?: string;
  chef?: boolean;
  glasses?: string;
  hair: string;
  hairStyle: "long" | "short" | "bun" | "curly";
  moustache?: boolean;
  /** Bib and straps over the shirt, in this colour. */
  overalls?: string;
  pants: string;
  shirt: string;
  shoes: string;
  shortSleeves?: boolean;
  skin: string;
};

export const TENANT: Look = { glasses: "#F0663A", hair: "#26306B", hairStyle: "long", pants: "#1D2F45", shirt: "#F0663A", shoes: "#F0663A", skin: "#F6A47E" };
/** The owner: a man in his thirties, dark hair, a purple shirt (user, 2026-11-14: not an old man). */
export const OWNER: Look = { hair: "#1F1A1A", hairStyle: "curly", pants: "#3B4A6B", shirt: "#6D4FA0", shoes: "#6B4430", skin: "#C98A62" };
export const COOK: Look = { apron: true, chef: true, hair: "#2A1C14", hairStyle: "short", pants: "#3A3A48", shirt: "#3BA39B", shoes: "#2B2B33", shortSleeves: true, skin: "#9A623F" };
export const FIXER: Look = { cap: "#FFC845", hair: "#2A1C14", hairStyle: "short", overalls: "#2F6FB0", pants: "#2F6FB0", shirt: "#F4D35E", shoes: "#3B3B48", skin: "#B5764E" };
export const FRIEND: Look = { hair: "#5A3825", hairStyle: "bun", pants: "#3D4F7C", shirt: "#4FB286", shoes: "#FFFFFF", skin: "#E8B08A" };

type Point = readonly [number, number];

const SHOULDER_Y = -136;
const SHOULDER_X = 16;
const UPPER = 26;
const FORE = 25;
export const HANGING_LEFT: Point = [-23, -92];
export const HANGING_RIGHT: Point = [23, -92];

/** Two-bone arm: where the elbow goes for the hand to reach `target`, bent outwards. */
function reach(shoulder: Point, target: Point, outward: 1 | -1): { elbow: Point; hand: Point } {
  let dx = target[0] - shoulder[0];
  let dy = target[1] - shoulder[1];
  let d = Math.hypot(dx, dy);
  const max = UPPER + FORE - 0.5;
  if (d > max) {
    dx = (dx / d) * max;
    dy = (dy / d) * max;
    d = max;
  }
  const hand: Point = [shoulder[0] + dx, shoulder[1] + dy];
  const base = Math.atan2(dy, dx);
  const bend = Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d))));
  const a: Point = [shoulder[0] + UPPER * Math.cos(base + bend), shoulder[1] + UPPER * Math.sin(base + bend)];
  const b: Point = [shoulder[0] + UPPER * Math.cos(base - bend), shoulder[1] + UPPER * Math.sin(base - bend)];
  return { elbow: a[0] * outward > b[0] * outward ? a : b, hand };
}

/**
 * A person seen from the front, feet at (0,0), about 185 tall. `left` and `right`
 * are where the hands go (on screen, in the person's own units); each arm bends at
 * the elbow to get there. `held` is drawn over the hands (a phone, a plate) and
 * `over` over that (the thumbs on a phone), so a hand can hold a thing from behind.
 */
export function Person({ held, left = HANGING_LEFT, look, mood = "smile", over, right = HANGING_RIGHT, scale = 1, x, y }: {
  held?: ReactNode;
  left?: Point;
  look: Look;
  mood?: "smile" | "open" | "think";
  over?: ReactNode;
  right?: Point;
  scale?: number;
  x: number;
  y: number;
}) {
  const skinShade = tone(look.skin, -0.18);
  const shirtShade = tone(look.shirt, -0.12);
  const pantsShade = tone(look.pants, -0.18);
  const sleeve = look.shortSleeves ? look.shirt : shirtShade;

  const arm = (side: 1 | -1, target: Point) => {
    const shoulder: Point = [SHOULDER_X * side, SHOULDER_Y];
    const { elbow, hand } = reach(shoulder, target, side);
    const angle = (Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]) * 180) / Math.PI;
    // The sleeve stops short of the hand; the hand is a rounded mitten along the forearm.
    const wrist: Point = [hand[0] - Math.cos((angle * Math.PI) / 180) * 5, hand[1] - Math.sin((angle * Math.PI) / 180) * 5];
    return (
      <G>
        {look.shortSleeves ? (
          <>
            <Path d={`M${elbow[0]},${elbow[1]} L${wrist[0]},${wrist[1]}`} stroke={look.skin} strokeLinecap="round" strokeWidth={7.5} />
            <Path d={`M${shoulder[0]},${shoulder[1]} L${elbow[0]},${elbow[1]}`} stroke={sleeve} strokeLinecap="round" strokeWidth={10} />
          </>
        ) : (
          <Path d={`M${shoulder[0]},${shoulder[1]} L${elbow[0]},${elbow[1]} L${wrist[0]},${wrist[1]}`} fill="none" stroke={sleeve} strokeLinecap="round" strokeLinejoin="round" strokeWidth={9.5} />
        )}
        <G transform={`translate(${hand[0]} ${hand[1]}) rotate(${angle - 90})`}>
          <Rect fill={look.skin} height={11} rx={4.4} width={8.8} x={-4.4} y={-4} />
          <Ellipse cx={side * 3.6} cy={-1} fill={look.skin} rx={2.2} ry={3.4} />
        </G>
      </G>
    );
  };

  const hairBack =
    look.hairStyle === "long" ? (
      <Path d="M-20,-166 Q-23,-190 0,-191 Q23,-190 20,-166 Q26,-142 19,-124 Q10,-130 0,-130 Q-10,-130 -19,-124 Q-26,-142 -20,-166 Z" fill={look.hair} />
    ) : look.hairStyle === "bun" ? (
      <Circle cx={0} cy={-190} fill={look.hair} r={8} />
    ) : null;

  const hairFront =
    look.chef || look.cap ? null : look.hairStyle === "curly" ? (
      <Path d="M-16,-162 Q-20,-178 -10,-184 Q-4,-192 4,-186 Q14,-190 17,-178 Q21,-170 16,-162 Q10,-172 0,-171 Q-9,-172 -16,-162 Z" fill={look.hair} />
    ) : look.hairStyle === "long" ? (
      <>
        <Path d="M-17,-160 Q-18,-182 2,-183 Q18,-182 18,-164 Q14,-176 0,-173 Q-10,-171 -17,-160 Z" fill={look.hair} />
        <Path d="M10,-181 Q24,-186 26,-178 Q20,-178 15,-176 Z" fill={look.hair} />
      </>
    ) : (
      <Path d="M-16,-162 Q-17,-181 0,-181 Q17,-181 16,-162 Q12,-172 1,-172 Q-9,-172 -16,-162 Z" fill={look.hair} />
    );

  const headwear = look.chef ? (
    <>
      <Path d="M-14,-170 L-13,-184 Q-22,-196 -9,-199 Q0,-210 10,-199 Q22,-196 13,-184 L14,-170 Z" fill={C.white} />
      <Rect fill="#E6ECF2" height={5} rx={1.5} width={28} x={-14} y={-174} />
    </>
  ) : look.cap ? (
    <>
      <Path d="M-16.5,-166 Q-16.5,-187 0,-187 Q16.5,-187 16.5,-166 Z" fill={look.cap} />
      <Path d="M-4,-186 Q0,-188 4,-186" stroke={tone(look.cap, -0.2)} strokeWidth={1.4} />
      {/* The peak, seen from the front: a band over the brow, never down over the eyes. */}
      <Path d="M-19,-166 Q0,-171 19,-166 Q0,-163 -19,-166 Z" fill={tone(look.cap, -0.18)} />
    </>
  ) : null;

  const mouth =
    mood === "open" ? (
      <Path d="M-3.6,-152.5 Q0,-147.5 3.6,-152.5 Z" fill="#9E3B3B" />
    ) : mood === "think" ? (
      <Path d="M-3,-151 L3,-152" stroke={skinShade} strokeLinecap="round" strokeWidth={1.5} />
    ) : (
      <Path d="M-3.8,-152.5 Q0,-149.2 3.8,-152.5" fill="none" stroke={tone(look.skin, -0.42)} strokeLinecap="round" strokeWidth={1.5} />
    );

  return (
    <G transform={`translate(${x} ${y})${scale !== 1 ? ` scale(${scale})` : ""}`}>
      {hairBack}
      {/* Legs, cuffs and shoes. */}
      <Path d="M-15,-90 L-0.8,-90 L-2.5,-10 L-12.5,-10 Z" fill={look.pants} />
      <Path d="M0.8,-90 L15,-90 L12.5,-10 L2.5,-10 Z" fill={pantsShade} />
      <Rect fill={tone(look.pants, -0.3)} height={5} rx={1} width={11.5} x={-13.2} y={-12} />
      <Rect fill={tone(look.pants, -0.36)} height={5} rx={1} width={11.5} x={1.7} y={-12} />
      <Ellipse cx={-8} cy={-4} fill={look.shoes} rx={8} ry={4} />
      <Ellipse cx={8} cy={-4} fill={tone(look.shoes, -0.1)} rx={8} ry={4} />
      {/* Neck and shirt, a shade down one side. */}
      <Rect fill={skinShade} height={12} width={9} x={-4.5} y={-152} />
      <Path d="M-17,-130 Q-17,-142 -8,-143 L8,-143 Q17,-142 17,-130 L15,-90 L-15,-90 Z" fill={look.shirt} />
      <Path d="M5,-143 L8,-143 Q17,-142 17,-130 L15,-90 L7,-90 Z" fill={shirtShade} />
      {look.overalls ? (
        <>
          <Path d="M-11,-122 L11,-122 L12,-90 L-12,-90 Z" fill={look.overalls} />
          <Path d="M-11,-122 L-14,-142 M11,-122 L14,-142" stroke={look.overalls} strokeLinecap="round" strokeWidth={3.5} />
          <Rect fill={tone(look.overalls, -0.15)} height={7} rx={1.5} width={9} x={-4.5} y={-116} />
        </>
      ) : null}
      {look.apron ? (
        <>
          <Path d="M-10,-128 L10,-128 L13,-58 L-13,-58 Z" fill={C.white} />
          <Path d="M-10,-128 L-8,-142 M10,-128 L8,-142" stroke={C.white} strokeWidth={2.4} />
          <Rect fill="#E6ECF2" height={8} rx={1.5} width={11} x={-5.5} y={-104} />
        </>
      ) : (
        <Rect fill={tone(look.pants, -0.45)} height={5} rx={1} width={30} x={-15} y={-94} />
      )}
      {/* The collar: two white petals at the neck. */}
      <Path d="M0,-140 L-8.5,-144 Q-8,-136 -1,-137 Z" fill={C.white} />
      <Path d="M0,-140 L8.5,-144 Q8,-136 1,-137 Z" fill="#EEF1F6" />
      {arm(-1, left)}
      {arm(1, right)}
      {/* Head. */}
      <Circle cx={-16.5} cy={-159} fill={skinShade} r={4.4} />
      <Circle cx={16.5} cy={-159} fill={skinShade} r={4.4} />
      <Circle cx={0} cy={-161} fill={look.skin} r={16.5} />
      {hairFront}
      <Circle cx={-6.6} cy={-161} fill={C.navy} r={1.8} />
      <Circle cx={6.6} cy={-161} fill={C.navy} r={1.8} />
      <Path d="M0,-158.5 Q1.8,-155.5 -0.6,-155" fill="none" stroke={skinShade} strokeLinecap="round" strokeWidth={1.3} />
      <Circle cx={-10.5} cy={-154.5} fill={C.pink} opacity={0.45} r={3} />
      <Circle cx={10.5} cy={-154.5} fill={C.pink} opacity={0.45} r={3} />
      {mouth}
      {look.moustache ? <Path d="M-6.5,-154 Q0,-157.6 6.5,-154 Q0,-152.6 -6.5,-154 Z" fill="#8C9099" /> : null}
      {look.glasses ? (
        <>
          <Circle cx={-6.6} cy={-161} fill={C.white} fillOpacity={0.18} r={6.6} stroke={look.glasses} strokeWidth={1.9} />
          <Circle cx={6.6} cy={-161} fill={C.white} fillOpacity={0.18} r={6.6} stroke={look.glasses} strokeWidth={1.9} />
          <Path d="M-1,-161.5 Q0,-162.6 1,-161.5" fill="none" stroke={look.glasses} strokeWidth={1.6} />
        </>
      ) : null}
      {headwear}
      {held}
      {over}
    </G>
  );
}

// ---------- phones in hands ----------

/**
 * Where to put the hands for a phone held at (cx, cy) in the person's units, and
 * the phone with its two thumbs: the palms sit under the phone, the thumbs come up
 * over its sides (user, 2026-11-14: no fingertips).
 */
export function phoneInHands({ cx, cy, h = 40, screen, w = 24, oneHand }: { cx: number; cy: number; h?: number; oneHand?: "left" | "right"; screen: ReactNode; w?: number }) {
  const bottom = cy + h / 2;
  const left: Point = [cx - w / 2 + 3, bottom - 2];
  const right: Point = [cx + w / 2 - 3, bottom - 2];
  const thumb = (side: 1 | -1, skin: string) => (
    <Rect
      fill={skin}
      height={11}
      key={side}
      rx={2.6}
      transform={`rotate(${side * -18} ${cx + side * (w / 2)} ${bottom - 8})`}
      width={5.2}
      x={cx + side * (w / 2) - 2.6}
      y={bottom - 15}
    />
  );
  return {
    held: <Phone cx={cx} cy={cy} h={h} screen={screen} w={w} />,
    left: oneHand === "right" ? undefined : left,
    over: (skin: string) => (
      <>
        {oneHand !== "right" ? thumb(-1, skin) : null}
        {oneHand !== "left" ? thumb(1, skin) : null}
      </>
    ),
    right: oneHand === "left" ? undefined : right,
  };
}

/** A flat phone: dark body, light screen, a speaker slot. `screen` is drawn in screen units (0,0 top left). */
export function Phone({ cx, cy, h, screen, w }: { cx: number; cy: number; h: number; screen?: ReactNode; w: number }) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const inset = Math.max(1.6, w * 0.07);
  return (
    <G>
      <Rect fill="#1B2340" height={h} rx={w * 0.16} width={w} x={x} y={y} />
      <Rect fill="#EEF3FB" height={h - inset * 2.6} rx={w * 0.1} width={w - inset * 2} x={x + inset} y={y + inset * 1.5} />
      <Rect fill="#0E1428" height={Math.max(1, h * 0.02)} rx={0.6} width={w * 0.3} x={cx - w * 0.15} y={y + inset * 0.5} />
      {screen ? <G transform={`translate(${x + inset} ${y + inset * 1.5})`}>{screen}</G> : null}
    </G>
  );
}

// ---------- small props ----------

/** A white card with a soft drop shade under it. */
export function Card({ children, h, r = 12, w, x, y }: { children?: ReactNode; h: number; r?: number; w: number; x: number; y: number }) {
  return (
    <G>
      <Rect fill="#0B1533" height={h} opacity={0.14} rx={r} width={w} x={x + 2} y={y + 4} />
      <Rect fill={C.white} height={h} rx={r} width={w} x={x} y={y} />
      {children}
    </G>
  );
}

/** A map pin; `shadow` off for a pin drawn tiny on a phone's map, where it read as a tear. */
export const Pin = ({ color = C.coral, scale = 1, shadow = true, x, y }: { color?: string; scale?: number; shadow?: boolean; x: number; y: number }) => (
  <G transform={`translate(${x} ${y}) scale(${scale})`}>
    {shadow ? <Ellipse cx={0} cy={1} fill="#0B1533" opacity={0.18} rx={6} ry={2} /> : null}
    <Path d="M0,0 C-9,-11 -9,-24 0,-24 C9,-24 9,-11 0,0 Z" fill={color} />
    <Circle cx={0} cy={-15} fill={C.white} r={3.6} />
  </G>
);

export function Tick({ r = 9, x = 0, y = 0 }: { r?: number; x?: number; y?: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Circle fill={C.green} r={r} />
      <Path d={`M${-r * 0.42},${r * 0.02} L${-r * 0.1},${r * 0.36} L${r * 0.46},${-r * 0.36}`} fill="none" stroke={C.white} strokeLinecap="round" strokeLinejoin="round" strokeWidth={r * 0.24} />
    </G>
  );
}

export const Coin = ({ r = 9, x, y }: { r?: number; x: number; y: number }) => (
  <G transform={`translate(${x} ${y})`}>
    <Circle fill="#E2A21F" r={r} />
    <Circle cy={-0.8} fill={C.yellow} r={r - 1.2} />
    <T anchor="middle" fill="#9A6100" size={r * 1.1} weight={700} x={0} y={r * 0.34}>₹</T>
  </G>
);

export const Cloud = ({ scale = 1, x, y, color = C.white }: { color?: string; scale?: number; x: number; y: number }) => (
  <Path
    d="M0,0 Q0,-12 12,-12 Q16,-24 30,-20 Q42,-28 50,-14 Q62,-14 62,0 Z"
    fill={color}
    transform={`translate(${x} ${y}) scale(${scale})`}
  />
);

export const Sparkle = ({ color = C.yellow, scale = 1, x, y }: { color?: string; scale?: number; x: number; y: number }) => (
  <Path d="M0,-9 Q1.2,-1.2 9,0 Q1.2,1.2 0,9 Q-1.2,1.2 -9,0 Q-1.2,-1.2 0,-9 Z" fill={color} transform={`translate(${x} ${y}) scale(${scale})`} />
);

/**
 * A QR code drawn like a real one (user, 2026-11-14): a 21 × 21 grid with the three
 * finder squares (dark ring, light ring, dark centre), the timing lines and a
 * fixed scatter of data modules, on a white quiet zone. Dark runs in a row are one
 * rectangle each.
 */
const QR_N = 21;
const QR_MODULES: boolean[][] = (() => {
  const grid = Array.from({ length: QR_N }, () => Array<boolean | null>(QR_N).fill(null));
  const finder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const y = top + r;
        const x = left + c;
        if (y < 0 || x < 0 || y >= QR_N || x >= QR_N) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        grid[y][x] = ring === 3 || ring <= 1;
      }
    }
  };
  finder(0, 0);
  finder(0, QR_N - 7);
  finder(QR_N - 7, 0);
  for (let k = 8; k < QR_N - 8; k += 1) {
    grid[6][k] = k % 2 === 0;
    grid[k][6] = k % 2 === 0;
  }
  let seed = 1234567;
  return grid.map((row) =>
    row.map((cell) => {
      if (cell !== null) return cell;
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648 < 0.48;
    }),
  );
})();

export function Qr({ fill = C.ink, size, x, y }: { fill?: string; size: number; x: number; y: number }) {
  const quiet = size * 0.06;
  const c = (size - quiet * 2) / QR_N;
  const runs: ReactNode[] = [];
  QR_MODULES.forEach((row, r) => {
    let start = -1;
    row.forEach((dark, k) => {
      if (dark && start < 0) start = k;
      if ((!dark || k === QR_N - 1) && start >= 0) {
        const end = dark ? k + 1 : k;
        runs.push(<Rect fill={fill} height={c + 0.05} key={`${r}-${start}`} width={(end - start) * c + 0.05} x={x + quiet + start * c} y={y + quiet + r * c} />);
        start = -1;
      }
    });
  });
  return (
    <G>
      <Rect fill={C.white} height={size} rx={size * 0.04} width={size} x={x} y={y} />
      {runs}
    </G>
  );
}

export function Megaphone({ scale = 1, x, y }: { scale?: number; x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Path d="M-9,-4 L4,-11 L4,11 L-9,4 Z" fill={C.coral} />
      <Rect fill={C.primary} height={9} rx={2} width={5.5} x={-14} y={-4.5} />
      <Path d="M-8,4 L-6,11 L-2,11 L-3,5 Z" fill={C.yellow} />
      <Path d="M8,-6 Q12,0 8,6 M11,-10 Q17,0 11,10" fill="none" stroke={C.yellow} strokeLinecap="round" strokeWidth={2} />
    </G>
  );
}

export function Padlock({ open = 0, scale = 1, x, y, color = C.yellow }: { color?: string; open?: number; scale?: number; x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Path d={`M-9,${-2 - open} V${-12 - open} Q-9,${-22 - open} 0,${-22 - open} Q9,${-22 - open} 9,${-12 - open} V${-2 - open}`} fill="none" stroke="#9AA6B8" strokeLinecap="round" strokeWidth={4.5} />
      <Rect fill={color} height={22} rx={5} width={26} x={-13} y={-4} />
      <Rect fill={tone(color, -0.15)} height={22} rx={5} width={8} x={5} y={-4} />
      <Circle cx={0} cy={5} fill={tone(color, -0.5)} r={3} />
      <Rect fill={tone(color, -0.5)} height={6} rx={1} width={2.4} x={-1.2} y={6} />
    </G>
  );
}

export function Key({ angle = 0, scale = 1, x, y }: { angle?: number; scale?: number; x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <Circle fill={C.yellow} r={7} />
      <Circle fill={tone(C.yellow, -0.3)} r={2.6} />
      <Rect fill={C.yellow} height={4} rx={1} width={18} x={5} y={-2} />
      <Rect fill={C.yellow} height={5} width={3} x={17} y={1} />
      <Rect fill={C.yellow} height={4} width={3} x={12} y={1} />
    </G>
  );
}

/** The scene name pill, bottom left, above where the sheet overlaps the band. */
export function Caption({ label, n }: { label: string; n: number | string }) {
  const width = 46 + label.length * 7.4;
  return (
    <G transform="translate(16 270)">
      <Rect fill="#0B1533" height={30} opacity={0.16} rx={15} width={width} x={1.5} y={3} />
      <Rect fill={C.white} height={30} rx={15} width={width} />
      <Circle cx={15} cy={15} fill={C.primary} r={10.5} />
      <T anchor="middle" fill={C.white} size={10.5} weight={700} x={15} y={19}>{String(n)}</T>
      <T size={13} weight={600} x={32} y={19.6}>{label}</T>
    </G>
  );
}
