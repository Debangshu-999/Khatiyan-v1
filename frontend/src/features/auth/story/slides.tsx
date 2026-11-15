import type { ReactNode } from "react";
import { Circle, ClipPath, Defs, Ellipse, G, Image as SvgImage, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import {
  C,
  Caption,
  Card,
  COOK,
  Cloud,
  FIXER,
  FRIEND,
  Key,
  Megaphone,
  OWNER,
  Person,
  phoneInHands,
  Pin,
  Qr,
  Sparkle,
  T,
  TENANT,
  Tick,
} from "./flat";

/**
 * The login and sign-up band (user, 2026-11-14): a slideshow of eight still
 * pictures, one per thing the app does, each a detailed flat illustration on a
 * 390 × 340 stage. Backgrounds run far past the stage so the status bar strip and
 * a wide web window show the scene, never a gap.
 */

const LOGO = require("../../../../assets/icons/brand/logo-light-no-tagline.png");

/** A background colour over the stage and everything around it. */
const Fill = ({ fill, height = 740, y = -400 }: { fill: string; height?: number; y?: number }) => <Rect fill={fill} height={height} width={1190} x={-400} y={y} />;

/** A row of flat buildings, windows lit in `window`. */
function Skyline({ base, color, heights, window, x0 = 0, width = 34 }: { base: number; color: string; heights: number[]; window?: string; width?: number; x0?: number }) {
  return (
    <G>
      {heights.map((h, k) => {
        const x = x0 + k * (width + 4);
        return (
          <G key={k}>
            <Rect fill={color} height={h} width={width} x={x} y={base - h} />
            {window
              ? Array.from({ length: Math.floor((h - 14) / 16) }, (_, r) => (
                  <G key={r}>
                    <Rect fill={window} height={6} rx={1} width={6} x={x + 7} y={base - h + 10 + r * 16} />
                    <Rect fill={window} height={6} rx={1} width={6} x={x + width - 13} y={base - h + 10 + r * 16} />
                  </G>
                ))
              : null}
          </G>
        );
      })}
    </G>
  );
}

/** The PG building: walls, roof band, windows, a door, and the Khatiyan banner. */
function PgBuilding({ lit, x, y, w, h }: { lit?: boolean; x: number; y: number; w: number; h: number }) {
  const cols = 4;
  const rows = 3;
  const winW = (w - 30) / cols - 8;
  const glass = lit ? "#FFD66B" : "#BFE0FA";
  return (
    <G>
      <Rect fill="#F7D9B0" height={h} width={w} x={x} y={y} />
      <Rect fill="#EBC797" height={h} width={w * 0.18} x={x + w * 0.82} y={y} />
      <Rect fill="#E5694A" height={12} width={w + 14} x={x - 7} y={y - 10} />
      <Path d={`M${x + w * 0.28},${y - 10} V${y - 22} M${x + w * 0.72},${y - 10} V${y - 22}`} stroke="#6B4430" strokeWidth={2.4} />
      <Rect fill="#0B1533" height={26} opacity={0.15} rx={6} width={w * 0.66} x={x + w * 0.17 + 2} y={y - 46} />
      <Rect fill={C.white} height={26} rx={6} width={w * 0.66} x={x + w * 0.17} y={y - 48} />
      <T anchor="middle" fill="#1E2A78" size={13} weight={700} x={x + w / 2} y={y - 30.5}>Khatiyan</T>
      {Array.from({ length: cols * rows }, (_, k) => {
        const r = Math.floor(k / cols);
        const c = k % cols;
        if (r === rows - 1 && (c === 1 || c === 2)) return null;
        const wx = x + 15 + c * (winW + 8) + 4;
        const wy = y + 14 + r * ((h - 20) / rows);
        const wh = (h - 20) / rows - 16;
        return (
          <G key={k}>
            <Rect fill={C.white} height={wh + 6} rx={2} width={winW + 6} x={wx - 3} y={wy - 3} />
            <Rect fill={glass} height={wh} rx={1.5} width={winW} x={wx} y={wy} />
            <Rect fill={C.white} height={wh} width={2} x={wx + winW / 2 - 1} y={wy} />
          </G>
        );
      })}
      <Rect fill="#7A4A2E" height={h * 0.3} rx={3} width={w * 0.2} x={x + w * 0.4} y={y + h * 0.7} />
      <Rect fill="#8E5A3A" height={h * 0.3 - 4} rx={2} width={w * 0.2 - 8} x={x + w * 0.4 + 4} y={y + h * 0.7 + 4} />
      <Circle cx={x + w * 0.57} cy={y + h * 0.86} fill={C.yellow} r={2} />
    </G>
  );
}

const Bunting = ({ y }: { y: number }) => (
  <G>
    <Path d={`M-10,${y} Q100,${y + 18} 195,${y + 4} Q290,${y + 18} 400,${y}`} fill="none" stroke="#8A5A3C" strokeWidth={1.4} />
    {[16, 52, 88, 124, 160, 196, 232, 268, 304, 340, 376].map((x, k) => (
      <Path d={`M${x},${y + 6 + Math.sin(k) * 3} l9,15 l9,-15 z`} fill={[C.coral, C.yellow, C.primary, C.green][k % 4]} key={x} />
    ))}
  </G>
);

// ---------- 1. Find a property ----------

function FindAProperty() {
  const phone = phoneInHands({
    cx: 0,
    cy: -112,
    screen: (
      // A map sized to the screen exactly (20.6 × 35.6): blocks, a river, two roads, the pin.
      <G>
        <Rect fill="#E3F1DF" height={35.6} rx={1.4} width={20.6} />
        <Rect fill="#F4EDE0" height={8} rx={0.8} width={7} x={1.6} y={2} />
        <Rect fill="#F4EDE0" height={6} rx={0.8} width={7} x={12} y={3} />
        <Rect fill="#F4EDE0" height={8} rx={0.8} width={6.5} x={1.6} y={24} />
        <Rect fill="#F4EDE0" height={9} rx={0.8} width={6.5} x={12.5} y={24.5} />
        <Path d="M0,18 Q10,14 20.6,19.5" fill="none" stroke="#9CC8F0" strokeWidth={2.4} />
        <Path d="M10.3,0 V35.6 M0,11.5 H20.6" fill="none" stroke={C.white} strokeWidth={1.6} />
        <Pin scale={0.32} shadow={false} x={15.2} y={13} />
      </G>
    ),
  });
  return (
    <>
      <Fill fill="#3E5CA8" />
      <Skyline base={258} color="#5571BE" heights={[110, 150, 90, 130, 170, 120, 100, 140, 160, 96]} x0={-4} width={36} />
      <Skyline base={258} color="#4A66B3" heights={[70, 96, 60, 84, 110, 76, 66, 92, 104, 64]} window="#6E89D3" x0={10} width={34} />
      <Pin scale={0.9} x={60} y={124} />
      <Pin color={C.yellow} scale={0.75} x={176} y={104} />
      <Pin scale={0.7} x={372} y={140} />
      <Fill fill="#30498F" height={500} y={258} />
      <Rect fill="#3A55A0" height={8} width={1190} x={-400} y={258} />
      <Path d="M126,170 Q160,96 200,110" fill="none" stroke={C.white} strokeDasharray="4 5" strokeLinecap="round" strokeWidth={2} />
      <Person held={phone.held} left={phone.left} look={TENANT} over={phone.over(TENANT.skin)} right={phone.right} scale={1.08} x={112} y={304} />
      <Card h={186} w={176} x={200} y={48}>
        <Rect fill="#BFE0FA" height={74} rx={8} width={160} x={208} y={56} />
        <Cloud color="#E8F4FD" scale={0.45} x={220} y={78} />
        <Rect fill="#9ACB86" height={14} width={160} x={208} y={116} />
        <Rect fill="#F7D9B0" height={46} width={62} x={258} y={80} />
        <Rect fill="#E5694A" height={7} width={70} x={254} y={75} />
        {[0, 1, 2].map((c) =>
          [0, 1].map((r) => <Rect fill="#7FB8E6" height={9} key={`${c}${r}`} rx={1} width={11} x={265 + c * 18} y={86 + r * 15} />),
        )}
        <Path d="M352,64 c-3,-4 -9,-2 -8,3 c1,4 8,8 8,8 s7,-4 8,-8 c1,-5 -5,-7 -8,-3 z" fill={C.coral} />
        <T size={14} weight={700} x={210} y={150}>Sunrise PG</T>
        <T fill={C.muted} size={9.5} x={210} y={164}>Salt Lake, Kolkata · 1.2 km</T>
        <T fill="#E2A21F" size={11} weight={700} x={210} y={181}>★★★★★</T>
        <T fill={C.muted} size={9.5} weight={600} x={274} y={180.5}>4.6</T>
        <T size={15} weight={700} x={210} y={202}>₹8,500</T>
        <T fill={C.muted} size={9.5} x={262} y={202}>/ month</T>
        <Rect fill={C.primary} height={18} rx={9} width={160} x={208} y={210} />
        <T anchor="middle" fill={C.white} size={9.5} weight={700} x={288} y={222.5}>Book a visit</T>
      </Card>
      <Card h={28} r={14} w={124} x={16} y={30}>
        <Circle cx={32} cy={44} fill="none" r={5} stroke={C.muted} strokeWidth={1.8} />
        <Path d="M35.6,47.6 L39,51" stroke={C.muted} strokeLinecap="round" strokeWidth={2} />
        <T fill={C.muted} size={10} x={46} y={47.5}>PG near me</T>
      </Card>
      <Caption label="Find a property" n={1} />
    </>
  );
}

// ---------- 2. Visits ----------

function Visits() {
  const phone = phoneInHands({ cx: 30, cy: -150, oneHand: "right", screen: <Qr size={19} x={0.8} y={8.3} /> });
  return (
    <>
      <Fill fill="#9ED3F6" />
      <Cloud x={20} y={60} />
      <Cloud scale={0.7} x={150} y={36} />
      <Ellipse cx={40} cy={262} fill="#5FAE6E" rx={56} ry={40} />
      <Ellipse cx={110} cy={268} fill="#6CBB7A" rx={48} ry={30} />
      <Fill fill="#7BC47F" height={500} y={262} />
      <Path d="M262,262 L298,262 L330,340 L224,340 Z" fill="#E9D9BC" />
      <PgBuilding h={168} w={186} x={206} y={94} />
      <Rect fill="#C46B4A" height={16} rx={3} width={16} x={230} y={248} />
      <Ellipse cx={238} cy={244} fill="#3E9C5C" rx={12} ry={10} />
      <Rect fill="#C46B4A" height={16} rx={3} width={16} x={346} y={248} />
      <Ellipse cx={354} cy={244} fill="#3E9C5C" rx={12} ry={10} />
      <Person left={[-20, -92]} look={OWNER} right={[34, -182]} scale={1.02} x={295} y={302} />
      <Person held={phone.held} look={TENANT} over={phone.over(TENANT.skin)} right={phone.right} scale={1.06} x={128} y={306} />
      <Card h={64} w={156} x={16} y={30}>
        <Qr size={44} x={26} y={40} />
        <T size={11.5} weight={700} x={80} y={54}>Visit booked</T>
        <T fill={C.muted} size={9.5} x={80} y={68}>Today · 11:00 AM</T>
        <Tick r={7} x={156} y={80} />
      </Card>
      <Caption label="Visits" n={2} />
    </>
  );
}

// ---------- 3. Move-ins ----------

function MoveIns() {
  return (
    <>
      <Fill fill="#F4E3CF" />
      {Array.from({ length: 20 }, (_, k) => (
        <Rect fill="#EFD8BE" height={740} key={k} width={10} x={-6 + k * 22} y={-400} />
      ))}
      <Fill fill="#D9A877" height={500} y={258} />
      <Ellipse cx={210} cy={300} fill="#E98B6A" rx={120} ry={18} />
      <Rect fill="#BFE0FA" height={86} width={92} x={26} y={48} />
      <Cloud scale={0.5} x={40} y={86} />
      <Rect fill={C.white} height={4} width={92} x={26} y={89} />
      <Rect fill={C.white} height={86} width={4} x={70} y={48} />
      <Rect fill="#8A5A3C" height={4} rx={2} width={118} x={13} y={42} />
      <Path d="M16,44 Q30,90 18,142 L36,142 Q40,90 34,44 Z M128,44 Q114,90 126,142 L108,142 Q104,90 110,44 Z" fill="#F09A8A" />
      <Rect fill="#B9825A" height={70} rx={4} width={14} x={10} y={190} />
      <Rect fill="#C9936A" height={18} width={146} x={10} y={240} />
      <Rect fill={C.white} height={20} rx={6} width={138} x={18} y={222} />
      <Path d="M62,218 H156 V244 H56 Q52,230 62,218 Z" fill="#6F8FE0" />
      <Ellipse cx={38} cy={222} fill="#F7F7F7" rx={18} ry={8} />
      <Rect fill="#7A5A3C" height={140} width={4} x={364} y={118} />
      <Path d="M350,118 H382 L374,98 H358 Z" fill={C.yellow} />
      <Ellipse cx={366} cy={260} fill="#7A5A3C" rx={14} ry={4} />
      <Card h={88} w={92} x={150} y={24}>
        <T size={10.5} weight={700} x={160} y={42}>Agreement</T>
        {[52, 60, 68].map((y) => (
          <Rect fill="#E3E8F0" height={3.5} key={y} rx={1.5} width={y === 68 ? 46 : 70} x={160} y={y} />
        ))}
        <Path d="M160,96 q8,-12 14,0 t14,-2 q6,-4 10,2" fill="none" stroke={C.primary} strokeWidth={1.6} />
        <Tick r={9} x={222} y={92} />
      </Card>
      <Person held={<Key angle={-10} x={36} y={-116} />} look={OWNER} right={[30, -112]} scale={1.05} x={150} y={304} />
      <Person
        held={
          <G>
            <Rect fill="#2F9E9B" height={52} rx={6} width={34} x={18} y={-62} />
            <Rect fill="#268582" height={52} rx={6} width={10} x={42} y={-62} />
            <Rect fill="none" height={12} rx={3} stroke="#1E5F5D" strokeWidth={3} width={14} x={28} y={-72} />
            <Circle cx={24} cy={-8} fill={C.navy} r={3} />
            <Circle cx={46} cy={-8} fill={C.navy} r={3} />
          </G>
        }
        left={[-30, -110]}
        look={FRIEND}
        mood="open"
        right={[35, -70]}
        scale={1.05}
        x={262}
        y={304}
      />
      <Sparkle scale={0.8} x={206} y={168} />
      <Sparkle scale={0.5} x={222} y={152} />
      <Caption label="Move-ins" n={3} />
    </>
  );
}

// ---------- 4. Rent payments ----------

function RentPayments() {
  const tenantPhone = phoneInHands({
    cx: 0,
    cy: -112,
    screen: (
      <G>
        <Rect fill={C.primary} height={7} rx={3.5} width={17} x={2} y={26} />
      </G>
    ),
  });
  const ownerPhone = phoneInHands({ cx: 0, cy: -112, screen: <Tick r={6} x={10.5} y={16} /> });
  return (
    <>
      <Fill fill="#E4EEFC" />
      <Rect fill="#D3E2F8" height={200} rx={6} width={170} x={110} y={-10} />
      <Fill fill="#C7D7F0" height={500} y={262} />
      <Rect fill="#B9CBEA" height={8} width={1190} x={-400} y={262} />
      <Card h={78} r={10} w={66} x={162} y={18}>
        <Rect fill="#E5484D" height={20} rx={10} width={66} x={162} y={18} />
        <Rect fill="#E5484D" height={10} width={66} x={162} y={28} />
        <T anchor="middle" fill={C.white} size={10} weight={700} x={195} y={32.5}>DEC</T>
        <T anchor="middle" size={30} weight={700} x={195} y={80}>1</T>
      </Card>
      <Card h={78} w={128} x={16} y={30}>
        <T fill={C.muted} size={9.5} x={28} y={50}>Rent · December</T>
        <T size={20} weight={700} x={28} y={76}>₹8,500</T>
        <Rect fill={C.primary} height={18} rx={9} width={104} x={28} y={84} />
        <T anchor="middle" fill={C.white} size={9.5} weight={700} x={80} y={96.5}>Pay now</T>
      </Card>
      <Card h={78} w={128} x={246} y={30}>
        <Tick r={10} x={266} y={54} />
        <T fill={C.green} size={11} weight={700} x={282} y={57}>Received</T>
        <T size={20} weight={700} x={258} y={88}>₹8,500</T>
        <T fill={C.muted} size={9} x={258} y={101}>Room 2B · on time</T>
      </Card>
      <Person held={tenantPhone.held} left={tenantPhone.left} look={TENANT} over={tenantPhone.over(TENANT.skin)} right={tenantPhone.right} scale={1.06} x={98} y={306} />
      <Person held={ownerPhone.held} left={ownerPhone.left} look={OWNER} over={ownerPhone.over(OWNER.skin)} right={ownerPhone.right} scale={1.06} x={292} y={306} />
      {/* The payment on its way (user, 2026-11-14): a chain of rupee arrows from the
          tenant's phone to the owner's, faint to strong in the direction it goes. */}
      <Path d="M128,190 H262" stroke={C.green} strokeDasharray="3 5" strokeLinecap="round" strokeOpacity={0.55} strokeWidth={2} />
      {[148, 194, 240].map((x, k) => (
        <G key={x} opacity={0.55 + k * 0.225} transform={`translate(${x} 190)`}>
          <Path d="M-13,-10 H4 Q6,-10 7.4,-8.6 L14,-1.6 Q15.4,0 14,1.6 L7.4,8.6 Q6,10 4,10 H-13 Q-17,10 -17,6 V-6 Q-17,-10 -13,-10 Z" fill={C.green} />
          <T anchor="middle" fill={C.white} size={12} weight={700} x={-3} y={4.4}>₹</T>
        </G>
      ))}
      <Caption label="Rent payments" n={4} />
    </>
  );
}

// ---------- 5. Meals ----------

function Meals() {
  const phone = phoneInHands({ cx: 34, cy: -152, oneHand: "right", screen: <Qr size={19} x={0.8} y={8.3} /> });
  return (
    <>
      <Fill fill="#FFE6C4" />
      {Array.from({ length: 22 }, (_, k) => (
        <Rect fill={k % 2 ? "#F8D7A8" : "#FBDFB6"} height={56} key={k} width={18} x={k * 18} y={150} />
      ))}
      <Bunting y={4} />
      <Rect fill="#8A5A3C" height={96} rx={6} width={140} x={14} y={30} />
      <Rect fill="#2F4F43" height={84} rx={3} width={128} x={20} y={36} />
      <T fill="#F8FAF0" size={11} weight={600} x={30} y={56}>{"Today's lunch"}</T>
      <T fill="#DDE7DF" size={9.5} x={30} y={74}>Rice · Dal · Paneer</T>
      <T fill="#DDE7DF" size={9.5} x={30} y={90}>Roti · Salad</T>
      <T fill={C.yellow} size={9.5} x={30} y={106}>Kheer</T>
      <Person
        held={
          <G>
            <Path d="M30,-132 L44,-162" stroke="#9AA6B8" strokeLinecap="round" strokeWidth={3} />
            <Ellipse cx={45} cy={-165} fill="#9AA6B8" rx={7} ry={4.5} />
          </G>
        }
        left={[-24, -112]}
        look={COOK}
        right={[30, -132]}
        scale={1.05}
        x={282}
        y={302}
      />
      <Path d="M318,186 H384 V222 Q351,230 318,222 Z" fill="#A8B3C2" />
      <Rect fill="#8B97A8" height={6} rx={3} width={74} x={314} y={182} />
      {[330, 348, 366].map((x) => (
        <Path d={`M${x},176 q-5,-7 0,-14 q5,-7 0,-14`} fill="none" key={x} stroke={C.white} strokeLinecap="round" strokeOpacity={0.9} strokeWidth={2.4} />
      ))}
      <Rect fill="#E2AE79" height={12} width={1190} x={-400} y={222} />
      <Fill fill="#C98A55" height={500} y={234} />
      {[60, 150, 240, 330].map((x) => (
        <Rect fill="#B97A47" height={106} key={x} width={3} x={x} y={234} />
      ))}
      <Ellipse cx={232} cy={220} fill={C.white} rx={30} ry={7} />
      <Ellipse cx={220} cy={216} fill="#F2C94C" rx={7} ry={3.2} />
      <Ellipse cx={236} cy={215} fill={C.coral} rx={7} ry={3.2} />
      <Ellipse cx={250} cy={217} fill="#7BC47F" rx={6} ry={3} />
      <Path d="M210,214 q8,-10 16,0 Z" fill="#FFF8E7" />
      <Path d="M226,206 q-4,-6 0,-12 M238,206 q4,-6 0,-12" fill="none" stroke={C.white} strokeLinecap="round" strokeWidth={2} />
      <Path d="M166,222 l8,-10 h12 l8,10 Z" fill="#5B6577" />
      <Rect fill="#1B2340" height={46} rx={7} width={50} x={155} y={168} />
      <Rect fill={C.greenSoft} height={36} rx={4} width={40} x={160} y={173} />
      <Tick r={8} x={180} y={186} />
      <T anchor="middle" fill={C.green} size={7.5} weight={700} x={180} y={204}>Lunch</T>
      <Person held={phone.held} look={TENANT} over={phone.over(TENANT.skin)} right={phone.right} scale={1.06} x={86} y={330} />
      <Caption label="Meals" n={5} />
    </>
  );
}

// ---------- 6. Notices ----------

function Notices() {
  const phone = phoneInHands({ cx: 0, cy: -112, screen: <Megaphone scale={0.5} x={10.5} y={16} /> });
  return (
    <>
      <Fill fill="#DCE7F6" />
      <Fill fill="#BAC6D8" height={500} y={262} />
      <Rect fill="#A9B6CB" height={6} width={1190} x={-400} y={262} />
      {[[-6, "101"], [338, "104"]].map(([x, label]) => (
        <G key={String(label)}>
          <Rect fill="#9A6B4A" height={150} width={58} x={x as number} y={112} />
          <Rect fill="#875A3C" height={150} width={10} x={(x as number) + 48} y={112} />
          <Rect fill={C.white} height={16} rx={4} width={32} x={(x as number) + 13} y={128} />
          <T anchor="middle" size={9.5} weight={700} x={(x as number) + 29} y={139.5}>{label as string}</T>
        </G>
      ))}
      <Rect fill="#8A5A3C" height={128} rx={6} width={164} x={112} y={34} />
      <Rect fill="#D9A066" height={114} rx={3} width={150} x={119} y={41} />
      <G transform="rotate(-6 146 76)">
        <Rect fill="#FFE38A" height={40} width={40} x={128} y={54} />
        {[66, 74, 82].map((y) => (
          <Rect fill="#E2C25E" height={3} key={y} width={26} x={134} y={y} />
        ))}
      </G>
      <G transform="rotate(5 150 128)">
        <Rect fill="#CFE3FB" height={42} width={44} x={128} y={106} />
        {[118, 126, 134].map((y) => (
          <Rect fill="#A8C6EE" height={3} key={y} width={30} x={135} y={y} />
        ))}
      </G>
      <G transform="rotate(3 228 96)">
        <Rect fill={C.white} height={88} width={70} x={192} y={52} />
        <Rect fill="#E5484D" height={18} width={70} x={192} y={52} />
        <T anchor="middle" fill={C.white} size={9} weight={700} x={227} y={64.5}>NOTICE</T>
        <T anchor="middle" size={10} weight={600} x={227} y={92}>Water off</T>
        <T anchor="middle" fill="#E5484D" size={12} weight={700} x={227} y={112}>2 – 4 PM</T>
        <Rect fill="#E3E8F0" height={3} width={46} x={204} y={124} />
      </G>
      <Circle cx={227} cy={55} fill="#E5484D" r={4} />
      <Circle cx={146} cy={56} fill={C.primary} r={3} />
      <Circle cx={150} cy={108} fill={C.green} r={3} />
      <Person left={[-20, -92]} look={OWNER} right={[28, -178]} scale={1.03} x={96} y={304} />
      <Person held={phone.held} left={phone.left} look={TENANT} over={phone.over(TENANT.skin)} right={phone.right} scale={1.03} x={318} y={304} />
      <Card h={46} w={110} x={278} y={40}>
        <Circle cx={298} cy={63} fill="#FFF3C4" r={12} />
        <Megaphone scale={0.62} x={298} y={63} />
        <T size={10} weight={700} x={316} y={59}>New notice</T>
        <T fill={C.muted} size={8.5} x={316} y={73}>Water off 2–4</T>
      </Card>
      <Caption label="Notices" n={6} />
    </>
  );
}

// ---------- 7. Concerns ----------

function Concerns() {
  const phone = phoneInHands({ cx: 0, cy: -112, screen: <Tick r={6} x={10.5} y={16} /> });
  return (
    <>
      <Fill fill="#D8F0EC" />
      {Array.from({ length: 18 }, (_, k) => (
        <Rect fill="#C3E5DF" height={740} key={`v${k}`} width={1.5} x={k * 26} y={-400} />
      ))}
      {Array.from({ length: 12 }, (_, k) => (
        <Rect fill="#C3E5DF" height={1.5} key={`h${k}`} width={1190} x={-400} y={k * 26} />
      ))}
      <Fill fill="#A9D3CD" height={500} y={262} />
      <Rect fill="#97C6BF" height={6} width={1190} x={-400} y={262} />
      <Rect fill="#B7DDF5" height={78} rx={12} width={88} x={156} y={30} />
      <Path d="M172,50 l16,-12 M172,66 l30,-24" stroke={C.white} strokeLinecap="round" strokeOpacity={0.8} strokeWidth={4} />
      <Rect fill="#EEF3F7" height={100} rx={4} width={22} x={189} y={162} />
      <Path d="M144,148 H256 V156 Q200,184 144,156 Z" fill={C.white} />
      <Rect fill="#DCE3EA" height={6} width={112} x={144} y={148} />
      <Path d="M196,148 V130 Q196,124 204,124 H214 Q220,124 220,130 V136" fill="none" stroke="#9AA6B8" strokeLinecap="round" strokeWidth={6} />
      <Rect fill="#5B8DEF" height={6} rx={2} width={14} x={189} y={118} />
      <Sparkle scale={0.9} x={232} y={118} />
      <Sparkle scale={0.55} x={248} y={136} />
      <Rect fill="#E5484D" height={26} rx={4} width={44} x={318} y={258} />
      <Rect fill="none" height={10} rx={3} stroke="#B7363B" strokeWidth={3} width={18} x={331} y={250} />
      <Person
        held={
          <G transform="translate(-58 -150) rotate(-30)">
            <Rect fill="#7C8798" height={22} rx={2} width={5} x={-2.5} y={0} />
            <Path d="M-7,-2 q7,-10 14,0 l-3,4 h-8 z" fill="#9AA6B8" />
          </G>
        }
        left={[-56, -150]}
        look={FIXER}
        right={[24, -92]}
        scale={1.06}
        x={272}
        y={304}
      />
      <Person held={phone.held} left={phone.left} look={TENANT} over={phone.over(TENANT.skin)} right={phone.right} scale={1.03} x={80} y={304} />
      <Card h={70} w={136} x={14} y={30}>
        <T size={11} weight={700} x={26} y={50}>CON-0023</T>
        <T fill={C.muted} size={9} x={26} y={64}>Leaking tap · Washroom</T>
        <Rect fill={C.greenSoft} height={16} rx={8} width={76} x={26} y={74} />
        <T anchor="middle" fill={C.green} size={8.5} weight={700} x={64} y={85}>RESOLVED ✓</T>
      </Card>
      <Caption label="Concerns" n={7} />
    </>
  );
}

// ---------- 8. And much more ----------

function AndMuchMore() {
  return (
    <>
      <Defs>
        <LinearGradient gradientUnits="userSpaceOnUse" id="slideDusk" x1="0" x2="0" y1="-60" y2="270">
          <Stop offset="0" stopColor="#1E2A5E" />
          <Stop offset="0.5" stopColor="#4B4A8F" />
          <Stop offset="0.82" stopColor="#E58C7A" />
          <Stop offset="1" stopColor="#FFC994" />
        </LinearGradient>
        <RadialGradient cx="50%" cy="50%" id="slideGlow" r="50%">
          <Stop offset="0" stopColor="#FFE7A8" stopOpacity="0.95" />
          <Stop offset="0.55" stopColor="#FFD08A" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#FFD08A" stopOpacity="0" />
        </RadialGradient>
        <Pattern height="12" id="slideBricks" patternUnits="userSpaceOnUse" width="20">
          <Rect fill="#A85A43" height="12" width="20" />
          <Path d="M0,6 H20 M0,12 H20 M5,0 V6 M15,6 V12" stroke="#7E3B2B" strokeWidth={1} />
        </Pattern>
        <ClipPath id="slideIconBox">
          <Rect height={58} width={56} x={-28} y={-30} />
        </ClipPath>
      </Defs>
      <Rect fill="url(#slideDusk)" height={740} width={1190} x={-400} y={-400} />
      {[[30, 30], [80, 18], [140, 40], [250, 22], [300, 46], [356, 28], [110, 70], [330, 80]].map(([x, y]) => (
        <Circle cx={x} cy={y} fill={C.white} key={`${x}`} opacity={0.8} r={1.4} />
      ))}
      <Circle cx={195} cy={54} fill="url(#slideGlow)" r={104} />
      <G transform="translate(195 54)">
        <Rect fill="#0B1533" height={74} opacity={0.18} rx={20} width={74} x={-35} y={-33} />
        <Rect fill={C.white} height={74} rx={20} width={74} x={-37} y={-37} />
        <G clipPath="url(#slideIconBox)">
          <SvgImage height={87.2} href={LOGO} width={102.4} x={-51.25} y={-35.44} />
        </G>
      </G>
      <Skyline base={276} color="#3A3F7E" heights={[86, 120, 70, 110]} window="#FFD66B" x0={-20} width={30} />
      <Skyline base={276} color="#3A3F7E" heights={[100, 76, 124, 90]} window="#FFD66B" x0={290} width={28} />
      <PgBuilding h={146} lit w={176} x={107} y={130} />
      {[[-400, 507], [283, 507]].map(([x, width]) => (
        <G key={x}>
          <Rect fill="url(#slideBricks)" height={34} width={width} x={x} y={242} />
          <Rect fill="#C9B8A6" height={6} width={width} x={x} y={238} />
        </G>
      ))}
      <Fill fill="#3A3352" height={500} y={276} />
      <Rect fill="#4A4266" height={6} width={1190} x={-400} y={276} />
      {[38, 352].map((x) => (
        <G key={x}>
          <Circle cx={x} cy={204} fill="#FFD66B" opacity={0.3} r={16} />
          <Rect fill="#262040" height={72} width={3} x={x - 1.5} y={206} />
          <Path d={`M${x - 8},208 h16 l-3,-9 h-10 z`} fill="#FFE08A" />
        </G>
      ))}
      {/* Five of them to the right of the caption, waving. */}
      <Person left={[-30, -180]} look={TENANT} right={[22, -92]} scale={0.74} x={182} y={312} />
      <Person left={[-22, -92]} look={COOK} right={[22, -92]} scale={0.74} x={224} y={312} />
      <Person left={[-30, -180]} look={OWNER} right={[20, -92]} scale={0.74} x={268} y={312} />
      <Person left={[-20, -92]} look={FRIEND} right={[30, -180]} scale={0.74} x={312} y={312} />
      <Person left={[-22, -92]} look={FIXER} right={[30, -180]} scale={0.74} x={356} y={312} />
      <Caption label="And much more" n="+" />
    </>
  );
}

export type Slide = { Draw: () => ReactNode; name: string };

export const SLIDES: readonly Slide[] = [
  { Draw: FindAProperty, name: "Find a property" },
  { Draw: Visits, name: "Visits" },
  { Draw: MoveIns, name: "Move-ins" },
  { Draw: RentPayments, name: "Rent payments" },
  { Draw: Meals, name: "Meals" },
  { Draw: Notices, name: "Notices" },
  { Draw: Concerns, name: "Concerns" },
  { Draw: AndMuchMore, name: "And much more" },
];
