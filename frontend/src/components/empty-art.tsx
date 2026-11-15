import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

/**
 * Every empty state's picture, redrawn as one flat vector set in a single blue
 * tone (user, 2026-11-14): the open tray with its three rays, the subject floating
 * over it, and a "none" badge where the old 3D pictures had one. Tenant and owner
 * screens alike. Drawn on a 128 grid at any size.
 */

/** The one tone every empty-state picture is drawn in. */
export const EMPTY_TONE = {
  deep: "#2F6CD9",
  mid: "#5B8FE8",
  light: "#BCD3F7",
  pale: "#E3EDFC",
  white: "#FFFFFF",
};
const T = EMPTY_TONE;

export type EmptyArt = (props: { size?: number }) => ReactNode;

function Frame({ children, size = 132 }: { children: ReactNode; size?: number }) {
  // The subject sits inside the square with air round it: the negative margin
  // brings the text under it up to the drawing, not to the square (user, 2026-11-14).
  return (
    <View style={{ marginBottom: -Math.round(size * 0.12), marginTop: -Math.round(size * 0.06) }}>
      <Svg height={size} viewBox="0 0 128 128" width={size}>
        {children}
      </Svg>
    </View>
  );
}

/** The "none" badge: a white disc with the blue no-entry mark. */
function NoBadge({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} fill={T.white} r={13} stroke={T.light} strokeWidth={2} />
      <Circle cx={x} cy={y} fill="none" r={8} stroke={T.deep} strokeWidth={3.2} />
      <Path d={`M${x - 5.6} ${y - 5.6}l11.2 11.2`} stroke={T.deep} strokeLinecap="round" strokeWidth={3.2} />
    </G>
  );
}

function Sparkle({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <Path
      d="M0-8Q1.2-1.2 8 0Q1.2 1.2 0 8Q-1.2 1.2-8 0Q-1.2-1.2 0-8Z"
      fill={T.mid}
      transform={`translate(${x} ${y}) scale(${s})`}
    />
  );
}

/**
 * The subject on its own, enlarged to fill the picture, with the badge if it is a
 * "none". No tray under it and no rays over it (user, 2026-11-14).
 */
function Scene({ badge, children, size }: { badge?: [number, number]; children?: ReactNode; size?: number }) {
  return (
    <Frame size={size}>
      <G transform="translate(64 66) scale(1.75) translate(-64 -50)">
        {children}
        {badge ? <NoBadge x={badge[0]} y={badge[1]} /> : null}
      </G>
    </Frame>
  );
}

// ---------- the subjects ----------

const Paper = ({ x, y, w, h }: { h: number; w: number; x: number; y: number }) => (
  <G>
    <Path d={`M${x} ${y + 4}a4 4 0 0 1 4-4h${w - 14}l10 10v${h - 14}a4 4 0 0 1-4 4H${x + 4}a4 4 0 0 1-4-4Z`} fill={T.pale} stroke={T.light} strokeWidth={1.5} />
    <Path d={`M${x + w - 10} ${y}v10h10`} fill={T.light} />
  </G>
);

const Rupee = ({ x, y, s = 1 }: { s?: number; x: number; y: number }) => (
  <Path
    d="M-5-6h10M-5-2h10M-3.5-6c6 0 6 8-.4 8l6 6"
    fill="none"
    stroke={T.deep}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2.6}
    transform={`translate(${x} ${y}) scale(${s})`}
  />
);

export const EmptyAllCaughtUp: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Circle cx={64} cy={52} fill={T.pale} r={20} stroke={T.light} strokeWidth={2} />
    <Path d="M54 52l7 7 13-14" fill="none" stroke={T.deep} strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} />
    <Sparkle s={0.6} x={34} y={52} />
    <Sparkle s={0.6} x={94} y={52} />
  </Scene>
);

export const EmptyAgreement: EmptyArt = ({ size }) => (
  <Scene badge={[82, 64]} size={size}>
    <Paper h={42} w={34} x={47} y={30} />
    <Path d="M57 42l5-4 5 4v5H57Z" fill={T.deep} />
    <Rect fill={T.mid} height={3} rx={1.5} width={20} x={53} y={52} />
    <Rect fill={T.mid} height={3} rx={1.5} width={14} x={53} y={58} />
    <Path d="M53 66c3-4 4 1 6-1s3-2 6 0" fill="none" stroke={T.deep} strokeLinecap="round" strokeWidth={2} />
  </Scene>
);

export const EmptyBeds: EmptyArt = ({ size }) => (
  <Scene badge={[82, 64]} size={size}>
    <Rect fill={T.mid} height={22} rx={5} width={34} x={46} y={34} />
    <Rect fill={T.pale} height={9} rx={3.5} width={18} x={54} y={40} />
    <Rect fill={T.light} height={12} rx={4} width={42} x={42} y={52} />
    <Rect fill={T.mid} height={8} rx={2} width={5} x={44} y={62} />
  </Scene>
);

export const EmptyBill: EmptyArt = ({ size }) => (
  <Scene badge={[82, 64]} size={size}>
    <Paper h={42} w={34} x={47} y={30} />
    <Circle cx={61} cy={44} fill={T.white} r={7} />
    <Rupee s={0.85} x={61} y={44} />
    <Rect fill={T.mid} height={3} rx={1.5} width={20} x={53} y={56} />
    <Rect fill={T.mid} height={3} rx={1.5} width={14} x={53} y={62} />
  </Scene>
);

export const EmptyCategory: EmptyArt = ({ size }) => (
  <Scene badge={[84, 64]} size={size}>
    {[[46, 30], [66, 30], [46, 50], [66, 50]].map(([x, y]) => (
      <Rect fill={T.pale} height={18} key={`${x}${y}`} rx={4} stroke={T.light} strokeWidth={1.5} width={18} x={x} y={y} />
    ))}
    <Path d="M52 34v10M50 34v4a2 2 0 0 0 4 0v-4M58 34v10" fill="none" stroke={T.deep} strokeLinecap="round" strokeWidth={1.8} />
    <Path d="M70 41l5-4 5 4v4H70Z" fill={T.deep} />
    <Path d="M50 54h2l2 7h8l1.6-5H53" fill="none" stroke={T.deep} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
  </Scene>
);

export const EmptyExpense: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Path d="M48 38l18-8a3 3 0 0 1 4 1.6L72 38Z" fill={T.light} />
    <Rect fill={T.pale} height={30} rx={6} stroke={T.light} strokeWidth={1.5} width={40} x={44} y={38} />
    <Rect fill={T.light} height={10} rx={5} width={14} x={72} y={48} />
    <Circle cx={78} cy={53} fill={T.deep} r={2.4} />
    <Path d="M70 34c4-8 10-10 16-8" fill="none" stroke={T.deep} strokeLinecap="round" strokeWidth={4} />
    <Path d="M82 20l6 6-7 4" fill="none" stroke={T.deep} strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
  </Scene>
);

export const EmptyLocation: EmptyArt = ({ size }) => (
  <Scene badge={[78, 64]} size={size}>
    <Path d="M64 70S48 54 48 44a16 16 0 0 1 32 0c0 10-16 26-16 26Z" fill={T.mid} />
    <Circle cx={64} cy={44} fill={T.white} r={6} />
  </Scene>
);

export const EmptyNotice: EmptyArt = ({ size }) => (
  <Scene badge={[82, 58]} size={size}>
    {/* Raised a little (user, 2026-11-14): its text nearly touched it. */}
    <G transform="translate(0 -7) rotate(-12 64 48)">
      {/* The handle under the cone, a grip angled back (user, 2026-11-15). */}
      <Path d="M56 55h7l-1.6 12.5a2.4 2.4 0 0 1-2.4 2.1h-1.4a2.4 2.4 0 0 1-2.4-2.4Z" fill={T.deep} />
      <Rect fill={T.deep} height={14} rx={4} width={10} x={42} y={42} />
      <Path d="M52 42l22-10v32L52 56Z" fill={T.pale} stroke={T.light} strokeWidth={1.5} />
      <Ellipse cx={75} cy={48} fill={T.deep} rx={6} ry={17} />
      <Ellipse cx={75} cy={48} fill={T.light} rx={3} ry={12} />
    </G>
  </Scene>
);

export const EmptyPerson: EmptyArt = ({ size }) => (
  <Scene badge={[82, 64]} size={size}>
    <Circle cx={64} cy={40} fill={T.mid} r={10} />
    <Path d="M46 70c0-11 8-17 18-17s18 6 18 17Z" fill={T.mid} />
  </Scene>
);

export const EmptySalary: EmptyArt = ({ size }) => (
  <Scene badge={[82, 64]} size={size}>
    <Paper h={42} w={34} x={47} y={30} />
    <Circle cx={61} cy={44} fill={T.white} r={7} />
    <Rupee s={0.85} x={61} y={44} />
    <Rect fill={T.mid} height={3} rx={1.5} width={20} x={53} y={56} />
    <Circle cx={48} cy={66} fill={T.mid} r={7} />
    <Circle cx={48} cy={66} fill="none" r={4.2} stroke={T.pale} strokeWidth={1.4} />
  </Scene>
);

/** Nothing raised (the empty concern lists): a clipboard with every line ticked. */
export const EmptyTray: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Rect fill={T.light} height={46} rx={5} width={36} x={46} y={28} />
    <Rect fill={T.pale} height={38} rx={3} width={28} x={50} y={34} />
    <Rect fill={T.deep} height={8} rx={3} width={16} x={56} y={25} />
    {[42, 52, 62].map((y) => (
      <G key={y}>
        <Path d={`M54 ${y}l2.4 2.4 4-4.4`} fill="none" stroke={T.deep} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
        <Rect fill={T.mid} height={3} rx={1.5} width={12} x={63} y={y - 1.5} />
      </G>
    ))}
  </Scene>
);

export const EmptySearch: EmptyArt = ({ size }) => (
  <Frame size={size}>
    <Circle cx={62} cy={62} fill={T.pale} r={40} />
    <Path d="M78 78l18 18" stroke={T.deep} strokeLinecap="round" strokeWidth={12} />
    <Circle cx={58} cy={58} fill={T.white} r={22} stroke={T.deep} strokeWidth={9} />
    <Path d="M47 52a12 12 0 0 1 9-9" fill="none" stroke={T.light} strokeLinecap="round" strokeWidth={4} />
    <Sparkle x={22} y={24} />
    <Sparkle s={0.8} x={102} y={40} />
    <Sparkle s={0.6} x={24} y={98} />
  </Frame>
);

export const EmptyChats: EmptyArt = ({ size }) => (
  <Frame size={size}>
    <Path d="M52 38h46a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10h-6v10l-12-10H52a10 10 0 0 1-10-10V48a10 10 0 0 1 10-10Z" fill={T.mid} />
    <Path d="M26 52h46a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H40l-12 10V92h-2a10 10 0 0 1-10-10V62a10 10 0 0 1 10-10Z" fill={T.pale} stroke={T.light} strokeWidth={2} />
    {[38, 49, 60].map((x) => (
      <Circle cx={x} cy={72} fill={T.deep} key={x} r={3.6} />
    ))}
    <NoBadge x={96} y={96} />
  </Frame>
);

export const EmptyEnquiries: EmptyArt = ({ size }) => (
  <Frame size={size}>
    <Path d="M60 50h44a10 10 0 0 1 10 10v18a10 10 0 0 1-10 10h-2v10l-12-10H60Z" fill={T.light} />
    <Path d="M24 32h52a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H44l-14 12V78h-6a10 10 0 0 1-10-10V42a10 10 0 0 1 10-10Z" fill={T.pale} stroke={T.deep} strokeWidth={4} />
    <Path d="M42 48a8 8 0 1 1 11 7.4c-2 .9-3 2.4-3 4.6v1" fill="none" stroke={T.deep} strokeLinecap="round" strokeWidth={5} />
    <Circle cx={50} cy={68} fill={T.deep} r={3.2} />
  </Frame>
);

/** No food items: an empty plate between a fork and a knife, no badge (user, 2026-11-14). */
export const EmptyFoodItems: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Circle cx={64} cy={50} fill={T.pale} r={14} stroke={T.light} strokeWidth={2} />
    <Circle cx={64} cy={50} fill={T.white} r={9} stroke={T.light} strokeWidth={1.5} />
    {/* The fork. */}
    <Path d="M41 37v8a2.6 2.6 0 0 0 5.2 0v-8M43.6 37v8M43.6 47.6V64" fill="none" stroke={T.deep} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    {/* The knife. */}
    <Path d="M86 64V37c-3.2 1.8-4.4 6-4.4 11v4.4H86" fill={T.mid} stroke={T.deep} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
  </Scene>
);

export const EmptyFoodProfiles: EmptyArt = ({ size }) => (
  <Frame size={size}>
    <Rect fill={T.light} height={86} rx={8} width={58} x={35} y={30} />
    <Rect fill={T.pale} height={74} rx={5} width={48} x={40} y={38} />
    <Rect fill={T.deep} height={11} rx={4} width={26} x={51} y={25} />
    <Circle cx={64} cy={58} fill={T.light} r={12} />
    <Circle cx={64} cy={54} fill={T.deep} r={4.6} />
    <Path d="M56 66c1-5 4-7 8-7s7 2 8 7Z" fill={T.deep} />
    <Rect fill="none" height={20} rx={5} stroke={T.mid} strokeDasharray="4 3" strokeWidth={2} width={36} x={46} y={80} />
    <Path d="M64 85v10M59 90h10" stroke={T.deep} strokeLinecap="round" strokeWidth={3} />
    {[[18, 50], [110, 50], [18, 82], [110, 82]].map(([x, y]) => (
      <Circle cx={x} cy={y} fill={T.pale} key={`${x}${y}`} r={12} stroke={T.light} strokeWidth={1.6} />
    ))}
    <Circle cx={18} cy={51} fill={T.mid} r={6} />
    <Path d="M104 50c3-4 9-4 12 0-3 4-9 4-12 0Z" fill={T.mid} />
    <Path d="M16 76c3 0 5 3 4 6l-2 8-2-8c-1-3 0-6 0-6Z" fill={T.mid} />
    <Circle cx={108} cy={80} fill={T.mid} r={3.6} />
    <Circle cx={113} cy={80} fill={T.mid} r={3.6} />
    <Rect fill={T.deep} height={6} rx={1} width={3} x={109} y={83} />
  </Frame>
);

export const EmptyUnderConstruction: EmptyArt = ({ size }) => (
  <Frame size={size}>
    <Rect fill={T.light} height={6} rx={3} width={104} x={12} y={108} />
    <Rect fill={T.mid} height={84} width={14} x={24} y={24} />
    {Array.from({ length: 6 }, (_, k) => (
      <Path d={`M24 ${30 + k * 13}l14 10`} key={k} stroke={T.pale} strokeWidth={2.4} />
    ))}
    <Rect fill={T.deep} height={9} rx={2} width={86} x={18} y={18} />
    <Path d="M88 27v14" stroke={T.deep} strokeWidth={2.4} />
    <Path d="M88 41a4 4 0 1 1-4 4" fill="none" stroke={T.deep} strokeLinecap="round" strokeWidth={3} />
    <Path d="M78 58l10-10 10 10" fill="none" stroke={T.deep} strokeWidth={2.4} />
    <Rect fill={T.mid} height={14} rx={2} width={36} x={70} y={58} />
    <Rect fill={T.pale} height={4} width={36} x={70} y={63} />
    <Rect fill={T.deep} height={6} rx={2} width={24} x={19} y={104} />
  </Frame>
);

export const EmptyBookings: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Rect fill={T.mid} height={36} rx={6} width={40} x={46} y={30} />
    <Rect fill={T.pale} height={24} rx={3} width={32} x={50} y={39} />
    <Path d="M54 26v8M64 26v8M74 26v8" stroke={T.deep} strokeLinecap="round" strokeWidth={3} />
    {/* A bed inside the calendar card (user, 2026-11-14): headboard, pillow, blanket, legs. */}
    <Rect fill={T.deep} height={15} rx={1.5} width={4} x={54} y={44} />
    <Rect fill={T.mid} height={4.4} rx={2} width={7} x={59} y={48.6} />
    <Rect fill={T.mid} height={5.6} rx={2} width={12} x={67} y={47.4} />
    <Rect fill={T.deep} height={5} rx={1.5} width={26} x={54} y={53} />
    <Rect fill={T.deep} height={3.4} rx={1} width={2.6} x={55} y={58} />
    <Rect fill={T.deep} height={3.4} rx={1} width={2.6} x={76.4} y={58} />
    <G transform="rotate(30 40 50)">
      <Circle cx={40} cy={44} fill="none" r={5} stroke={T.deep} strokeWidth={3} />
      <Path d="M40 49v16M40 59h4M40 63h3" stroke={T.deep} strokeLinecap="round" strokeWidth={3} />
    </G>
  </Scene>
);

/**
 * No saved properties (user, 2026-11-14): a building of flats with a save badge,
 * the bookmark on a white disc at its corner.
 */
export const EmptyBookmarks: EmptyArt = ({ size }) => (
  <Scene size={size}>
    {/* The building: a roof band, four floors of windows, a door. */}
    <Rect fill={T.pale} height={44} rx={3} stroke={T.light} strokeWidth={1.5} width={34} x={44} y={28} />
    <Rect fill={T.mid} height={5} rx={2} width={38} x={42} y={25} />
    {[34, 42, 50, 58].map((y) =>
      [49, 58.5, 68].map((x) => <Rect fill={T.light} height={5} key={`${x}-${y}`} rx={1} width={5} x={x} y={y} />),
    )}
    <Rect fill={T.deep} height={9} rx={1.5} width={8} x={57} y={63} />
    {/* The save badge. */}
    <Circle cx={80} cy={64} fill={T.white} r={12} stroke={T.light} strokeWidth={2} />
    <Path d="M75 56.5h10a1.5 1.5 0 0 1 1.5 1.5v14l-6.5-4.4-6.5 4.4V58a1.5 1.5 0 0 1 1.5-1.5Z" fill={T.deep} />
  </Scene>
);

export const EmptyVisits: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Rect fill={T.pale} height={34} rx={6} stroke={T.light} strokeWidth={1.5} width={36} x={42} y={32} />
    <Rect fill={T.mid} height={8} rx={3} width={36} x={42} y={32} />
    {[[48, 46], [58, 46], [48, 55], [58, 55]].map(([x, y]) => (
      <Rect fill={T.light} height={5} key={`${x}${y}`} rx={1} width={6} x={x} y={y} />
    ))}
    <Circle cx={80} cy={60} fill={T.white} r={12} stroke={T.deep} strokeWidth={3.4} />
    <Path d="M80 53v7l5 3" fill="none" stroke={T.deep} strokeLinecap="round" strokeWidth={3} />
  </Scene>
);

export const EmptyDamage: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Rect fill={T.mid} height={38} rx={5} width={38} x={45} y={30} />
    <Rect fill={T.pale} height={30} rx={3} width={30} x={49} y={34} />
    <Path d="M63 48l-7-10M63 48l9-8M63 48l12 6M63 48l-4 15M63 48l-11 4" fill="none" stroke={T.mid} strokeLinecap="round" strokeWidth={1.8} />
    <Circle cx={63} cy={48} fill={T.mid} r={2} />
  </Scene>
);

export const EmptyDeposit: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Rect fill={T.mid} height={36} rx={6} width={42} x={43} y={30} />
    <Rect fill={T.pale} height={28} rx={4} width={34} x={47} y={34} />
    <Circle cx={62} cy={48} fill={T.light} r={9} />
    <Circle cx={62} cy={48} fill={T.deep} r={3} />
    {Array.from({ length: 6 }, (_, k) => (
      <Rect fill={T.deep} height={3} key={k} rx={1} transform={`rotate(${k * 60} 62 48)`} width={2} x={61} y={38.4} />
    ))}
    <Rect fill={T.deep} height={10} rx={1.5} width={3} x={75} y={43} />
  </Scene>
);

export const EmptyLeads: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Rect fill={T.light} height={40} rx={5} width={32} x={44} y={30} />
    <Rect fill={T.pale} height={32} rx={3} width={24} x={48} y={36} />
    <Rect fill={T.deep} height={7} rx={2.5} width={14} x={53} y={27} />
    <Circle cx={60} cy={46} fill={T.mid} r={4.4} />
    <Path d="M53 56c1-4 3.6-5.6 7-5.6s6 1.6 7 5.6Z" fill={T.mid} />
    <Path d="M82 66l8 8" stroke={T.deep} strokeLinecap="round" strokeWidth={5} />
    <Circle cx={76} cy={60} fill={T.white} r={9} stroke={T.deep} strokeWidth={3.6} />
  </Scene>
);

/** No stay outs: a packed bag under a crescent moon. */
export const EmptyStayOut: EmptyArt = ({ size }) => (
  <Scene size={size}>
    <Path d="M80 26a12 12 0 1 0 8 20 10 10 0 1 1-8-20Z" fill={T.mid} />
    <Rect fill={T.pale} height={28} rx={5} stroke={T.light} strokeWidth={1.5} width={30} x={44} y={40} />
    <Path d="M52 40v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5" fill="none" stroke={T.deep} strokeWidth={3} />
    <Rect fill={T.mid} height={4} width={30} x={44} y={50} />
    <Rect fill={T.deep} height={6} rx={1.4} width={6} x={56} y={49} />
  </Scene>
);

/**
 * The old 3D empty-state pictures, each mapped to its redraw. EmptyState looks a
 * picture up here first, so every screen passing one gets the vector drawing.
 */
export const EMPTY_ART_FOR_PICTURE = new Map<unknown, EmptyArt>([
  [require("../../assets/empty-states/All-Caught-Up_512x512.png"), EmptyAllCaughtUp],
  [require("../../assets/empty-states/No-Agreement_512x512.png"), EmptyAgreement],
  [require("../../assets/empty-states/No-Beds_512x512.png"), EmptyBeds],
  [require("../../assets/empty-states/No-Bill_512x436.png"), EmptyBill],
  [require("../../assets/empty-states/No-Category_512x512.png"), EmptyCategory],
  [require("../../assets/empty-states/No-Chats-bubbles.png"), EmptyChats],
  [require("../../assets/empty-states/No-Chats_512x512.png"), EmptyChats],
  [require("../../assets/empty-states/No-Expense_512x512.png"), EmptyExpense],
  [require("../../assets/empty-states/No-Location_512x512.png"), EmptyLocation],
  [require("../../assets/empty-states/No-Notice_512x512.png"), EmptyNotice],
  [require("../../assets/empty-states/No-Person_512x512.png"), EmptyPerson],
  [require("../../assets/empty-states/No-Salary_1_512x512.png"), EmptySalary],
  [require("../../assets/empty-states/concern-empty_state.png"), EmptyTray],
  [require("../../assets/empty-states/discovery-empty-search.png"), EmptySearch],
  [require("../../assets/empty-states/enquiries.png"), EmptyEnquiries],
  [require("../../assets/empty-states/food-module-no-items.png"), EmptyFoodItems],
  [require("../../assets/empty-states/food-module-no-profiles.png"), EmptyFoodProfiles],
  [require("../../assets/empty-states/under-construction.png"), EmptyUnderConstruction],
]);
