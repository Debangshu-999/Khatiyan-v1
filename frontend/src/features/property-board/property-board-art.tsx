import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * The property board's banner, drawn (user, 2026-11-15): it replaces the cork
 * board photo-illustration. A wooden frame, cork, four pinned papers (a
 * handwritten note, a timetable, a small blue note with a sprig, a reminder with
 * a bell and a curled corner) and a leafy branch at the corner. Lines stand in
 * for writing, so nothing depends on a font.
 *
 * Drawn on a 324 x 200 canvas (the banner's 1.62 ratio) and scaled to fill.
 */
export function PropertyBoardArt() {
  return (
    <Svg height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 324 200" width="100%">
      <Defs>
        <LinearGradient id="pbWall" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FCF8F2" />
          <Stop offset="1" stopColor="#F4ECE1" />
        </LinearGradient>
        <LinearGradient id="pbWood" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#E2C29C" />
          <Stop offset="1" stopColor="#C99D6E" />
        </LinearGradient>
        <LinearGradient id="pbCork" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#D9B285" />
          <Stop offset="1" stopColor="#C89A68" />
        </LinearGradient>
      </Defs>

      <Rect fill="url(#pbWall)" height={200} width={324} />

      {/* The board: a soft shadow, the wooden frame, then the cork inside it. */}
      <Rect fill="rgba(90, 60, 25, 0.12)" height={156} rx={11} width={246} x={41} y={26} />
      <Rect fill="url(#pbWood)" height={156} rx={10} width={244} x={40} y={22} />
      <Rect fill="none" height={154} rx={9} stroke="rgba(255, 255, 255, 0.35)" strokeWidth={1} width={242} x={41} y={23} />
      <Rect fill="url(#pbCork)" height={138} rx={5} width={226} x={49} y={31} />
      <Rect fill="none" height={138} rx={5} stroke="rgba(110, 70, 30, 0.25)" strokeWidth={1.2} width={226} x={49} y={31} />
      <Speckles />

      {/* A handwritten note, top left. */}
      <Paper fill="#FFFDF8" height={70} rotate={-2.5} width={82} x={64} y={42} />
      <G transform="rotate(-2.5 105 77)">
        <Path d="M74 66c4-3 7 2 11-1s7 2 11-1 6 2 9 0" fill="none" stroke="#5B6474" strokeLinecap="round" strokeWidth={2.2} />
        <Path d="M78 78c4-3 7 2 11-1s7 2 11-1 7 2 11-1 6 2 8 0" fill="none" stroke="#5B6474" strokeLinecap="round" strokeWidth={2.2} />
        <Path d="M80 87h28" stroke="#6E7F99" strokeLinecap="round" strokeWidth={1.8} />
        <Path d="M77 96h26M79 103h30" stroke="#B7BDC7" strokeLinecap="round" strokeWidth={1.6} />
        <Path d="M128 101c-3-2-6-5-6-8 0-2 2-3 3-3s2 1 3 2c1-1 2-2 3-2s3 1 3 3c0 3-3 6-6 8Z" fill="none" stroke="#9AA2AE" strokeLinejoin="round" strokeWidth={1.4} />
      </G>
      <Pin color="#5F7FA8" x={101} y={44} />

      {/* The timetable, top right: a blue header band and four rows. */}
      <Paper fill="#FFFFFF" height={62} rotate={1.5} width={88} x={174} y={45} />
      <G transform="rotate(1.5 218 76)">
        <Path d="M180 45h76a6 6 0 0 1 6 6v8h-88v-8a6 6 0 0 1 6-6Z" fill="#CFDAEA" />
        <Rect fill="#5B6474" height={3} rx={1.5} width={44} x={182} y={50.5} />
        {[66, 76, 86, 96].map((y) => (
          <G key={y}>
            <Rect fill="#7A8494" height={2.6} rx={1.3} width={y % 20 === 6 ? 22 : 28} x={182} y={y - 1.3} />
            <Rect fill="#7A8494" height={2.6} rx={1.3} width={26} x={226} y={y - 1.3} />
            {y < 96 ? <Path d={`M180 ${y + 5}h76`} stroke="#E4E8EF" strokeWidth={1} /> : null}
          </G>
        ))}
        <Path d="M220 61v42" stroke="#E4E8EF" strokeWidth={1} />
      </G>
      <Pin color="#E8D6BF" x={216} y={46} />

      {/* A small blue note with a sprig, bottom left. */}
      <Paper fill="#DCE5F1" height={48} rotate={-2} width={52} x={88} y={118} />
      <G transform="rotate(-2 114 142)">
        <Path d="M100 160c1-9 2-17 6-24" fill="none" stroke="#5B6474" strokeLinecap="round" strokeWidth={1.4} />
        <Path d="M101 150c-4-2-6-6-5-9 4 1 6 5 5 9ZM103 143c3-3 7-4 9-2-2 3-6 4-9 2ZM104 137c-1-4 1-7 4-8 1 3-1 7-4 8Z" fill="none" stroke="#5B6474" strokeLinejoin="round" strokeWidth={1.2} />
        <Path d="M116 131h16M116 138h14M116 145h16M116 152h12" stroke="#6E7F99" strokeLinecap="round" strokeWidth={1.6} />
        <Path d="M117 159h12" stroke="#6E7F99" strokeLinecap="round" strokeWidth={1.4} />
      </G>
      <Pin color="#5F7FA8" x={113} y={119} />

      {/* The reminder, bottom right: a bell, two lines and a curled corner. */}
      <Paper curl fill="#FBF5EC" height={46} rotate={2} width={98} x={164} y={116} />
      <G transform="rotate(2 213 139)">
        <Path d="M176 142v-6a7 7 0 0 1 14 0v6l2 3h-18Z" fill="none" stroke="#5B6474" strokeLinejoin="round" strokeWidth={1.5} />
        <Path d="M181 148a2.4 2.4 0 0 0 4 0" fill="none" stroke="#5B6474" strokeLinecap="round" strokeWidth={1.5} />
        <Path d="M193 126l2-3M195 130h3" stroke="#5B6474" strokeLinecap="round" strokeWidth={1.3} />
        <Rect fill="#5B6474" height={3} rx={1.5} width={30} x={203} y={129} />
        <Rect fill="#9AA2AE" height={2.6} rx={1.3} width={44} x={203} y={139} />
        <Rect fill="#9AA2AE" height={2.6} rx={1.3} width={34} x={203} y={146} />
      </G>
      <Pin color="#E8D6BF" x={212} y={117} />

      {/* A leafy branch over the frame's corner. */}
      <G>
        <Path d="M6 200C14 182 24 166 40 150" fill="none" stroke="#7F9579" strokeLinecap="round" strokeWidth={2} />
        <Leaf angle={-55} cx={34} cy={149} />
        <Leaf angle={-10} cx={44} cy={163} light />
        <Leaf angle={-80} cx={21} cy={165} />
        <Leaf angle={-25} cx={30} cy={179} light />
        <Leaf angle={-95} cx={10} cy={182} />
      </G>
    </Svg>
  );
}

/** One sheet on the board, with its own soft shadow and, for the reminder, a curled corner. */
function Paper({
  curl = false,
  fill,
  height,
  rotate,
  width,
  x,
  y,
}: {
  curl?: boolean;
  fill: string;
  height: number;
  rotate: number;
  width: number;
  x: number;
  y: number;
}) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const right = x + width;
  const bottom = y + height;
  return (
    <G transform={`rotate(${rotate} ${cx} ${cy})`}>
      <Rect fill="rgba(80, 50, 20, 0.2)" height={height} rx={3} width={width} x={x + 1.5} y={y + 2.5} />
      {curl ? (
        <>
          <Path
            d={`M${x + 3} ${y}h${width - 6}a3 3 0 0 1 3 3v${height - 13}l-10 10h${-(width - 13)}a3 3 0 0 1-3-3v${-(height - 6)}a3 3 0 0 1 3-3Z`}
            fill={fill}
          />
          {/* The corner folded over onto the sheet. */}
          <Path d={`M${right} ${bottom - 10}L${right - 10} ${bottom}L${right - 9} ${bottom - 9}Z`} fill="#E6D8C3" />
        </>
      ) : (
        <Rect fill={fill} height={height} rx={3} width={width} x={x} y={y} />
      )}
    </G>
  );
}

/** A round push pin with a highlight. */
function Pin({ color, x, y }: { color: string; x: number; y: number }) {
  return (
    <G>
      <Ellipse cx={x + 1} cy={y + 3} fill="rgba(60, 35, 10, 0.25)" rx={4.6} ry={3} />
      <Circle cx={x} cy={y} fill={color} r={5} />
      <Circle cx={x - 1.6} cy={y - 1.6} fill="rgba(255, 255, 255, 0.55)" r={1.6} />
    </G>
  );
}

function Leaf({ angle, cx, cy, light = false }: { angle: number; cx: number; cy: number; light?: boolean }) {
  return (
    <G transform={`rotate(${angle} ${cx} ${cy})`}>
      <Ellipse cx={cx} cy={cy} fill={light ? "#A8BBA2" : "#8DA387"} rx={11} ry={4.6} />
      <Path d={`M${cx - 10} ${cy}h20`} stroke="rgba(255, 255, 255, 0.35)" strokeWidth={0.8} />
    </G>
  );
}

/** The cork's grain: fixed dots, so the board looks the same on every render. */
function Speckles() {
  const dots: { x: number; y: number; r: number }[] = [];
  let seed = 7;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let index = 0; index < 90; index += 1) {
    dots.push({ r: 0.5 + next() * 0.9, x: 52 + next() * 220, y: 34 + next() * 132 });
  }
  return (
    <G>
      {dots.map((dot, index) => (
        <Circle cx={dot.x} cy={dot.y} fill={index % 3 === 0 ? "rgba(255, 240, 215, 0.35)" : "rgba(130, 85, 40, 0.3)"} key={index} r={dot.r} />
      ))}
    </G>
  );
}
