import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Image, View } from "react-native";
import Svg from "react-native-svg";

import { SLIDES } from "./story/slides";
import { SceneTime } from "./story/timeline";
import { UTILITY_MS, UTILITY_SCENES } from "./story/utility";

/** The stage everything is drawn on, in its own units. */
export const STORY_WIDTH = 390;
export const STORY_HEIGHT = 340;

/** How long each slide stays before the next fades in. */
export const SLIDE_MS = 3600;
const FADE_MS = 500;
/** The utility scenes play at a stop-motion rate. */
const FPS = 20;

const LOGO = require("../../../assets/icons/brand/logo-light-no-tagline.png");

type Size = { height: number; topInset: number; width: number };

/** Stage units per pixel, so the stage fits the band below the status bar. */
function unitsPerPx({ height, topInset, width }: Size) {
  return Math.max(STORY_WIDTH / width, STORY_HEIGHT / Math.max(1, height - topInset));
}

/**
 * The stage as an Svg: the status bar strip above y = 0, the stage's bottom on the
 * band's bottom, and a wide window's sides filled by each picture's own background.
 */
export function Stage({ children, height, topInset, width }: Size & { children: ReactNode }) {
  const top = topInset * unitsPerPx({ height, topInset, width });
  return (
    <Svg height={height} preserveAspectRatio="xMidYMax meet" viewBox={`0 ${-top} ${STORY_WIDTH} ${STORY_HEIGHT + top}`} width={width}>
      {children}
    </Svg>
  );
}

/** One slide, drawn once: slides are still pictures. */
export const SlideFrame = memo(function SlideFrame({ index, ...size }: Size & { index: number }) {
  const Draw = SLIDES[index].Draw;
  return (
    <Stage {...size}>
      <Draw />
    </Stage>
  );
});

/** A utility screen's scene `ms` into it. Pure, so the HTML preview draws the same frames. */
export function UtilityFrame({ ms, step, ...size }: Size & { ms: number; step: string }) {
  const scene = UTILITY_SCENES[step];
  if (!scene) return null;
  const Draw = scene.Draw;
  return (
    <SceneTime.Provider value={ms}>
      <Stage {...size}>
        <Draw />
      </Stage>
    </SceneTime.Provider>
  );
}

const fill = { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } as const;

/**
 * Login and sign-up (user, 2026-11-14): the eight pictures in turn, each held for
 * {@link SLIDE_MS} and faded into the next, round and round. No dots or other
 * carousel marks (user, 2026-11-14): the slide's name pill is the only label.
 * With reduce motion on, slides change without the fade.
 */
function Slideshow(size: Size) {
  const [index, setIndex] = useState(0);
  const [incoming, setIncoming] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const reduce = useRef(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      reduce.current = value;
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = (index + 1) % SLIDES.length;
      fade.setValue(0);
      setIncoming(next);
      Animated.timing(fade, { duration: reduce.current ? 0 : FADE_MS, toValue: 1, useNativeDriver: true }).start(() => {
        setIndex(next);
        setIncoming(null);
      });
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [fade, index]);

  return (
    <>
      <View style={fill}>
        <SlideFrame index={index} {...size} />
      </View>
      {incoming !== null ? (
        <Animated.View style={[fill, { opacity: fade }]}>
          <SlideFrame index={incoming} {...size} />
        </Animated.View>
      ) : null}
      {/* The last slide's app icon is a picture: loaded up front so it never shows up empty. */}
      <Image source={LOGO} style={{ height: 1, opacity: 0, position: "absolute", width: 1 }} />
    </>
  );
}

/**
 * A utility screen's scene, played every time the screen opens (user, 2026-11-14),
 * then held on its last frame. Light: 2.6 seconds at 20 frames, then nothing runs.
 */
function UtilityScene({ step, ...size }: Size & { step: string }) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    setMs(0);
    let frame = 0;
    let cancelled = false;
    let start = 0;
    const tick = (now: number) => {
      if (cancelled) return;
      if (!start) start = now;
      const elapsed = now - start;
      if (elapsed >= UTILITY_MS) {
        setMs(UTILITY_MS);
        return;
      }
      const stepped = Math.floor(elapsed / (1000 / FPS)) * (1000 / FPS);
      setMs((previous) => (previous === stepped ? previous : stepped));
      frame = requestAnimationFrame(tick);
    };
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        setMs(UTILITY_MS);
      } else {
        frame = requestAnimationFrame(tick);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [step]);

  return <UtilityFrame ms={ms} step={step} {...size} />;
}

/**
 * The auth band (user, 2026-11-14): login and sign-up show the slideshow, every
 * other auth screen its own short scene. `screen` is `step:mode`.
 *
 * Its own positioned box: on web a bare Svg would be painted over by the sheet's layers.
 */
export function AuthStory({ screen, ...size }: Size & { screen: string }) {
  const step = screen.split(":")[0];
  return (
    <View pointerEvents="none" style={{ height: size.height, left: 0, position: "absolute", top: 0, width: size.width }}>
      {UTILITY_SCENES[step] ? <UtilityScene step={step} {...size} /> : <Slideshow {...size} />}
    </View>
  );
}
