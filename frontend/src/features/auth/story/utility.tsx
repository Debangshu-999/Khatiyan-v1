import type { ReactNode } from "react";
import { Circle, G, Path, Rect } from "react-native-svg";

import { C, Card, FRIEND, Key, OWNER, Person, Phone, phoneInHands, Sparkle, T, TENANT, Tick, tone } from "./flat";
import { A, K, track, type Keyframes } from "./timeline";

/**
 * One short scene per auth utility screen (user, 2026-11-14): email sign-in,
 * account provisioned, OTP verification, PIN setup, forgot PIN, reset OTP and the
 * new PIN. Each plays once (about two and a half seconds) and holds its last frame.
 */

export const UTILITY_MS = 2600;

const Fill = ({ fill, height = 740, y = -400 }: { fill: string; height?: number; y?: number }) => <Rect fill={fill} height={height} width={1190} x={-400} y={y} />;
const Floor = ({ fill, y = 262 }: { fill: string; y?: number }) => (
  <>
    <Fill fill={fill} height={500} y={y} />
    <Rect fill={tone(fill, -0.08)} height={6} width={1190} x={-400} y={y} />
  </>
);

const pop = (delay: number, dur = 320) => track(K.pop, dur, delay, { steps: 3 });

/** Six code boxes; each digit pops in on its turn. */
function CodeBoxes({ digits, every, from, x, y }: { digits: string; every: number; from: number; x: number; y: number }) {
  return (
    <G>
      {digits.split("").map((digit, k) => (
        <G key={k}>
          <Rect fill="#EEF3FB" height={26} rx={6} width={20} x={x + k * 25} y={y} />
          <A origin={[x + k * 25 + 10, y + 13]} track={pop(from + k * every, 220)}>
            <T anchor="middle" size={14} weight={700} x={x + k * 25 + 10} y={y + 18}>{digit}</T>
          </A>
        </G>
      ))}
    </G>
  );
}

/** Six PIN dots filling in turn. */
function PinDots({ every, from, x, y }: { every: number; from: number; x: number; y: number }) {
  return (
    <G>
      {Array.from({ length: 6 }, (_, k) => (
        <G key={k}>
          <Circle cx={x + k * 16} cy={y} fill="none" r={5} stroke="#B7C3D6" strokeWidth={1.6} />
          <A origin={[x + k * 16, y]} track={pop(from + k * every, 200)}>
            <Circle cx={x + k * 16} cy={y} fill={C.primary} r={5} />
          </A>
        </G>
      ))}
    </G>
  );
}

/** A padlock whose shackle drops shut (or lifts open) on its track. */
function Lock({ shackle, x, y, scale = 1, color = C.yellow }: { color?: string; scale?: number; shackle: ReturnType<typeof track>; x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <A track={shackle}>
        <Path d="M-11,-2 V-16 Q-11,-29 0,-29 Q11,-29 11,-16 V-2" fill="none" stroke="#9AA6B8" strokeLinecap="round" strokeWidth={5.5} />
      </A>
      <Rect fill={color} height={28} rx={6} width={34} x={-17} y={-6} />
      <Rect fill={tone(color, -0.15)} height={28} rx={6} width={10} x={7} y={-6} />
      <Circle cx={0} cy={5} fill={tone(color, -0.5)} r={3.6} />
      <Rect fill={tone(color, -0.5)} height={7} rx={1} width={3} x={-1.5} y={7} />
    </G>
  );
}

const SHUT: Keyframes = [[0, { ty: -12 }], [1, { ty: 0 }]];
const LIFT: Keyframes = [[0, { ty: 0 }], [1, { ty: -12 }]];

// ---------- email sign-in ----------

function EmailLogin() {
  const phone = phoneInHands({ cx: 0, cy: -112, screen: <G><Rect fill={C.coral} height={9} rx={2} width={13} x={4} y={14} /><Path d="M4,14 L10.5,19 L17,14" fill="none" stroke={C.white} strokeWidth={1.2} /></G> });
  const fly: Keyframes = [[0, { o: 0, s: 1, tx: 0, ty: 0 }], [0.15, { o: 1 }], [0.55, { s: 0.8, tx: 110, ty: -40 }], [1, { o: 0, s: 0.3, tx: 194, ty: 96 }]];
  return (
    <>
      <Fill fill="#3E5CA8" />
      <Rect fill="#4A66B3" height={120} width={1190} x={-400} y={142} />
      <Floor fill="#30498F" y={262} />
      {[[40, 60], [300, 40], [350, 120], [120, 30]].map(([x, y], k) => (
        <A key={k} origin={[x, y]} track={pop(200 + k * 150)}>
          <Sparkle color="#8EA6E6" scale={0.6} x={x} y={y} />
        </A>
      ))}
      <Person held={phone.held} left={phone.left} look={TENANT} over={phone.over(TENANT.skin)} right={phone.right} scale={1.06} x={276} y={306} />
      <A track={track(fly, 1100, 200, { steps: 8 })}>
        <G transform="translate(52 110)">
          <Rect fill="#0B1533" height={40} opacity={0.15} rx={5} width={60} x={2} y={4} />
          <Rect fill={C.white} height={40} rx={5} width={60} />
          <Path d="M0,4 L30,24 L60,4" fill="none" stroke="#D7DFEB" strokeWidth={2.4} />
          <Circle cx={30} cy={26} fill={C.coral} r={8} />
          <T anchor="middle" fill={C.white} size={10} weight={700} x={30} y={29.5}>@</T>
        </G>
      </A>
      <A origin={[150, 76]} track={pop(1450)}>
        <Card h={64} w={168} x={66} y={44}>
          <Circle cx={88} cy={66} fill={C.coral} r={11} />
          <T anchor="middle" fill={C.white} size={11} weight={700} x={88} y={70}>@</T>
          <T size={11} weight={700} x={106} y={63}>Check your inbox</T>
          <T fill={C.muted} size={9} x={106} y={77}>We sent a sign-in code</T>
          <Tick r={7} x={214} y={94} />
        </Card>
      </A>
    </>
  );
}

// ---------- account provisioned ----------

function AccountProvisioned() {
  const pass: Keyframes = [[0, { r: 0, tx: 0, ty: 0 }], [0.5, { r: -12, tx: 44, ty: -16 }], [1, { r: 0, tx: 88, ty: 0 }]];
  return (
    <>
      <Fill fill="#F6E3CC" />
      {Array.from({ length: 20 }, (_, k) => (
        <Rect fill="#F1D9BC" height={740} key={k} width={10} x={-6 + k * 22} y={-400} />
      ))}
      <Floor fill="#D9A877" y={258} />
      <Rect fill="#7A4A2E" height={150} rx={4} width={70} x={160} y={110} />
      <Rect fill="#8E5A3A" height={142} rx={3} width={62} x={164} y={116} />
      <Circle cx={216} cy={190} fill={C.yellow} r={3} />
      <Rect fill={C.white} height={16} rx={4} width={34} x={178} y={124} />
      <T anchor="middle" size={9.5} weight={700} x={195} y={135.5}>2B</T>
      <Person look={OWNER} right={[34, -112]} scale={1.05} x={110} y={304} />
      <Person left={[-34, -112]} look={TENANT} mood="open" scale={1.05} x={286} y={304} />
      <A track={track(pass, 900, 300, { steps: 7 })}>
        <G transform="translate(150 175)">
          <Rect fill="#0B1533" height={30} opacity={0.15} rx={4} width={40} x={-18} y={-12} />
          <Rect fill={C.white} height={30} rx={4} width={40} x={-20} y={-15} />
          <Rect fill={C.primary} height={8} rx={2} width={40} x={-20} y={-15} />
          <Circle cx={-9} cy={3} fill={TENANT.skin} r={5} />
          <Rect fill="#D7DFEB" height={3} rx={1.5} width={16} x={0} y={-1} />
          <Rect fill="#D7DFEB" height={3} rx={1.5} width={12} x={0} y={5} />
        </G>
      </A>
      <A origin={[195, 56]} track={pop(1400)}>
        <Card h={56} w={170} x={110} y={28}>
          <Tick r={11} x={134} y={56} />
          <T size={12} weight={700} x={152} y={52}>Account ready</T>
          <T fill={C.muted} size={9} x={152} y={66}>Your owner set it up</T>
        </Card>
      </A>
      {[[80, 60, 1550], [312, 50, 1650], [60, 120, 1750], [336, 120, 1600]].map(([x, y, d]) => (
        <A key={`${x}`} origin={[x, y]} track={pop(d)}>
          <Sparkle color={x < 195 ? C.coral : C.primary} scale={0.8} x={x} y={y} />
        </A>
      ))}
    </>
  );
}

// ---------- OTP verification (account setup) ----------

function SetupOtp() {
  const phone = phoneInHands({ cx: 0, cy: -112, screen: <Rect fill={C.primary} height={10} rx={3} width={17} x={2} y={14} /> });
  return (
    <>
      <Fill fill="#DCEBFF" />
      <Rect fill="#CFE0FA" height={150} rx={75} width={150} x={-40} y={30} />
      <Floor fill="#C3D5F2" y={262} />
      <Person held={phone.held} left={phone.left} look={TENANT} over={phone.over(TENANT.skin)} right={phone.right} scale={1.06} x={104} y={306} />
      <A origin={[278, 110]} track={pop(150)}>
        <Card h={110} w={176} x={190} y={50}>
          <Circle cx={208} cy={70} fill={C.primary} r={8} />
          <T fill={C.white} size={9} weight={700} anchor="middle" x={208} y={73}>K</T>
          <T size={10.5} weight={700} x={222} y={74}>Your Khatiyan code</T>
          <CodeBoxes digits="482916" every={170} from={450} x={202} y={90} />
          <T fill={C.muted} size={8.5} x={202} y={140}>Valid for 10 minutes</T>
        </Card>
      </A>
      <Path d="M150,170 Q170,150 190,140" fill="none" stroke={C.primary} strokeDasharray="4 5" strokeLinecap="round" strokeWidth={2} />
      <A origin={[340, 190]} track={pop(1650)}>
        <G transform="translate(340 196)">
          <Path d="M0,-24 L20,-16 V0 Q20,16 0,24 Q-20,16 -20,0 V-16 Z" fill={C.green} />
          <Path d="M-8,0 L-2,6 L9,-6" fill="none" stroke={C.white} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} />
        </G>
      </A>
    </>
  );
}

// ---------- PIN setup ----------

function SetupPin() {
  return (
    <>
      <Fill fill="#E9E3FF" />
      <Floor fill="#D6CDF7" y={262} />
      <Phone cx={120} cy={146} h={200} w={112} />
      <T anchor="middle" size={10.5} weight={700} x={120} y={78}>Create your PIN</T>
      <PinDots every={180} from={250} x={80} y={98} />
      {Array.from({ length: 12 }, (_, k) => {
        const r = Math.floor(k / 3);
        const c = k % 3;
        const label = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"][k];
        if (!label) return null;
        return (
          <G key={k}>
            <Circle cx={92 + c * 28} cy={130 + r * 28} fill="#DDE5F3" r={11} />
            <T anchor="middle" size={10} weight={600} x={92 + c * 28} y={134 + r * 28}>{label}</T>
          </G>
        );
      })}
      <Person left={[-40, -150]} look={FRIEND} scale={1.05} x={290} y={306} />
      <Lock shackle={track(SHUT, 300, 1500, { steps: 3 })} x={330} y={74} />
      <A origin={[352, 56]} track={pop(1800)}>
        <Tick r={10} x={352} y={56} />
      </A>
    </>
  );
}

// ---------- forgot PIN ----------

function ForgotPin() {
  return (
    <>
      <Fill fill="#FFF1D6" />
      <Floor fill="#F2D9A8" y={262} />
      <Person left={[-12, -184]} look={TENANT} mood="think" scale={1.08} x={120} y={306} />
      {[[170, 120, 6, 200], [186, 100, 9, 350]].map(([x, y, r, d]) => (
        <A key={`${x}`} origin={[x, y]} track={pop(d)}>
          <Circle cx={x} cy={y} fill={C.white} r={r} />
        </A>
      ))}
      <A origin={[278, 74]} track={pop(500)}>
        <G>
          <Path d="M206,82 Q196,50 230,42 Q246,16 280,26 Q314,14 334,40 Q366,46 358,78 Q370,108 336,114 Q314,132 282,120 Q250,132 228,116 Q196,112 206,82 Z" fill={C.white} />
          <Lock shackle={track(LIFT, 1, 0)} scale={0.9} x={252} y={78} />
          <T anchor="middle" fill={C.coral} size={30} weight={700} x={306} y={90}>?</T>
        </G>
      </A>
      <A origin={[318, 168]} track={pop(1500)}>
        <Card h={46} w={132} x={252} y={146}>
          <Key x={276} y={169} />
          <T size={10.5} weight={700} x={304} y={166}>Reset it</T>
          <T fill={C.muted} size={8.5} x={304} y={179}>with a code</T>
        </Card>
      </A>
    </>
  );
}

// ---------- reset OTP ----------

function ResetOtp() {
  const phone = phoneInHands({ cx: 0, cy: -112, screen: <Key scale={0.5} x={7} y={18} /> });
  const keyIn: Keyframes = [[0, { o: 0, tx: -40 }], [0.2, { o: 1 }], [0.7, { tx: 0 }], [1, { r: 90, tx: 0 }]];
  return (
    <>
      <Fill fill="#E0F4EE" />
      <Floor fill="#BFE3D7" y={262} />
      <Person held={phone.held} left={phone.left} look={TENANT} over={phone.over(TENANT.skin)} right={phone.right} scale={1.06} x={300} y={306} />
      <Card h={92} w={176} x={20} y={40}>
        <T size={10.5} weight={700} x={34} y={62}>Reset code</T>
        <CodeBoxes digits="730514" every={150} from={200} x={34} y={74} />
        <T fill={C.muted} size={8.5} x={34} y={120}>Sent to +91 ••••• 43210</T>
      </Card>
      <Lock shackle={track(LIFT, 300, 1900, { steps: 3 })} color="#7BC47F" scale={1.4} x={120} y={210} />
      <A track={track(keyIn, 700, 1150, { steps: 6 })}>
        <Key scale={1.1} x={60} y={218} />
      </A>
      <A origin={[170, 176]} track={pop(2100)}>
        <Sparkle x={170} y={176} />
      </A>
    </>
  );
}

// ---------- new PIN ----------

function NewPin() {
  const spin: Keyframes = [[0, { r: 0 }], [1, { r: 360 }]];
  return (
    <>
      <Fill fill="#E7EEFF" />
      <Floor fill="#CCD9F6" y={262} />
      <A origin={[140, 120]} track={track(spin, 1200, 0, { steps: 12 })}>
        <Path d="M96,120 A44,44 0 0 1 176,94" fill="none" stroke={C.primary} strokeLinecap="round" strokeWidth={6} />
        <Path d="M170,82 L182,96 L164,100 Z" fill={C.primary} />
        <Path d="M184,120 A44,44 0 0 1 104,146" fill="none" stroke={C.primary} strokeLinecap="round" strokeWidth={6} />
        <Path d="M110,158 L98,144 L116,140 Z" fill={C.primary} />
      </A>
      <Lock shackle={track(SHUT, 300, 1700, { steps: 3 })} scale={1.3} x={140} y={130} />
      <Card h={38} w={140} x={70} y={196}>
        <PinDots every={140} from={600} x={100} y={215} />
      </Card>
      <Person left={[-22, -92]} look={OWNER} right={[30, -178]} scale={1.04} x={300} y={306} />
      <A origin={[170, 92]} track={pop(1950)}>
        <Tick r={11} x={170} y={92} />
      </A>
    </>
  );
}

export type UtilityScene = { Draw: () => ReactNode; name: string };

/** Which scene each auth screen plays. Login and sign-up show the slideshow instead. */
export const UTILITY_SCENES: Record<string, UtilityScene> = {
  activate: { Draw: AccountProvisioned, name: "Account provisioned" },
  emailLogin: { Draw: EmailLogin, name: "Email sign-in" },
  resetOtp: { Draw: ResetOtp, name: "Reset code" },
  resetPin: { Draw: NewPin, name: "New PIN" },
  resetRequest: { Draw: ForgotPin, name: "Forgot PIN" },
  setupOtp: { Draw: SetupOtp, name: "OTP verification" },
  setupPin: { Draw: SetupPin, name: "PIN setup" },
};
