import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import {
  ChevronRight,
  FileBadge2,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react-native";

import { clearStoredSession } from "@/auth/session-storage";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetProfileQuery } from "@/store/services/auth-api";
import { clearSession } from "@/store/slices/auth-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function AccountScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors, fonts, type } = useTheme();
  const auth = useAppSelector((state) => state.auth);
  const profileQuery = useGetProfileQuery();
  const user = profileQuery.data ?? auth.user;

  async function handleLogout() {
    dispatch(clearSession());
    dispatch(api.util.resetApiState());
    await clearStoredSession();
    router.replace("/auth");
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        title="Your"
        italicTail="profile."
        subtitle="Identity, security and app preferences for this device."
        trailing={<HeaderIconButton icon={Settings} label="Open settings" onPress={() => router.push("/account-settings")} />}
      />

      <Card>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.primarySoft,
              borderColor: colors.primary,
              borderRadius: 18,
              borderWidth: 1,
              height: 64,
              justifyContent: "center",
              width: 64,
            }}
          >
            <UserRound color={colors.primary} size={28} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Signed in as
            </Text>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 26,
                fontWeight: "500",
                letterSpacing: -0.3,
              }}
              selectable
            >
              {user?.fullName ?? "Khatiyan user"}
            </Text>
            <Text style={[type.body, { color: colors.muted, fontFamily: fonts.mono, fontSize: 14 }]} selectable>
              {user?.phone ?? "-"}
            </Text>
          </View>
        </View>

        <Divider />

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ProfileStat label="Role" value={user?.role ? humanizeToken(user.role) : "-"} />
          <ProfileStat label="Tenancy" value={user?.activeTenant ? "Active" : "Not active"} />
        </View>

        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          <ProfileRow label="Account status" value={user?.active ? "Active" : "Inactive"} />
          <ProfileDivider />
          <ProfileRow label="Phone verification" value={user?.phoneVerified ? "Verified" : "Pending"} />
          <ProfileDivider />
          <ProfileRow label="Profile completion" value={user?.profileCompleted ? "Complete" : "Basic"} />
          <ProfileDivider />
          <ProfileRow label="Account ID" value={shortId(user?.id)} mono />
        </View>
      </Card>

      <Section eyebrow="Documents" title="Verification documents">
        <SettingsAction
          icon={FileBadge2}
          title="Identity documents"
          description="Aadhaar or PAN upload will live here for future tenancy onboarding."
          meta="Planned"
        />
      </Section>

      <AnimatedPressable
        onPress={handleLogout}
        style={{
          alignItems: "center",
          backgroundColor: "transparent",
          borderColor: colors.danger,
          borderRadius: 12,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          justifyContent: "center",
          minHeight: 52,
          padding: spacing.md,
        }}
      >
        <LogOut color={colors.danger} size={17} strokeWidth={2} />
        <Text
          style={{
            color: colors.danger,
            fontFamily: fonts.sans,
            fontSize: 14,
            fontWeight: "700",
            letterSpacing: 0.4,
          }}
          selectable
        >
          Sign out
        </Text>
      </AnimatedPressable>
    </ScreenScrollView>
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
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        height: 46,
        justifyContent: "center",
        width: 46,
      }}
    >
      <Icon color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function ProfileRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between", padding: spacing.md }}>
      <Text style={[type.body, { color: colors.muted, flex: 1 }]} selectable>
        {label}
      </Text>
      <Text
        style={[
          type.body,
          {
            color: colors.ink,
            flex: 1,
            fontFamily: mono ? fonts.mono : fonts.sans,
            fontWeight: "800",
            textAlign: "right",
          },
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function ProfileDivider() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, height: 1, marginHorizontal: spacing.md, opacity: 0.8 }} />;
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {label}
      </Text>
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.display,
          fontSize: 18,
          fontWeight: "500",
        }}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function SettingsAction({
  description,
  icon: Icon,
  meta,
  title,
}: {
  description: string;
  icon: typeof FileBadge2;
  meta: string;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.primarySoft,
            borderRadius: 10,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          <Icon color={colors.primary} size={18} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 18,
              fontWeight: "500",
            }}
            selectable
          >
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
    </Card>
  );
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
