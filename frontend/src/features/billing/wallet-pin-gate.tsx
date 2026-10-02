import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { X } from "lucide-react-native";
import { saveWalletAccess, subscribeWalletAccess, walletAccessToken } from "@/auth/wallet-access";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { api } from "@/store/api";
import { serviceBalanceApi, useGetServiceBalanceQuery, useSetWalletLockMutation, useUnlockWalletMutation } from "@/store/services/service-balance-api";
import { useTheme } from "@/theme/use-theme";
import { WalletScreenSkeleton } from "./wallet-loading-ui";

export function useWalletUnlocked() {
  const session = useAppSelector((state) => state.auth.accessToken);
  return Boolean(useSyncExternalStore(subscribeWalletAccess, () => walletAccessToken(session), () => null));
}

export function WalletPinModal({ onCancel, onUnlocked, disableLock = false }: { onCancel: () => void; onUnlocked: () => void; disableLock?: boolean }) {
  const { colors, fonts } = useTheme();
  const session = useAppSelector((state) => state.auth.accessToken);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();
  const [visible, setVisible] = useState(true);
  const [unlock] = useUnlockWalletMutation();
  const [setLock] = useSetWalletLockMutation();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
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
    // A dismissed Android keyboard can leave its input focused. Refocusing
    // alone does nothing in that state; reset focus before requesting it.
    input.current?.blur();
    requestAnimationFrame(() => { if (active.current) input.current?.focus(); });
  }
  function focusAfterShow() {
    // Android's modal window must receive focus before requesting the IME.
    // A request during its opening transition is ignored on the first mount.
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => { if (active.current) focusPin(); }, 300);
  }
  function dismissKeyboardSmoothly() {
    LayoutAnimation.configureNext({
      duration: 250,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    input.current?.blur();
    Keyboard.dismiss();
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
  return <Modal transparent visible={visible} animationType="slide" onRequestClose={cancel} onShow={focusAfterShow}>
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}>
    {/* Android's modal window already resizes for the IME. Adding measured
        padding also moved the sheet, then reversed it after the next layout. */}
    <KeyboardAvoidingView enabled={Platform.OS === "ios"} behavior="padding" style={{ flex: 1, justifyContent: "flex-end" }}>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Cancel PIN entry" onPress={cancel} style={{ alignSelf: "center", marginBottom: 14, backgroundColor: colors.surface, borderRadius: 24, width: 46, height: 46, alignItems: "center", justifyContent: "center" }}><X color={colors.ink} size={23} /></AnimatedPressable>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 24, paddingTop: 28, paddingBottom: Math.max(insets.bottom, 16) + 6, gap: 22, width: "100%", maxWidth: 520, alignSelf: "center" }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, textAlign: "center" }}>Enter Account PIN</Text>
        <View>
          <AnimatedPressable onPress={focusPin} accessible={false} style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: 6 }, (_, index) => <View key={index} style={{ flex: 1, height: 54, borderRadius: 9, borderWidth: 1.5, borderColor: error ? colors.danger : index === Math.min(pin.length, 5) ? colors.ink : colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 24 }}>{pin[index] ? "*" : ""}</Text></View>)}
          </AnimatedPressable>
          <TextInput ref={input} accessibilityLabel="Enter six-digit account PIN" value={pin} secureTextEntry keyboardType="number-pad" showSoftInputOnFocus maxLength={6} autoComplete="off" autoCorrect={false} caretHidden onPressIn={focusPin} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 54, color: "transparent", backgroundColor: "transparent", opacity: 0.02 }} onChangeText={(text) => { if (pending.current) return; const value = text.replace(/\D/g, "").slice(0, 6); setPin(value); setError(undefined); if (value.length === 6) void submit(value); }} />
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ paddingTop: 6, color: colors.danger, fontFamily: fonts.sansBold, fontSize: 11 }}>{error}</Text> : null}
        </View>
      </View>
    </KeyboardAvoidingView>
    </View>
  </Modal>;
}

/** Also guards direct links, before sensitive screen queries are mounted. */
export function WalletPinGate({ children }: { children: ReactNode }) {
  const unlocked = useWalletUnlocked();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const balance = useGetServiceBalanceQuery(undefined, { refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const router = useGuardedRouter();
  if (!balance.data) return balance.isError ? <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><AnimatedPressable onPress={() => void balance.refetch()}><Text>Could not check wallet lock. Tap to retry</Text></AnimatedPressable></View> : <WalletScreenSkeleton />;
  if (!balance.data.walletLockEnabled || unlocked) return <>{children}</>;
  return focused ? <WalletPinModal onCancel={() => router.canGoBack() ? router.back() : router.replace("/")} onUnlocked={() => {}} /> : null;
}
