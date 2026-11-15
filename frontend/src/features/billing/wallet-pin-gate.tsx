import { LoadFailed } from "@/components/load-failed";
import { SheetCloseButton } from "@/components/help-modal-header";
import { ModalTitle } from "@/components/modal-title";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ActivityIndicator, Animated, Dimensions, Easing, Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { X } from "lucide-react-native";
import { saveWalletAccess, subscribeWalletAccess, walletAccessToken } from "@/auth/wallet-access";
import { AnimatedPressable } from "@/components/animated-pressable";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { holdKeyboardForModal } from "@/components/keyboard-intent";
import { expectedKeyboardHeight, rememberKeyboardHeight } from "@/components/use-keyboard-inset";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { api } from "@/store/api";
import { serviceBalanceApi, useGetServiceBalanceQuery, useSetWalletLockMutation, useUnlockWalletMutation } from "@/store/services/service-balance-api";
import { useTheme } from "@/theme/use-theme";
import { WalletScreenSkeleton } from "./wallet-loading-ui";

export function useWalletUnlocked() {
  const session = useAppSelector((state) => state.auth.user?.id ?? null);
  return Boolean(useSyncExternalStore(subscribeWalletAccess, () => walletAccessToken(session), () => null));
}

/** The space kept under the PIN boxes with the keyboard closed (user, 2026-11-02). */
const CLOSED_KEYBOARD_ROOM = 20;

// The keyboard's last measured height is shared with every other sheet (2026-11-08).
const expectedKeyboardRoom = expectedKeyboardHeight;

export function WalletPinModal({ onCancel, onUnlocked, disableLock = false }: { onCancel: () => void; onUnlocked: () => void; disableLock?: boolean }) {
  const { colors, fonts } = useTheme();
  const session = useAppSelector((state) => state.auth.user?.id ?? null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();
  const [visible, setVisible] = useState(true);
  const [unlock] = useUnlockWalletMutation();
  const [setLock] = useSetWalletLockMutation();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  // The room for the keyboard is part of the sheet, which stays against the screen's bottom edge
  // and grows from within. Android only reports the keyboard once it has finished moving, so a
  // sheet carried up by it is late, and one left to the window's own resizing lost its dim under
  // the boxes. Here the keyboard moves behind white, so nothing shows through whenever it arrives.
  const keyboardRoom = useRef(new Animated.Value(expectedKeyboardRoom())).current;
  const moveRoom = useCallback((toValue: number, duration: number) => {
    if (Platform.OS !== "android") return;
    Animated.timing(keyboardRoom, { duration, easing: Easing.out(Easing.quad), toValue, useNativeDriver: false }).start();
  }, [keyboardRoom]);
  useEffect(() => holdKeyboardForModal(), []);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    // The first open is an estimate, so it settles on the real height, and later ones start there.
    const measured = Keyboard.addListener("keyboardDidShow", (event) => {
      const height = Math.max(0, Dimensions.get("screen").height - event.endCoordinates.screenY);
      rememberKeyboardHeight(height);
      moveRoom(height, 120);
    });
    // Smaller once the keyboard has gone (user, 2026-11-02).
    const gone = Keyboard.addListener("keyboardDidHide", () => moveRoom(CLOSED_KEYBOARD_ROOM, 200));
    return () => {
      measured.remove();
      gone.remove();
    };
  }, [moveRoom]);
  const input = useRef<TextInput>(null);
  const pending = useRef(false);
  const active = useRef(true);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyboardOpen = useRef(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => {
      keyboardOpen.current = true;
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardOpen.current = false;
    });
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  useEffect(() => { active.current = true; return () => { active.current = false; clearTimeout(focusTimer.current); }; }, []);
  function focusPin() {
    if (pending.current) return;
    if (input.current?.isFocused() && keyboardOpen.current) return;
    // Ahead of the keyboard, which rises behind the white.
    moveRoom(expectedKeyboardRoom(), 200);
    // A dismissed Android keyboard can leave its input focused. Refocusing
    // alone does nothing in that state; reset focus before requesting it.
    input.current?.blur();
    requestAnimationFrame(() => { if (active.current) input.current?.focus(); });
  }
  function focusAfterShow() {
    // Android's modal window must receive focus before requesting the IME, and a request during
    // its opening transition can be ignored on the first mount. So it asks almost at once, so the
    // keyboard comes up with the sheet (user, 2026-11-02), and once more if nothing came of it.
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      if (!active.current) return;
      focusPin();
      focusTimer.current = setTimeout(() => { if (active.current && !keyboardOpen.current) focusPin(); }, 500);
    }, 50);
  }
  function dismissKeyboardSmoothly() {
    LayoutAnimation.configureNext({
      duration: 250,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    input.current?.blur();
    Keyboard.dismiss();
    moveRoom(CLOSED_KEYBOARD_ROOM, 250);
  }
  function cancel() { active.current = false; clearTimeout(focusTimer.current); Keyboard.dismiss(); setPin(""); onCancel(); }
  async function submit(value: string) {
    if (!session || pending.current) return;
    pending.current = true;
    try {
      if (disableLock) {
        await setLock({ enabled: false, pin: value }).unwrap();
        if (!active.current) return;
        dismissKeyboardSmoothly();
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        if (!active.current) return;
        setVisible(false);
        // Finish the sheet's closing animation before updating the card.
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
        if (!active.current) return;
        dispatch(serviceBalanceApi.util.updateQueryData("getServiceBalance", undefined, (balance) => { balance.walletLockEnabled = false; }));
        // The server revoked the grant. Leave its local expiry alone here:
        // clearing it before the updated query reaches the route gate briefly
        // unmounts the wallet screen and flashes a blank background.
      } else {
        const result = await unlock({ pin: value }).unwrap();
        if (!active.current) return;
        dismissKeyboardSmoothly();
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        if (!active.current) return;
        saveWalletAccess(session, result.token, result.expiresAt);
      }
      setPin("");
      if (!disableLock) dispatch(api.util.invalidateTags(["ServiceBalance"]));
      onUnlocked();
    } catch (failure) {
      if (!active.current) return;
      // Release the submission guard before re-entry. Keep the native input
      // editable throughout so Android's input connection stays alive.
      pending.current = false;
      setPin("");
      const message = (failure as { data?: { message?: string } }).data?.message;
      setError(message && /incorrect|invalid|wrong.*pin/i.test(message) ? "Wrong PIN" : message?.replace(/\.+$/, "") || "Could not verify PIN. Try again");
      // Leave the error visible without reopening the keyboard. Tapping a
      // PIN box explicitly restores focus for the next attempt.
      clearTimeout(focusTimer.current);
      dismissKeyboardSmoothly();
    } finally { pending.current = false; }
  }
  return <BottomSheetModal navigationBarTranslucent statusBarTranslucent visible={visible} onRequestClose={cancel} onShow={focusAfterShow} onDismissStart={() => {
    active.current = false;
    clearTimeout(focusTimer.current);
    Keyboard.dismiss();
  }}>
    {(dismiss) => <View style={{ flex: 1 }}>
    {/* Under the status bar, so the dim fills the screen, and such a window does not resize for
        the keyboard on Android (user, 2026-11-02). */}
    <KeyboardAvoidingView enabled={Platform.OS === "ios"} behavior="padding" style={{ flex: 1, justifyContent: "flex-end" }}>
      <SheetCloseButton accessibilityLabel="Cancel PIN entry" onClose={() => dismiss()} />
      <Animated.View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 24, paddingTop: 28, paddingBottom: Animated.add(keyboardRoom, Math.max(insets.bottom, 16) + 6), gap: 22, width: "100%", maxWidth: 520, alignSelf: "center" }}>
        {/* Centred, with no line under it (user, 2026-11-01). ModalTitle is 80% wide, so the text alone centring is not enough. */}
        <ModalTitle style={{ alignSelf: "center", color: colors.ink, fontFamily: fonts.display, fontSize: 22, textAlign: "center" }}>Enter Account PIN</ModalTitle>
        <View>
          <AnimatedPressable onPress={focusPin} accessible={false} style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: 6 }, (_, index) => <View key={index} style={{ flex: 1, height: 54, borderRadius: 9, borderWidth: 1.5, borderColor: error ? colors.danger : index === Math.min(pin.length, 5) ? colors.ink : colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 24 }}>{pin[index] ? "*" : ""}</Text></View>)}
          </AnimatedPressable>
          <TextInput ref={input} accessibilityLabel="Enter six-digit account PIN" value={pin} secureTextEntry keyboardType="number-pad" showSoftInputOnFocus maxLength={6} autoComplete="off" autoCorrect={false} caretHidden onPressIn={focusPin} underlineColorAndroid="transparent" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 54, color: "transparent", backgroundColor: "transparent", opacity: 0.02 }} onChangeText={(text) => { if (pending.current) return; const value = text.replace(/\D/g, "").slice(0, 6); setPin(value); setError(undefined); if (value.length === 6) void submit(value); }} />
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ paddingTop: 6, color: colors.danger, fontFamily: fonts.sansBold, fontSize: 11 }}>{error}</Text> : null}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
    </View>}
  </BottomSheetModal>;
}

/**
 * Also guards direct links, before sensitive screen queries are mounted.
 *
 * <p>While locked, the screen's own placeholder stays behind the PIN sheet. The
 * real screen cannot: it would show the ledger the lock exists to hide, and its
 * queries would be refused. Nothing at all left a white page under the sheet
 * each time the five minutes ran out.
 */
export function WalletPinGate({ children, fallback }: { children: ReactNode; /** The guarded screen's placeholder. The wallet's by default. */ fallback?: ReactNode }) {
  const unlocked = useWalletUnlocked();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const balance = useGetServiceBalanceQuery(undefined, { refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const router = useGuardedRouter();
  const placeholder = fallback ?? <WalletScreenSkeleton />;
  if (!balance.data) return balance.isError ? <LoadFailed error={balance.error} onReload={() => void balance.refetch()} /> : <>{placeholder}</>;
  if (!balance.data.walletLockEnabled || unlocked) return <>{children}</>;
  return <>
    {placeholder}
    {focused ? <WalletPinModal onCancel={() => router.canGoBack() ? router.back() : router.replace("/")} onUnlocked={() => {}} /> : null}
  </>;
}
