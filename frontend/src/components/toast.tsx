import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { StatusIcon, statusTonePalette, type StatusTone } from "@/components/status-icon";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * What a toast is telling you: it worked, it failed, or it did not happen.
 *
 * <p>Three, not four. "Info" was the old fourth and was doing nothing useful —
 * it was the DEFAULT, so every untyped `toast.show(msg)` landed there, which
 * meant "Could not create the category." rendered in calm blue with a tick-
 * adjacent icon. Anything worth interrupting someone for is one of these three.
 */
export type ToastTone = "ok" | "error" | "warning";

/** Legacy names kept so 150-odd call sites did not all have to change at once. */
type ToastType = ToastTone | "success" | "info";

type ToastItem = { id: string; tone: ToastTone; message: string };

function normalizeTone(type: ToastType): ToastTone {
  if (type === "success") {
    return "ok";
  }
  // Everything the old code called "info" was really "this did not happen":
  // dark mode paused, chat not built yet, settings unavailable.
  if (type === "info") {
    return "warning";
  }
  return type;
}

/**
 * Classifies a message that arrived without a tone.
 *
 * <p>Five screens had grown their own regex for this — each with a different
 * word list, so the same sentence could toast green on one screen and red on
 * another. This is that heuristic, once.
 *
 * <p>It is a fallback, not the mechanism: a caller that KNOWS the outcome should
 * say so. It exists because a bare `show(message)` otherwise defaults to
 * something, and defaulting to "fine" is the wrong way to be wrong.
 */
export function classifyToast(message: string): ToastTone {
  const text = message.trim().toLowerCase();

  if (/could not|cannot|can.t|unable|failed|invalid|error|not allowed|denied|no report|not finalized/.test(text)) {
    return "error";
  }

  // Imperatives are anchored to the START. Unanchored, "choose" matched
  // "Manager assigned. Now choose their access." and turned a success amber.
  if (/^(enter|choose|select|add|open|write|pick|set|allow) /.test(text)) {
    return "warning";
  }

  // Nothing failed, but nothing happened either.
  if (/not available|coming soon|not yet|paused|will be enabled|still loading|already have|already exists|is required/.test(text)) {
    return "warning";
  }

  return "ok";
}

type ToastContextValue = {
  /** Tone omitted means "classify it for me" — see {@link classifyToast}. */
  show: (message: string, type?: ToastType) => void;
  ok: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  /** @deprecated use ok. */
  success: (message: string) => void;
  /** @deprecated use warning. */
  info: (message: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3000;
const MAX_TOASTS = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissAll = useCallback(() => setToasts([]), []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message: string, type?: ToastType) => {
    const trimmed = message?.trim();
    if (!trimmed) {
      return;
    }
    const tone = type ? normalizeTone(type) : classifyToast(trimmed);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Keep only the most recent toasts so a burst can't fill the screen.
    setToasts((current) => [...current, { id, message: trimmed, tone }].slice(-MAX_TOASTS));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      dismiss,
      error: (message) => show(message, "error"),
      info: (message) => show(message, "warning"),
      ok: (message) => show(message, "ok"),
      show,
      success: (message) => show(message, "ok"),
      warning: (message) => show(message, "warning"),
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport onDismiss={dismiss} onDismissAll={dismissAll} toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

/**
 * Where toasts are painted.
 *
 * <p>Inside a Modal of its own, not simply at the top of the tree. On Android a
 * React Native Modal is a separate native WINDOW, so anything rendered in the
 * app's own window — however high its zIndex or elevation — paints UNDERNEATH
 * an open sheet or dialog. Every confirmation fired from inside a sheet was
 * landing behind it and was never seen. Only another Modal sits above one.
 *
 * <p>That window is full-screen and, being a native window, takes every touch
 * inside it — {@code pointerEvents} cannot give them back, because the grab
 * happens at the OS level before React Native sees it. So rather than let taps
 * vanish for the three seconds a toast is up, the backdrop CLEARS the toasts.
 * A tap while one is showing dismisses it and the next tap lands normally,
 * which is the behaviour a reader already expects from a toast.
 *
 * <p>{@code visible} follows the queue: a Modal left permanently mounted would
 * keep an empty window — and its touch grab — over the app forever.
 */
function ToastViewport({
  onDismiss,
  onDismissAll,
  toasts,
}: {
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  toasts: ToastItem[];
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="none"
      // The hardware back button clears the toasts rather than doing nothing,
      // for the same reason the backdrop does.
      onRequestClose={onDismissAll}
      statusBarTranslucent
      transparent
      visible={toasts.length > 0}
    >
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={onDismissAll}
        style={{ flex: 1 }}
      >
        <View
          pointerEvents="box-none"
          style={{
            gap: spacing.sm,
            left: spacing.md,
            position: "absolute",
            right: spacing.md,
            top: insets.top + spacing.sm,
          }}
        >
          {toasts.map((toast) => (
            <ToastCard key={toast.id} onDismiss={onDismiss} toast={toast} />
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const { colors, fonts } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    Animated.timing(anim, {
      duration: 180,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(() => onDismiss(toast.id));
  }, [anim, onDismiss, toast.id]);

  useEffect(() => {
    Animated.timing(anim, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(close, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [anim, close]);

  // One lookup for the mark and the rule beneath it, so they cannot disagree.
  const tone: StatusTone = toast.tone === "ok" ? "success" : toast.tone;
  const { fill } = statusTonePalette(tone, colors);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-44, 0] });

  return (
    <Animated.View style={{ alignSelf: "flex-start", maxWidth: "100%", opacity: anim, transform: [{ translateX }] }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 16,
          // A thick rule along the bottom carries the tone. The old card said it
          // only through a soft tile behind the icon, which at 30px was too
          // little colour to register before the toast timed out.
          borderBottomColor: fill,
          borderBottomWidth: 4,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm + 2,
          paddingHorizontal: spacing.sm + 2,
          paddingRight: spacing.xs,
          paddingVertical: spacing.sm,
        }}
      >
        <StatusIcon size={22} tone={tone} />
        <Text
          style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 13.5, lineHeight: 19 }}
        >
          {toast.message}
        </Text>
        <AnimatedPressable
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
          hitSlop={10}
          onPress={close}
          style={{ alignItems: "center", borderRadius: 8, height: 26, justifyContent: "center", width: 26 }}
        >
          <X color={colors.kicker} size={15} strokeWidth={2.4} />
        </AnimatedPressable>
      </View>
    </Animated.View>
  );
}
