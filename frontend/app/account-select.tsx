import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Building2, Home, ShieldCheck, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { loadPinnedOwnerModulesForUser, saveActiveAccount } from "@/config/app-settings-storage";
import { accountDescription, accountLabel, useAvailableAccounts, type AccountType } from "@/features/account/accounts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setActiveAccount } from "@/store/slices/account-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function AccountSelectScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors, type } = useTheme();
  const auth = useAppSelector((state) => state.auth);
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const { accounts, loading } = useAvailableAccounts();

  useEffect(() => {
    if (!auth.accessToken) {
      router.replace("/auth");
    }
  }, [auth.accessToken, router]);

  useEffect(() => {
    if (loading || !auth.accessToken) {
      return;
    }

    if (activeAccount && accounts.includes(activeAccount)) {
      router.replace("/(tabs)");
      return;
    }

    if (accounts.length === 0) {
      dispatch(setPinnedOwnerModules([]));
      router.replace("/(tabs)");
      return;
    }

    if (accounts.length === 1) {
      dispatch(setActiveAccount(accounts[0]));
      void saveActiveAccount(accounts[0]);
      if (auth.user?.id) {
        void loadPinnedOwnerModulesForUser(auth.user.id).then((pins) => dispatch(setPinnedOwnerModules(pins)));
      }
      router.replace("/(tabs)");
    }
  }, [accounts, activeAccount, auth.accessToken, dispatch, loading, router]);

  async function selectAccount(account: AccountType) {
    dispatch(setActiveAccount(account));
    await saveActiveAccount(account);
    if (auth.user?.id) {
      const pins = await loadPinnedOwnerModulesForUser(auth.user.id);
      dispatch(setPinnedOwnerModules(pins));
    } else {
      dispatch(setPinnedOwnerModules([]));
    }
    router.replace("/(tabs)");
  }

  if (loading || accounts.length <= 1 || activeAccount) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        eyebrow="Account access"
        title="Continue"
        italicTail="as."
        subtitle="Choose the workspace for this session."
      />

      <View style={{ gap: spacing.md }}>
        {accounts.map((account) => (
          <AccountChoiceCard account={account} key={account} onPress={() => selectAccount(account)} />
        ))}
      </View>

      <Card tone="sunken">
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          You can switch account mode later from Account settings.
        </Text>
      </Card>
    </ScreenScrollView>
  );
}

function AccountChoiceCard({ account, onPress }: { account: AccountType; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();
  const Icon = iconFor(account);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.lg,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.primarySoft,
          borderRadius: 16,
          height: 56,
          justifyContent: "center",
          width: 56,
        }}
      >
        <Icon color={colors.primary} size={25} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 24,
            fontWeight: "500",
            lineHeight: 30,
          }}
          selectable
        >
          {accountLabel(account)}
        </Text>
        <Text style={[type.body, { color: colors.muted }]} selectable>
          {accountDescription(account)}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function iconFor(account: AccountType): ComponentType<LucideProps> {
  if (account === "owner") {
    return Building2;
  }
  if (account === "manager") {
    return ShieldCheck;
  }
  return Home;
}
