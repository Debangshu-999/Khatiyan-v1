import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Keyboard, KeyboardAvoidingView, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { focusedInput, onKeyboardComing, onKeyboardLeaving } from "@/components/keyboard-intent";

/** Measured the last time the keyboard opened, shared by every sheet and dialog. */
let lastKeyboardHeight: number | null = null;

/**
 * How tall the keyboard is expected to be, on Android. The last measured height, or until the
 * first measure a share of the screen: the usual height of a phone's keyboard.
 */
export function expectedKeyboardHeight() {
  if (Platform.OS !== "android") return 0;
  return lastKeyboardHeight ?? Math.round(Dimensions.get("screen").height * 0.36);
}

/** Records a measured keyboard, so the next one starts from it. */
export function rememberKeyboardHeight(height: number) {
  lastKeyboardHeight = height;
}

function measured(event: { endCoordinates: { screenY: number } }) {
  // From the keyboard's top edge to the bottom of the screen, as SheetShell measures it
  // (2026-10-29). The keyboard's height less the safe-area inset was right on gesture
  // navigation only.
  return Math.max(0, Dimensions.get("screen").height - event.endCoordinates.screenY);
}

/**
 * The room a modal keeps for the keyboard, on Android, the wallet PIN sheet's way (user,
 * 2026-11-08: "do the same fix as that of the PIN modal for wallet", app wide).
 *
 * <p>Android reports the keyboard only once it has finished moving, so a sheet waiting for that
 * moved late, after the keyboard had already covered it. Here the room starts growing the moment
 * an input takes focus, eased, from the keyboard's last measured height, and settles on the real
 * height when Android reports it. Put {@code room} INSIDE the sheet as bottom padding, so the
 * keyboard rises behind the sheet's own colour and nothing shows through whenever it arrives.
 *
 * <p>{@code room} rests at {@code closed} (a bottom sheet's nav-bar inset, say) and becomes the
 * keyboard's height with it up, which covers that inset. {@code inset} is the keyboard's height,
 * or 0, as a number. On iOS both rest, and the platform avoider should be used instead.
 */
export function useKeyboardRoom(closed = 0) {
  const room = useRef(new Animated.Value(closed)).current;
  const [inset, setInset] = useState(0);
  const closedRef = useRef(closed);
  const insetRef = useRef(0);

  useEffect(() => {
    closedRef.current = closed;
    if (insetRef.current === 0) room.setValue(closed);
  }, [closed, room]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const move = (height: number, duration: number) => {
      insetRef.current = height;
      setInset(height);
      Animated.timing(room, {
        duration,
        easing: Easing.out(Easing.quad),
        toValue: height > 0 ? height : closedRef.current,
        useNativeDriver: false,
      }).start();
    };
    // Ahead of the keyboard, which rises behind the sheet.
    const offComing = onKeyboardComing(() => move(expectedKeyboardHeight(), 200));
    // The first open is an estimate, so it settles on the real height, and later ones start there.
    const onShow = Keyboard.addListener("keyboardDidShow", (event) => {
      const height = measured(event);
      rememberKeyboardHeight(height);
      move(height, 120);
    });
    const drop = () => {
      if (insetRef.current !== 0) move(0, 200);
    };
    const onHide = Keyboard.addListener("keyboardDidHide", drop);
    // Sooner than keyboardDidHide: the input losing focus is when the keyboard starts to close.
    const offLeaving = onKeyboardLeaving(drop);

    return () => {
      offComing();
      onShow.remove();
      onHide.remove();
      offLeaving();
    };
  }, [room]);

  return { inset, room };
}

/**
 * The keyboard's height on Android, measured rather than inferred, as a number.
 *
 * <p>
 * Prefer {@link useKeyboardRoom} for a modal: it eases. This stays for screens (a chat thread,
 * a form) that only need the number. It now rises when an input takes focus, from the last
 * measured height, rather than once the keyboard has finished opening.
 *
 * <p>
 * `KeyboardAvoidingView behavior="padding"` is broken on Android under edge-to-edge (mandatory
 * since Expo SDK 53): it infers the keyboard height by comparing screen height to window height,
 * edge-to-edge makes the window span the whole display, so the number is wrong, and on DISMISSAL
 * its padding does not return to zero.
 *
 * <p>
 * Returns 0 on iOS, where the platform avoider works correctly and should be used instead:
 * {@code behavior={Platform.OS === "ios" ? "padding" : undefined}}.
 */
export function useKeyboardInset({ early = true }: {
  /** Rise when an input takes focus. Off for a full screen, which only modals were asked for. */
  early?: boolean;
} = {}) {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const offComing = early ? onKeyboardComing(() => setKeyboardInset(expectedKeyboardHeight())) : () => {};
    const onShow = Keyboard.addListener("keyboardDidShow", (event) => {
      const height = measured(event);
      rememberKeyboardHeight(height);
      setKeyboardInset(height);
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));
    const offLeaving = onKeyboardLeaving(() => setKeyboardInset(0));

    return () => {
      offComing();
      onShow.remove();
      onHide.remove();
      offLeaving();
    };
  }, [early]);

  return keyboardInset;
}

/** A keyboard avoider whose style can take {@link useKeyboardRoom}'s eased room. */
export const AnimatedKeyboardAvoidingView = Animated.createAnimatedComponent(KeyboardAvoidingView);

type Scrollable = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
  scrollTo?: (options: { animated?: boolean; y: number }) => void;
};

/** Space kept between the focused input and the visible edge of the list. */
const REVEAL_MARGIN = 16;

/**
 * Scrolls a modal's list so the focused input sits inside what is still visible (user,
 * 2026-11-08: "the modal scroll should be on the input when keyboard is open"). With the
 * keyboard's room inside the sheet the list itself gets shorter, so its own bounds are what the
 * input has to fit in, which also keeps it clear of the sheet's pinned buttons.
 *
 * <p>An input lying wholly above the list is in the sheet's head, not in the list, and is left.
 */
export function revealFocusedInput(scroll: Scrollable | null, offset: number) {
  const input = focusedInput();
  if (!scroll?.measureInWindow || !scroll.scrollTo || !input?.measureInWindow) return;
  scroll.measureInWindow((_sx, top, _sw, height) => {
    input.measureInWindow?.((_ix, inputTop, _iw, inputHeight) => {
      if (height <= 0 || inputTop + inputHeight <= top) return;
      const below = inputTop + inputHeight + REVEAL_MARGIN - (top + height);
      const above = top + REVEAL_MARGIN - inputTop;
      if (below > 0) scroll.scrollTo?.({ animated: true, y: offset + below });
      else if (above > 0) scroll.scrollTo?.({ animated: true, y: Math.max(0, offset - above) });
    });
  });
}

/**
 * Brings the focused input into view once the keyboard's room has opened, on Android. Calls
 * `reveal` after the room's own easing has finished, and again once the keyboard has settled.
 */
export function useRevealOnKeyboard(reveal: () => void) {
  const latest = useRef(reveal);
  latest.current = reveal;
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), delay);
    };
    // The room eases over 200ms from focus, and settles over 120ms once Android reports it.
    const offComing = onKeyboardComing(() => later(260));
    const shown = Keyboard.addListener("keyboardDidShow", () => later(180));
    return () => {
      clearTimeout(timer);
      offComing();
      shown.remove();
    };
  }, []);
}

/**
 * Props for a modal's ScrollView that keep the focused input in view with the keyboard up.
 * Spread them on the list: {@code <ScrollView {...revealInput} ...>}.
 */
export function useRevealInputScroll() {
  const ref = useRef<Scrollable | null>(null);
  const offset = useRef(0);
  useRevealOnKeyboard(() => revealFocusedInput(ref.current, offset.current));
  return useMemo(() => ({
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
    },
    ref: ref as never,
    scrollEventThrottle: 16,
  }), []);
}
