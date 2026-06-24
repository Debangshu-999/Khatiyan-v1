import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: string; type: ToastType; message: string };

type ToastContextValue = {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3000;
const MAX_TOASTS = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const trimmed = message?.trim();
    if (!trimmed) {
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Keep only the most recent toasts so a burst can't fill the screen.
    setToasts((current) => [...current, { id, message: trimmed, type }].slice(-MAX_TOASTS));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      dismiss,
      error: (message) => show(message, "error"),
      info: (message) => show(message, "info"),
      show,
      success: (message) => show(message, "success"),
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
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

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        elevation: 9999,
        gap: spacing.sm,
        left: spacing.md,
        position: "absolute",
        right: spacing.md,
        top: insets.top + spacing.sm,
        zIndex: 9999,
      }}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} onDismiss={onDismiss} toast={toast} />
      ))}
    </View>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const { colors, fonts, isDark } = useTheme();
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

  const palette =
    toast.type === "success"
      ? { accent: colors.successText, soft: colors.successSoft, icon: CheckCircle2 }
      : toast.type === "error"
        ? { accent: colors.danger, soft: colors.dangerSoft, icon: AlertCircle }
        : { accent: colors.primary, soft: colors.primarySoft, icon: Info };
  const Icon = palette.icon;

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-44, 0] });

  return (
    <Animated.View style={{ alignSelf: "flex-start", maxWidth: "100%", opacity: anim, transform: [{ translateX }] }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 16,
          borderWidth: 1,
          elevation: 10,
          flexDirection: "row",
          gap: spacing.sm + 2,
          paddingHorizontal: spacing.sm + 2,
          paddingRight: spacing.xs,
          paddingVertical: spacing.sm,
          shadowColor: isDark ? "#000000" : "#0F172A",
          shadowOffset: { height: 10, width: 0 },
          shadowOpacity: isDark ? 0.55 : 0.16,
          shadowRadius: 20,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette.soft,
            borderCurve: "continuous",
            borderRadius: 9,
            height: 30,
            justifyContent: "center",
            width: 30,
          }}
        >
          <Icon color={palette.accent} size={17} strokeWidth={2.4} />
        </View>
        <Text
          style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", lineHeight: 19 }}
          selectable
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
