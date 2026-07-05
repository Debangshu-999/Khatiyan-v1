import { useState } from "react";
import { Image, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import * as ImagePicker from "expo-image-picker";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  Building2,
  Camera,
  Check,
  ChevronRight,
  FileBadge2,
  Home,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
} from "lucide-react-native";

import { clearStoredSession } from "@/auth/session-storage";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { loadPinnedOwnerModulesForUser, saveActiveAccount } from "@/config/app-settings-storage";
import { accountDescription, accountLabel, useAvailableAccounts, type AccountType } from "@/features/account/accounts";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetEmailRecoveryStatusQuery, useGetProfileQuery, useRequestEmailVerificationMutation, useUpdateRecoveryEmailMutation } from "@/store/services/auth-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { clearActiveAccount, setActiveAccount } from "@/store/slices/account-slice";
import { clearSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function AccountScreen() {
  const router = useGuardedRouter();
  const dispatch = useAppDispatch();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const auth = useAppSelector((state) => state.auth);
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const profileQuery = useGetProfileQuery();
  const emailRecoveryQuery = useGetEmailRecoveryStatusQuery(undefined, { skip: !auth.accessToken });
  const [updateRecoveryEmail, updateRecoveryEmailState] = useUpdateRecoveryEmailMutation();
  const [requestEmailVerification, requestEmailVerificationState] = useRequestEmailVerificationMutation();
  const user = profileQuery.data ?? auth.user;
  const { accounts, loading: accountsLoading } = useAvailableAccounts();
  const ownerPropertiesQuery = useListMyPropertiesQuery(undefined, { skip: !accounts.includes("owner") });
  const ownerPropertyCount = ownerPropertiesQuery.data?.length ?? 0;
  const accessLabel = activeAccount
    ? accountLabel(activeAccount)
    : accountsLoading
      ? "Checking"
      : accessLabelFor(user?.role, Boolean(user?.activeTenant), accounts.includes("manager"));

  async function switchAccount(account: AccountType) {
    dispatch(setActiveAccount(account));
    await saveActiveAccount(account);
    if (user?.id) {
      const pins = await loadPinnedOwnerModulesForUser(user.id);
      dispatch(setPinnedOwnerModules(pins));
    } else {
      dispatch(setPinnedOwnerModules([]));
    }
  }

  async function handleLogout() {
    dispatch(clearActiveAccount());
    dispatch(setPinnedOwnerModules([]));
    void saveActiveAccount(null);
    dispatch(clearSession());
    dispatch(api.util.resetApiState());
    await clearStoredSession();
    router.replace("/auth");
  }

  const displayName = user?.fullName?.trim() || "Khatiyan user";
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const profileImageUri = pickedImageUri ?? profileQuery.data?.profilePhotoUrl ?? null;

  async function saveRecoveryEmail() {
    const email = emailDraft.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid recovery email address.");
      return;
    }
    try {
      await updateRecoveryEmail({ email }).unwrap();
      setEmailDraft("");
      toast.success("Recovery email added. Verify it before using email sign-in or PIN reset.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add recovery email.");
    }
  }

  async function sendVerificationLink() {
    try {
      await requestEmailVerification().unwrap();
      toast.success("Verification link sent to your recovery email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send verification link.");
    }
  }
  async function pickProfileImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedImageUri(result.assets[0].uri);
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        // eyebrow="Account"
        title={user?.activeTenant ? "Tenant" : "Your"}
        italicTail="profile."
        subtitle="Your identity, account access and saved details."
        trailing={<HeaderIconButton icon={Settings} label="Open settings" onPress={() => router.push("/account-settings")} />}
      />

      <View style={{ alignItems: "center", gap: spacing.md }}>
        <ProfileAvatar imageUri={profileImageUri} name={displayName} onEdit={() => void pickProfileImage()} />
        <View style={{ alignItems: "center", gap: spacing.xxs }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.sans,
              fontSize: 20,
              fontWeight: "900",
              textAlign: "center",
            }}
            selectable
          >
            {displayName}
          </Text>
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]} selectable>
            {accessLabel}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Personal information" />
        <Card style={{ gap: spacing.sm, padding: spacing.md }}>
          <ReadonlyField label="Registered phone" value={user?.phone ?? "-"} />
          <ReadonlyField label="Workspace access" value={accessLabel} />
          <ReadonlyField label="Account standing" value={user?.active ? "Active" : "Inactive"} />
          <ReadonlyField label="Phone verification" value={user?.phoneVerified ? "Verified" : "Pending"} />
          {emailRecoveryQuery.data?.email ? (
            <View style={{ gap: spacing.xs }}>
              <ReadonlyField label="Recovery email" value={emailRecoveryQuery.data.email} />
              <AnimatedPressable
                disabled={emailRecoveryQuery.data.verified || requestEmailVerificationState.isLoading}
                onPress={() => void sendVerificationLink()}
                style={{ alignItems: "center", backgroundColor: emailRecoveryQuery.data.verified ? colors.primarySoft : colors.primarySoft, borderRadius: 12, minHeight: 42, justifyContent: "center", paddingHorizontal: spacing.md }}
              >
                <Text style={{ color: colors.primary, fontFamily: fonts.sans, fontWeight: "800" }}>
                  {emailRecoveryQuery.data.verified ? "Email verified" : requestEmailVerificationState.isLoading ? "Sending verification link..." : "Verify email"}
                </Text>
              </AnimatedPressable>
            </View>
          ) : (
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.caption, { color: colors.ink, fontWeight: "900" }]}>Recovery email</Text>
              <AppTextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmailDraft}
                placeholder="Add recovery email"
                placeholderTextColor={colors.muted}
                value={emailDraft}
                style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.ink, fontFamily: fonts.sans, minHeight: 46, paddingHorizontal: spacing.md }}
              />
              <AnimatedPressable
                disabled={!emailDraft.trim() || updateRecoveryEmailState.isLoading}
                onPress={() => void saveRecoveryEmail()}
                style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 12, minHeight: 42, justifyContent: "center", paddingHorizontal: spacing.md }}
              >
                <Text style={{ color: colors.primary, fontFamily: fonts.sans, fontWeight: "800" }}>
                  {updateRecoveryEmailState.isLoading ? "Adding email..." : "Add recovery email"}
                </Text>
              </AnimatedPressable>
            </View>
          )}
          <ReadonlyField label="Account reference" value={shortId(user?.id)} mono />
        </Card>
      </View>

      {accounts.length > 1 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle title="Switch account" />
          <View style={{ gap: spacing.sm }}>
            {accounts.map((account) => (
              <AccountRow account={account} active={account === activeAccount} key={account} onPress={() => switchAccount(account)} />
            ))}
          </View>
        </View>
      ) : null}

      {accounts.includes("owner") ? (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle title="Registered properties" />
          <Card style={{ gap: spacing.sm, padding: spacing.md }}>
            <ReadonlyField
              label="Owner portfolio"
              value={
                ownerPropertiesQuery.isFetching
                  ? "Loading"
                  : `${ownerPropertyCount} registered propert${ownerPropertyCount === 1 ? "y" : "ies"}`
              }
            />
            <SettingsAction
              description="Add a new PG, hostel or apartment and create its discovery profile."
              icon={Plus}
              meta="Register"
              onPress={() => router.push("/owner-register-property")}
              title="Register new property"
            />
          </Card>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Verification documents" />
        <SettingsAction
          icon={FileBadge2}
          title="Identity documents"
          description="Aadhaar or PAN upload will live here for future tenancy onboarding."
          meta="Planned"
        />
      </View>

      <AnimatedPressable
        onPress={handleLogout}
        style={{
          alignItems: "center",
          backgroundColor: "transparent",
          borderColor: colors.danger,
          borderRadius: 14,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          justifyContent: "center",
          minHeight: 52,
          padding: spacing.md,
        }}
      >
        <LogOut color={colors.danger} size={17} strokeWidth={2} />
        <Text style={{ color: colors.danger, fontFamily: fonts.sans, fontSize: 14, fontWeight: "800" }} selectable>
          Sign out
        </Text>
      </AnimatedPressable>
    </ScreenScrollView>
  );
}

function ProfileAvatar({ imageUri, name, onEdit }: { imageUri: string | null; name: string; onEdit: () => void }) {
  const { colors, fonts } = useTheme();
  const initials = initialsFor(name);

  return (
    <View style={{ height: 108, width: 108 }}>
      <View
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderRadius: 54,
          borderWidth: 1,
          height: 108,
          justifyContent: "center",
          overflow: "hidden",
          width: 108,
        }}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ height: 108, width: 108 }} />
        ) : (
          <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 40, fontWeight: "900", letterSpacing: 0.5 }} selectable>
            {initials}
          </Text>
        )}
      </View>

      <AnimatedPressable
        accessibilityLabel="Change profile photo"
        accessibilityRole="button"
        onPress={onEdit}
        style={{
          alignItems: "center",
          backgroundColor: colors.primary,
          borderColor: colors.background,
          borderRadius: 18,
          borderWidth: 2,
          bottom: -2,
          height: 36,
          justifyContent: "center",
          position: "absolute",
          right: -2,
          width: 36,
        }}
      >
        <Camera color={colors.onPrimary} size={17} strokeWidth={2.2} />
      </AnimatedPressable>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ color: colors.terracotta, fontFamily: fonts.sans, fontSize: 17, fontWeight: "900" }} selectable>
      {title}
    </Text>
  );
}

function ProfileInfoBox({ label, value }: { label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <Text style={[type.caption, { color: colors.inkSoft, fontWeight: "700" }]} selectable>
        {label}
      </Text>
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 15,
          fontWeight: "800",
        }}
        numberOfLines={1}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function ReadonlyField({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "900", letterSpacing: 0.2 }]} selectable>
        {label}
      </Text>
      <View
        style={{
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          minHeight: 46,
          justifyContent: "center",
          paddingHorizontal: spacing.md,
        }}
      >
        <Text
          style={{
            color: colors.ink,
            fontFamily: mono ? fonts.mono : fonts.sans,
            fontSize: 15,
            fontWeight: "700",
          }}
          selectable
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function AccountRow({ account, active, onPress }: { account: AccountType; active: boolean; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const Icon = account === "owner" ? Building2 : account === "manager" ? ShieldCheck : Home;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: active ? colors.borderStrong : colors.border,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: active ? colors.ink : colors.surfaceRaised,
          borderRadius: 12,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        <Icon color={active ? colors.surface : colors.inkSoft} size={19} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 16, fontWeight: "900" }} selectable>
          {accountLabel(account)}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          {accountDescription(account)}
        </Text>
      </View>
      {active ? <Check color={colors.ink} size={20} strokeWidth={2.4} /> : <ChevronRight color={colors.kicker} size={20} strokeWidth={2.2} />}
    </AnimatedPressable>
  );
}

function HeaderIconButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Settings;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
    >
      <Icon color={colors.ink} size={22} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function SettingsAction({
  description,
  icon: Icon,
  meta,
  onPress,
  title,
}: {
  description: string;
  icon: typeof FileBadge2;
  meta: string;
  onPress?: () => void;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();

  const body = (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderRadius: 12,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        <Icon color={colors.inkSoft} size={18} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 16, fontWeight: "900" }} selectable>
          {title}
        </Text>
        <Text style={[type.body, { color: colors.muted, fontSize: 13 }]} selectable>
          {description}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
        <Text style={[type.eyebrow, { color: colors.kicker, fontSize: 10 }]} selectable>
          {meta}
        </Text>
        <ChevronRight color={colors.kicker} size={18} strokeWidth={2} />
      </View>
    </View>
  );

  return (
    <Card>
      {onPress ? (
        <AnimatedPressable accessibilityRole="button" onPress={onPress}>
          {body}
        </AnimatedPressable>
      ) : (
        body
      )}
    </Card>
  );
}

function accessLabelFor(role: string | undefined, activeTenant: boolean, managesAnyProperty: boolean) {
  if (role === "OWNER") {
    return "Owner";
  }
  if (managesAnyProperty) {
    return "Manager";
  }
  if (activeTenant) {
    return "Tenant";
  }
  return role ? humanizeToken(role) : "-";
}

function initialsFor(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "KH";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function shortId(value?: string) {
  if (!value) {
    return "-";
  }
  return value.slice(0, 8).toUpperCase();
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
