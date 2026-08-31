import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppTextInput } from "@/components/app-text-input";
import { CodeField } from "@/features/auth/auth-ui";
import { AlertTriangle, BellRing, Fingerprint, Mail, Moon, ShieldCheck, Smartphone, X, type LucideProps } from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { saveSession } from "@/auth/session-storage";
import { AnimatedPressable } from "@/components/animated-pressable";
import { BloomModalShell } from "@/components/bloom-modal-shell";
import { useToast } from "@/components/toast";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { SessionCountdown, SignedInDevices } from "@/features/auth/signed-in-devices";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { AlertModal } from "@/components/alert-modal";
import { classifyToast } from "@/components/toast";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { Section } from "@/components/section";
import { requestNotificationDeviceRegistration } from "@/features/notifications/device-registration";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  useChangePinMutation,
  useConfirmPinResetMutation,
  useGetEmailRecoveryStatusQuery,
  useRequestPinResetMutation,
  useGetMyIdentityQuery,
  useUpdateMyIdentityMutation,
  useUpdateProfileMutation,
  useUpdateRecoveryEmailMutation,
  useVerifyOtpMutation,
  type Gender,
  type TokenResponse,
} from "@/store/services/auth-api";
import {
  useDeactivateDeviceMutation,
  useListMyDevicesQuery,
  useRegisterDeviceMutation,
} from "@/store/services/notification-api";
import { setRegisteredDeviceTokenId, setSession } from "@/store/slices/auth-slice";
import { DateOfBirthField } from "@/features/account/date-of-birth-field";
import { GenderPicker } from "@/features/account/gender-picker";
import { ActionButton, FormInput, NoticeBar } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PinModalMode = "change" | "forgot";
type PinFlowStep = "details" | "otp" | "pin";

export default function AccountSettingsScreen() {
  const dispatch = useAppDispatch();
  const { colors, fonts, type } = useTheme();
  const auth = useAppSelector((state) => state.auth);
  const phone = auth.user?.phone ?? "";
  const devicesQuery = useListMyDevicesQuery(undefined, { skip: !auth.accessToken });
  const [registerDevice, registerDeviceState] = useRegisterDeviceMutation();
  const [deactivateDevice, deactivateDeviceState] = useDeactivateDeviceMutation();
  const [requestPinReset, requestPinResetState] = useRequestPinResetMutation();
  const [verifyOtp, verifyOtpState] = useVerifyOtpMutation();
  const [confirmPinReset, confirmPinResetState] = useConfirmPinResetMutation();
  const [changePin, changePinState] = useChangePinMutation();
  const toast = useToast();
  const [pinModalMode, setPinModalMode] = useState<PinModalMode | null>(null);
  const emailQuery = useGetEmailRecoveryStatusQuery(undefined, { skip: !auth.accessToken });
  const emailStatus = emailQuery.data;
  const [updateProfile, updateProfileState] = useUpdateProfileMutation();
  const [updateRecoveryEmail, updateRecoveryEmailState] = useUpdateRecoveryEmailMutation();

  const activeDevice = useMemo(() => {
    const devices = devicesQuery.data ?? [];
    if (auth.registeredDeviceTokenId) {
      const currentDevice = devices.find((device) => device.id === auth.registeredDeviceTokenId);
      if (currentDevice?.active) {
        return currentDevice;
      }
    }
    return devices.find((device) => device.active) ?? null;
  }, [auth.registeredDeviceTokenId, devicesQuery.data]);

  const opErrors = useFormErrors<never>();
  async function persistTokenSession(response: TokenResponse) {
    const session = {
      accessToken: response.accessToken,
      user: response.user,
    };
    dispatch(setSession(session));
    await saveSession(session);
  }

  async function handleNotificationToggle(enabled: boolean) {
    try {
      if (enabled) {
        const registration = await requestNotificationDeviceRegistration();
        const response = await registerDevice(registration).unwrap();
        dispatch(setRegisteredDeviceTokenId(response.id));
        toast.success("Notifications enabled on this device.");
        return;
      }

      if (activeDevice) {
        await deactivateDevice(activeDevice.id).unwrap();
      }
      dispatch(setRegisteredDeviceTokenId(null));
      toast.success("Notifications disabled on this device.");
    } catch (error) {
      opErrors.failFromServer(error instanceof Error ? error.message : "Unable to update notification settings.");
    }
  }

  // Dark mode is paused while we polish the light UI. Keep the toggle visible
  // but inert, and explain why via a toast instead of flipping the theme.
  function handleThemeToggle() {
    toast.info("Dark mode is paused while we polish the new UI.");
  }

  const pinFlowBusy =
    requestPinResetState.isLoading || verifyOtpState.isLoading || confirmPinResetState.isLoading || changePinState.isLoading;
  const notificationsBusy =
    registerDeviceState.isLoading || deactivateDeviceState.isLoading || devicesQuery.isFetching;
  const notificationsEnabled = Boolean(activeDevice);

  return (
    <BloomModalShell>
      {(close) => (
        <>
          <ScreenScrollView>
            {/* No eyebrow, no screen header. Both said "settings" above a screen
                whose every section already says what it is, and the title pushed
                the first real control below the fold. The profile card is the top
                of the screen now, and carries the close. */}
            <ProfileCard
              email={emailStatus?.email ?? null}
              fullName={auth.user?.fullName ?? ""}
              onClose={close}
              phone={phone}
              photoUrl={auth.user?.profilePhotoUrl ?? null}
            />

            <Section title="Identity">
              <IdentityCard />
            </Section>

            <Section title="PIN">
              <SettingsRow
                icon={DialpadIcon}
                title="Change PIN"
                description="Use current PIN, verify OTP, then choose a new PIN."
                onPress={() => setPinModalMode("change")}
              />
              <SettingsRow
                icon={ShieldCheck}
                title="Forgot PIN"
                description="Recover with OTP verification and set a fresh PIN."
                onPress={() => setPinModalMode("forgot")}
              />
            </Section>

            <Section title="Signed-in devices">
              <SessionCountdown />
              <SignedInDevices />
            </Section>

            <Section title="Device alerts">
              <Card>
                <PreferenceRow
                  icon={BellRing}
                  title="Push notifications"
                  description={notificationsEnabled ? "This device is registered." : "Enable alerts on this device."}
                  right={
                    <Switch
                      disabled={notificationsBusy}
                      value={notificationsEnabled}
                      onValueChange={(value) => void handleNotificationToggle(value)}
                      trackColor={{ false: colors.neutralSoft, true: colors.primary }}
                      thumbColor={colors.surface}
                    />
                  }
                />
                {activeDevice ? (
                  <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.mono }]}>
                    {activeDevice.platform} / {activeDevice.provider} / last seen {formatRelativeTime(activeDevice.lastSeenAt)}
                  </Text>
                ) : null}
              </Card>
            </Section>

            <Section title="Display">
              <Card>
                <PreferenceRow
                  icon={Moon}
                  title="Dark mode"
                  description="Paused while we polish the new UI."
                  right={
                    <Switch
                      value={false}
                      onValueChange={handleThemeToggle}
                      trackColor={{ false: colors.neutralSoft, true: colors.primary }}
                      thumbColor={colors.surface}
                    />
                  }
                />

                <Divider />

                <PreferenceRow
                  icon={Smartphone}
                  title="App version"
                  description="Khatiyan mobile demo"
                  right={
                    <Text
                      style={{
                        color: colors.ink,
                        fontFamily: fonts.mono,
                        fontSize: 13,
                        fontWeight: "800",
                      }}
                    >
                      v1
                    </Text>
                  }
                />
              </Card>
            </Section>

            {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
          </ScreenScrollView>

          <PinVerificationModal
            busy={pinFlowBusy}
            mode={pinModalMode}
            phone={phone}
            onClose={() => setPinModalMode(null)}
            onRequestOtp={async () => {
              await requestPinReset({ phone, channel: "SMS" }).unwrap();
            }}
            onVerifyOtp={async (otp) => {
              await verifyOtp({ phone, otp, purpose: "PIN_RESET" }).unwrap();
            }}
            onConfirm={async ({ currentPin, newPin, otp }) => {
              const activeMode = pinModalMode;
              const response =
                activeMode === "change"
                  ? await changePin({ currentPin, otp, newPin }).unwrap()
                  : await confirmPinReset({ phone, otp, newPin }).unwrap();
              await persistTokenSession(response);
              setPinModalMode(null);
              toast.success(activeMode === "change" ? "PIN changed successfully." : "PIN reset successfully.");
            }}
          />
        </>
      )}
    </BloomModalShell>
  );
}

/**
 * Identity at the top of settings: who you are, and the two things you can
 * change about it. Phone is deliberately read-only — changing it needs its own
 * OTP re-verification flow, which the backend does not expose.
 */
function DialpadIcon({ color, size }: LucideProps) {
  return <MaterialCommunityIcons color={typeof color === "string" ? color : undefined} name="dialpad" size={typeof size === "number" ? size : 18} />;
}

function ProfileCard({
  email,
  fullName,
  onClose,
  phone,
  photoUrl,
}: {
  email: string | null;
  fullName: string;
  onClose: () => void;
  phone: string;
  photoUrl: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <Card>
      {/* The close sits in the card's top-right, absolutely positioned so it
          does not push the avatar off centre. This card is the top of the screen
          now that the headers are gone, so it carries the way out. */}
      <AnimatedPressable
        accessibilityLabel="Close settings"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onClose}
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: 999,
          height: 32,
          justifyContent: "center",
          position: "absolute",
          right: spacing.md,
          top: spacing.md,
          width: 32,
          zIndex: 1,
        }}
      >
        <X color={colors.ink} size={16} strokeWidth={2.4} />
      </AnimatedPressable>

      <View style={{ alignItems: "center", gap: spacing.sm }}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ borderRadius: 999, height: 84, width: 84 }}
          />
        ) : (
          // Same treatment as the profile screen's avatar: an outlined ring
          // with ink initials. The tinted disc read as a coloured tile behind a
          // glyph, which is the one thing the icon rule rules out.
          <View
            style={{
              alignItems: "center",
              borderColor: colors.border,
              borderRadius: 999,
              borderWidth: 1,
              height: 84,
              justifyContent: "center",
              width: 84,
            }}
          >
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 30, letterSpacing: 0.5 }}>
              {initials || "?"}
            </Text>
          </View>
        )}

        {/* Read-only. This card is an identity reminder at the top of settings;
            the name, photo and email are all edited on the profile screen,
            where they are the subject rather than a header. */}
        <Text
          numberOfLines={1}
          style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21 }}
        >
          {fullName || "Add your name"}
        </Text>

        <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.mono }]}>
          {phone}
        </Text>
      </View>

      <Divider />

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Mail color={colors.kicker} size={16} strokeWidth={2.2} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>Email</Text>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
            {email ?? "Not added"}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function PinVerificationModal({
  busy,
  mode,
  onClose,
  onConfirm,
  onRequestOtp,
  onVerifyOtp,
  phone,
}: {
  busy: boolean;
  mode: PinModalMode | null;
  onClose: () => void;
  onConfirm: (payload: { currentPin: string; newPin: string; otp: string }) => Promise<void>;
  onRequestOtp: () => Promise<void>;
  onVerifyOtp: (otp: string) => Promise<void>;
  phone: string;
}) {
  // Refusals inside the PIN flow: wrong PIN, expired code.
  const pinErrors = useFormErrors<never>();

  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [step, setStep] = useState<PinFlowStep>("details");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  // Route this modal's status copy through the global toast; null clears no-op.
  const setMessage = useCallback(
    (value: string | null) => {
      if (value) {
        if (classifyToast(value) === "error") {
          pinErrors.failFromServer(value);
          return;
        }
        toast.show(value);
      }
    },
    [toast],
  );

  function resetAndClose() {
    setStep("details");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setOtp("");
    setMessage(null);
    onClose();
  }

  function validatePinPair() {
    if (!isValidCode(newPin)) {
      setMessage("New PIN must be exactly 6 digits.");
      return false;
    }
    if (newPin !== confirmPin) {
      setMessage("Both new PIN entries must match.");
      return false;
    }
    return true;
  }

  function validateDetails() {
    if (mode === "change" && !isValidCode(currentPin)) {
      setMessage("Enter your current 6 digit PIN.");
      return false;
    }

    if (!validatePinPair()) {
      return false;
    }

    if (mode === "change" && currentPin === newPin) {
      setMessage("New PIN must be different from current PIN.");
      return false;
    }
    return true;
  }

  async function handleRequestOtp() {
    setMessage(null);
    if (mode === "change" && !validateDetails()) {
      return;
    }

    try {
      await onRequestOtp();
      setStep("otp");
      setMessage("OTP sent for PIN verification.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleVerifyOtp() {
    setMessage(null);
    if (!isValidCode(otp)) {
      setMessage("Enter the 6 digit OTP.");
      return;
    }

    try {
      await onVerifyOtp(otp);
      setStep("pin");
      setMessage("OTP verified. Choose your new PIN.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function handleConfirm() {
    setMessage(null);
    if (!isValidCode(otp)) {
      setMessage("Enter the 6 digit OTP.");
      return;
    }
    if (mode === "forgot" && !validatePinPair()) {
      return;
    }

    try {
      await onConfirm({ currentPin, newPin, otp });
      resetFields();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function resetFields() {
    setStep("details");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setOtp("");
    setMessage(null);
  }

  const visible = mode !== null;
  const title = mode === "change" ? "Change PIN" : "Forgot PIN";
  // The number is named inline rather than given its own labelled block: it is
  // one fact, and the block cost enough height to push the tallest step off a
  // static (non-scrolling) card once the keypad was up.
  const subtitle = step === "otp"
    ? `Enter the OTP sent to ${phone}.`
    : step === "pin"
      ? "OTP verified. Choose and confirm a fresh PIN."
      : mode === "change"
        ? `Enter your current PIN and a new one. We'll send an OTP to ${phone}.`
        : `We'll send an OTP to ${phone} before you choose a fresh PIN.`;

  return (
    <Modal animationType="fade" statusBarTranslucent transparent visible={visible} navigationBarTranslucent onRequestClose={resetAndClose}>
      {/* A plain dim, not a blur — see ProfileEditModal for the reasoning: a
          Modal is its own window on Android, so expo-blur has nothing it is
          allowed to sample. */}
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        {/* "padding" on both platforms: Expo 56 Android is edge-to-edge, where
            adjustResize no longer resizes the modal window, so leaving Android
            undefined let the keyboard sit over the buttons. */}
        <KeyboardAvoidingView
          behavior="padding"
          style={{
            maxWidth: 520,
            width: "100%",
          }}
        >
          {/* Deliberately not scrollable. The whole flow is short enough to sit
              on one static page, and a scroll view here made a five-field form
              feel like a document — the tallest step is three PIN fields and a
              button, which fits with room to spare. */}
          <Card
            style={{
              borderRadius: 18,
              gap: spacing.lg,
              overflow: "hidden",
              paddingBottom: spacing.xl,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ gap: spacing.lg }}>
              <View style={{ gap: spacing.md }}>
              {/* flex-start, not center: the left column is three lines tall, so
                  centring floated the close button down to its middle instead of
                  pinning it to the card's top corner. */}
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={[type.eyebrow, { color: colors.primary }]}>
                    PIN verification
                  </Text>
                  <Text
                    style={{
                      color: colors.ink,
                      fontFamily: fonts.display,
                      fontSize: 24,
                    }}
                  >
                    {title}
                  </Text>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    {subtitle}
                  </Text>
                </View>
                <CloseButton onPress={resetAndClose} />
              </View>

              </View>

              <View style={{ gap: spacing.md, paddingTop: spacing.xs }}>
                {/* Said before the PIN is typed, not after the sign-out. A new
                    PIN invalidates every token the account holds, so any other
                    phone or tablet still signed in is dropped too — surprising
                    if you are mid-task on one of them, and unguessable from a
                    screen that only talks about this device. */}
                <NoticeBar
                  message="Any other phone or tablet signed in to this account is signed out too."
                  title="This signs you out everywhere"
                  tone="warning"
                />
                {step === "details" ? (
                  <>
                    {mode === "change" ? (
                      <>
                        <CodeField label="Current PIN" secureTextEntry value={currentPin} onChangeText={setCurrentPin} />
                        <CodeField label="New PIN" secureTextEntry value={newPin} onChangeText={setNewPin} />
                        <CodeField label="Retype PIN" secureTextEntry value={confirmPin} onChangeText={setConfirmPin} />
                      </>
                    ) : null}
                    <PrimaryButton busy={busy} label="Send OTP" onPress={() => void handleRequestOtp()} />
                  </>
                ) : step === "otp" ? (
                  <>
                    <CodeField label="OTP" value={otp} onChangeText={setOtp} />
                    <PrimaryButton
                      busy={busy}
                      label={mode === "change" ? "Change PIN" : "Verify OTP"}
                      onPress={() => void (mode === "change" ? handleConfirm() : handleVerifyOtp())}
                    />
                    <SecondaryButton busy={busy} label="Resend OTP" onPress={() => void handleRequestOtp()} />
                  </>
                ) : (
                  <>
                    <CodeField label="New PIN" secureTextEntry value={newPin} onChangeText={setNewPin} />
                    <CodeField label="Retype PIN" secureTextEntry value={confirmPin} onChangeText={setConfirmPin} />
                    <PrimaryButton busy={busy} label="Reset PIN" onPress={() => void handleConfirm()} />
                  </>
                )}
              </View>
            </View>

            {/* Measured inside the modal window so the card clears the gesture
                bar; without it the last button ends up under the nav area. */}
            <SafeAreaView edges={["bottom"]} />
          </Card>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SettingsRow({
  description,
  icon: Icon,
  onPress,
  title,
}: {
  description: string;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.lg,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            borderColor: colors.ink,
            borderWidth: 1,
            borderRadius: 10,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          <Icon color={colors.ink} size={18} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 18,
            }}
          >
            {title}
          </Text>
          <Text style={[type.body, { color: colors.muted, fontSize: 13 }]}>
            {description}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function PreferenceRow({
  description,
  icon: Icon,
  right,
  title,
}: {
  description: string;
  icon: typeof BellRing;
  right: ReactNode;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
      <View
        style={{
          alignItems: "center",
          borderColor: colors.ink,
          borderWidth: 1,
          borderRadius: 10,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <Icon color={colors.ink} size={18} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 18,
          }}
        >
          {title}
        </Text>
        <Text style={[type.body, { color: colors.muted, fontSize: 13 }]}>
          {description}
        </Text>
      </View>
      {right}
    </View>
  );
}

function PrimaryButton({ busy, label, onPress }: { busy?: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      onPress={busy ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.primary,
        borderRadius: 12,
        justifyContent: "center",
        minHeight: 52,
        padding: spacing.md,
      }}
    >
      {busy ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text
          style={{
            color: colors.onPrimary,
            fontFamily: fonts.sansBold,
            fontSize: 14,
            letterSpacing: 0.4,
          }}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function SecondaryButton({ busy, label, onPress }: { busy?: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      onPress={busy ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: "transparent",
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 48,
        padding: spacing.md,
      }}
    >
      <Text
        style={{
          color: colors.primary,
          fontFamily: fonts.sansBold,
          fontSize: 13,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Close settings"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        height: 36,
        justifyContent: "center",
        width: 36,
      }}
    >
      <X color={colors.ink} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: { message?: string } }).data;
    if (data?.message) {
      return data.message;
    }
  }

  if (typeof error === "object" && error && "status" in error) {
    const queryError = error as { status?: unknown; error?: unknown; data?: unknown };
    if (queryError.status === "FETCH_ERROR") {
      return "Could not reach the backend.";
    }
    if (typeof queryError.status === "number") {
      if (typeof queryError.data === "object" && queryError.data && "message" in queryError.data) {
        const message = (queryError.data as { message?: unknown }).message;
        if (typeof message === "string") {
          return message;
        }
      }
      return `Request failed with HTTP ${queryError.status}.`;
    }
    if (typeof queryError.error === "string") {
      return queryError.error;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function isValidCode(value: string) {
  return /^\d{6}$/.test(value);
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}


/**
 * The particulars an agreement names you by.
 *
 * <p>Permanent address, date of birth and gender. None of them gate profile
 * completion — that stays name, phone and email — because a tenant with no
 * agreement never needs any of them, and blocking a profile on fields most
 * people will not use would be a wall in front of everyone to serve a few.
 *
 * <p>The address IS required to onboard a tenant, but the demand belongs at
 * onboarding, where it can say why. A settings screen refusing to save until you
 * supply an address cannot explain what it is for.
 *
 * <p>Age and gender are optional even there. The deed omits them when absent
 * rather than printing a blank, so nobody has to answer a question they would
 * rather not to let a tenancy start.
 */
function IdentityCard() {
  const { colors, type } = useTheme();
  const toast = useToast();
  const identityQuery = useGetMyIdentityQuery();
  const [saveIdentity, saveState] = useUpdateMyIdentityMutation();
  const form = useFormErrors<"pincode">();

  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);

  // Seeded once the server copy lands. Keyed on the record's id so a cache
  // refresh does not wipe an edit in progress.
  useEffect(() => {
    const held = identityQuery.data;
    if (!held) {
      return;
    }
    setAddress(held.permanentAddress ?? "");
    setPincode(held.permanentAddressPincode ?? "");
    setDob(held.dateOfBirth ?? "");
    setGender(held.gender);
  }, [identityQuery.data?.id]);

  const save = async () => {
    // A PIN code is either six digits or absent. Half of one is neither, and it
    // is the only field here the server will refuse.
    if (!form.validate(pincode.trim() && !/^\d{6}$/.test(pincode.trim())
      ? { pincode: "A PIN code is 6 digits." }
      : {})) {
      return;
    }

    try {
      await saveIdentity({
        dateOfBirth: dob.trim() ? dob.trim() : null,
        gender,
        permanentAddress: address.trim() ? address.trim() : null,
        permanentAddressPincode: pincode.trim() ? pincode.trim() : null,
      }).unwrap();
      toast.success("Details saved");
    } catch (caught) {
      form.failFromServer(errorMessage(caught));
    }
  };

  return (
    <Card>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
        Used on tenancy agreements. Your permanent address is needed before you can onboard a tenant. Age and
        gender are optional, and are left off the agreement when blank.
      </Text>

      <FormInput
        label="Permanent address"
        multiline
        onChangeText={setAddress}
        placeholder=""
        value={address}
      />
      <FormInput
        error={form.errors.pincode}
        keyboardType="number-pad"
        label="PIN code"
        maxLength={6}
        onChangeText={(text) => {
          setPincode(text.replace(/[^0-9]/g, ""));
          form.clearField("pincode");
        }}
        placeholder=""
        value={pincode}
      />
      {/* No "(optional)" suffix. The paragraph above already says which fields
          are optional, and repeating it on every label makes the required ones
          look like an oversight rather than a rule. */}
      <DateOfBirthField onChange={setDob} value={dob} />

      <GenderPicker onChange={setGender} value={gender} />

      <ActionButton
        disabled={saveState.isLoading || form.blocked}
        label="Save details"
        onPress={() => void save()}
      />

      {form.serverError ? (
        <AlertModal message={form.serverError} onClose={form.dismissServerError} />
      ) : null}
    </Card>
  );
}
