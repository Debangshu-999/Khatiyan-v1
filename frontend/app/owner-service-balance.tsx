import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { AppState, Linking, Platform, Text, View } from "react-native";
import { WalletLockCard } from "@/features/billing/wallet-lock-card";
import { WalletTransactionSkeleton, WalletTransactionsErrorCard } from "@/features/billing/wallet-loading-ui";
import { WalletPinGate, WalletPinModal } from "@/features/billing/wallet-pin-gate";
import { saveWalletAccess } from "@/auth/wallet-access";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { AppTextInput } from "@/components/app-text-input";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleAlert,
  Lock,
  ChevronRight,
  type LucideProps,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ServiceBalanceTransactionRow, TransactionSeparator } from "@/features/billing/service-balance-transaction-row";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useToast } from "@/components/toast";
import { DepositHistoryArtwork } from "@/features/billing/deposit-account-ui";
import { ActionButton, ConfirmDialog, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import {
  useGetServiceBalanceQuery,
  useSetWalletLockMutation,
  useListServiceBalanceEntriesQuery,
  useLazyGetServiceBalanceTopUpQuery,
  useStartServiceBalanceTopUpMutation,
  type ServiceBalanceEntry,
} from "@/store/services/service-balance-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Where the checkout page sends the payer back to.
 *
 * <p>The in-app tab closes itself the moment the page redirects here, so the
 * owner lands back on this screen without having to find a close button.
 */
const CHECKOUT_RETURN_URL = "khatiyan://service-balance";

/**
 * Opens the gateway, in the app if the phone can.
 *
 * <p>An in-app browser tab — Chrome Custom Tabs on Android, Safari's view
 * controller on iOS — keeps the payment inside the app and closes itself on the
 * return redirect. That is what most apps you have seen are doing, rather than
 * a native payment SDK.
 *
 * <p><b>Every failure falls through to the phone's browser.</b> The tab module
 * is missing in a development build made before it was installed, and a phone
 * with no Custom Tabs provider refuses the tab outright. Neither is a reason an
 * owner should be unable to pay, so the browser handles both — and because the
 * page redirects back to our scheme, even that route returns to the app.
 *
 * @returns how it opened, so the screen can say so
 */
async function openCheckout(url: string): Promise<{ via: "in-app" | "browser"; reason: string }> {
  // Web has no tab to open inside, and a popup after an await is blocked by
  // every browser worth the name.
  if (Platform.OS === "web") {
    await Linking.openURL(url);
    return { reason: "web", via: "browser" };
  }

  let reason = "unknown";
  try {
    // Required lazily: a build without the native module throws on use rather
    // than on import, and an import at module scope would take the screen
    // down with it.
    const webBrowser = require("expo-web-browser") as typeof import("expo-web-browser");
    const result = await webBrowser.openAuthSessionAsync(url, CHECKOUT_RETURN_URL, { showInRecents: true });
    if (result.type === "success" || result.type === "cancel" || result.type === "dismiss") {
      return { reason: result.type, via: "in-app" };
    }
    reason = `tab returned ${result.type}`;
  } catch (error) {
    // Falling back either way, but carry the reason out: "it opened in the
    // browser" has two very different causes, and only one needs a rebuild.
    reason = error instanceof Error ? error.message : String(error);
  }

  await Linking.openURL(url);
  return { reason, via: "browser" };
}

/** What the server refused, in its own words where it gave any. */
function refusalMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "data" in error) {
    const message = (error as { data?: { message?: string } }).data?.message;
    if (message) {
      return message;
    }
  }
  return fallback;
}

/**
 * The owner's Service balance.
 *
 * <p>Money paid in advance for Khatiyan's own paid services. The screen says so
 * plainly, because a number with a rupee sign next to it looks like a wallet,
 * and this is not one: it cannot be withdrawn, sent to anyone, or used for rent
 * or deposits. Money leaves only the way it came in.
 *
 * <p>Nothing here credits the balance. Paying opens the gateway in the phone's
 * browser, and the balance moves only when the gateway tells the server it took
 * the money — so this screen refreshes on return rather than announcing success.
 */
export default function OwnerServiceBalanceScreen() {
  return <WalletPinGate><OwnerServiceBalanceContent /></WalletPinGate>;
}

function OwnerServiceBalanceContent() {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const dispatch = useAppDispatch();
  const session = useAppSelector((state) => state.auth.accessToken);
  const [setWalletLock, lockState] = useSetWalletLockMutation();
  const [confirmLock, setConfirmLock] = useState(false);
  const [disableLock, setDisableLock] = useState(false);
  async function enableLock() {
    if (!session || lockState.isLoading) return;
    setConfirmLock(false);
    try {
      const result = await setWalletLock({ enabled: true }).unwrap();
      if (result.token && result.expiresAt) saveWalletAccess(session, result.token, result.expiresAt);
      dispatch(api.util.invalidateTags(["ServiceBalance"]));
    } catch (error) { setRefusal(refusalMessage(error, "Could not enable wallet locking")); }
  }

  const balanceQuery = useGetServiceBalanceQuery(undefined, {
    // The balance moves because of a webhook, not because of anything this
    // screen did — so it re-asks on mount, on focus, and on a pull.
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
    refetchOnReconnect: true,
  });
  const [startTopUp, startState] = useStartServiceBalanceTopUpMutation();
  const [fetchTopUp] = useLazyGetServiceBalanceTopUpQuery();

  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const router = useGuardedRouter();
  const transactionsQuery = useListServiceBalanceEntriesQuery({ page: 0, size: 5 }, { refetchOnFocus: true, refetchOnMountOrArgChange: true });

  const balance = balanceQuery.data;
  const minRupees = Math.round((balance?.minTopUpPaise ?? 10_000) / 100);
  const maxRupees = Math.round((balance?.maxTopUpPaise ?? 2_500_000) / 100);

  /**
   * The checkout the owner has gone off to pay.
   *
   * <p>Held in a ref rather than state: it is read by an AppState listener, and
   * state would leave that listener holding whatever was current when it was
   * registered.
   */
  const pendingTopUpId = useRef<string | null>(null);

  // Coming back from the browser is the only reliable signal we have that a
  // payment may have happened. The webhook is what actually credits, so this
  // asks the server rather than trusting the return.
  const checkPendingTopUp = useCallback(async () => {
    const topUpId = pendingTopUpId.current;
    if (!topUpId) {
      return;
    }
    const result = await fetchTopUp(topUpId).unwrap().catch(() => null);
    if (result?.status === "PAID") {
      pendingTopUpId.current = null;
      toast.ok("Money added to your Service balance.");
    }
    void balanceQuery.refetch();
    void transactionsQuery.refetch();
  }, [balanceQuery, transactionsQuery, fetchTopUp, toast]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkPendingTopUp();
      }
    });
    return () => subscription.remove();
  }, [checkPendingTopUp]);

  async function submitTopUp() {
    const rupees = Number(amount.trim());
    if (!amount.trim() || Number.isNaN(rupees) || rupees <= 0) {
      setAmountError("Enter an amount to add");
      return;
    }
    if (rupees < minRupees) {
      setAmountError(`The smallest amount you can add is ${formatMoneyPaise(minRupees * 100)}`);
      return;
    }
    if (rupees > maxRupees) {
      setAmountError(`The largest amount you can add at once is ${formatMoneyPaise(maxRupees * 100)}`);
      return;
    }

    try {
      const started = await startTopUp({ amountPaise: Math.round(rupees * 100) }).unwrap();
      pendingTopUpId.current = started.id;
      setAmount("");

      const opened = await openCheckout(started.checkoutUrl);
      // Said on screen rather than in a console: this app is developed across
      // Expo Go, debug and release-shaped builds, and only some of those
      // deliver console output anywhere a person will see it.
      if (__DEV__ && opened.via === "browser") {
        toast.warning(`Opened in browser: ${opened.reason}`);
      }
      // The in-app tab returns here by itself, so the balance is checked the
      // moment it closes rather than waiting for the app to come back to life.
      if (opened.via === "in-app") {
        await checkPendingTopUp();
      }
    } catch (error) {
      setRefusal(refusalMessage(error, "Could not start the payment. Try again in a moment."));
    }
  }

  const outstandingPaise = balance?.outstandingPaise ?? 0;
  // What the server will accept. Dues first, then something worth spending —
  // clearing the debt and landing back at zero would just stall again.
  const minimumTopUpPaise = balance?.minTopUpPaise ?? 10_000;

  return (
    <ScreenScrollView scrollOnlyWhenNeeded contentContainerStyle={{ gap: 12, paddingTop: 8, paddingBottom: 12 }} onRefresh={async () => { await Promise.all([balanceQuery.refetch(), transactionsQuery.refetch()]); }} safeAreaEdges={["top", "bottom"]}>
      <View style={{ gap: spacing.sm }}>
        <LinearGradient
          colors={["#E7F1FF", "#FFFFFF"]}
          end={{ x: 0.5, y: 1 }}
          start={{ x: 0.5, y: 0 }}
          style={{
            borderColor: "#D9E7FB",
            borderCurve: "continuous",
            borderRadius: 18,
            borderWidth: 1,
            minHeight: 88,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <AnimatedPressable accessibilityLabel="How the Service balance works" accessibilityRole="button" hitSlop={10} onPress={() => setHowOpen(true)} style={{ position: "absolute", top: 14, right: 14, zIndex: 2, padding: 4 }} tapLockMs={0}>
            <CircleHelp color={colors.muted} size={20} strokeWidth={2.2} />
          </AnimatedPressable>
          <View style={{ alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: spacing.xl, paddingVertical: 12 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12, letterSpacing: 0.5 }}>
              AVAILABLE BALANCE
            </Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              numberOfLines={1}
              style={{
                color: colors.ink,
                fontFamily: fonts.display,
                fontSize: 36,
                letterSpacing: -1,
                lineHeight: 42,
                textAlign: "center",
              }}
            >
              <Text style={{ letterSpacing: 3 }}>₹</Text>{formatMoneyPaise(balance?.availablePaise ?? 0).replace("₹", "")}
            </Text>
          </View>
        </LinearGradient>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 }}>
          <View style={{ marginTop: 8 }}>
            <View style={{ borderWidth: 1, borderColor: amountError ? colors.danger : colors.borderStrong, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, height: 48 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 20 }}>₹</Text>
              <AppTextInput accessibilityLabel="Add amount" keyboardType="number-pad" onChangeText={(next) => { setAmount(next.replace(/[^0-9]/g, "")); setAmountError(null); }} placeholder={`${minRupees} to ${maxRupees}`} placeholderTextColor={colors.kicker} value={amount} style={{ flex: 1, color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 15, height: 46, paddingVertical: 10, textAlignVertical: "center" }} />
            </View>
            <View pointerEvents="none" style={{ position: "absolute", top: -9, left: 14, backgroundColor: colors.surface, paddingHorizontal: 6 }}>
              <Text style={{ color: amountError ? colors.danger : colors.muted, fontFamily: fonts.sansMedium, fontSize: 12 }}>Add amount <Text style={{ color: colors.danger }}>*</Text></Text>
            </View>
            {amountError ? <Text accessibilityRole="alert" style={[type.caption, { color: colors.danger, marginTop: 5 }]}>{amountError}</Text> : null}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {(balance?.quickAmountsPaise ?? []).map((paise) => <QuickAmount key={paise} label={String(Math.round(paise / 100))} onPress={() => { setAmount(String(Math.round(paise / 100))); setAmountError(null); }} selected={amount === String(Math.round(paise / 100))} />)}
          </View>
          <ActionButton compact disabled={!balance?.topUpEnabled || startState.isLoading} label={startState.isLoading ? "Opening…" : "Add Balance"} onPress={submitTopUp} variant="dangerFilled" />
          {outstandingPaise > 0 ? <Text style={[type.caption, { color: colors.muted }]}>Minimum {formatMoneyPaise(minimumTopUpPaise)} — {formatMoneyPaise(outstandingPaise)} clears your pending charges and the rest goes to your balance.</Text> : null}
        </View>

      </View>

      {(balance?.reservedPaise ?? 0) > 0 ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Lock color={colors.muted} size={15} strokeWidth={2} />
          <Text style={[type.description, { color: colors.muted, flex: 1 }]}>
            {formatMoneyPaise(balance?.reservedPaise ?? 0)} is held for checks already requested
          </Text>
        </View>
      ) : null}

      {outstandingPaise > 0 ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <CircleAlert color={colors.warning} size={15} strokeWidth={2} />
          <Text style={[type.description, { color: colors.muted, flex: 1 }]}>
            {formatMoneyPaise(outstandingPaise)} in pending charges, taken from your next top-up
          </Text>
        </View>
      ) : null}

      {balance?.servicesSuspended ? (
        <NoticeBar
          message={`Add at least ${formatMoneyPaise(minimumTopUpPaise)} to clear what is pending and start again.`}
          title="Paid services are paused"
          tone="warning"
        />
      ) : null}

      {!balance?.topUpEnabled ? (
        <Text style={[type.description, { color: colors.muted }]}>
          Adding money is not switched on yet. Your balance and history still show here.
        </Text>
      ) : null}

      <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 18, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}>
          <View style={{ width: 34, height: 34, backgroundColor: colors.neutralSoft, borderRadius: 11, alignItems: "center", justifyContent: "center" }}>
            <Svg width={24} height={27} viewBox="0 0 24 28">
              <Path d="M5 26V6Q5 2 9 2H17Q21 2 21 6V25Q21 27 19 26L17 24L14 26L11 24L8 26Q5 28 5 26ZM9 8H17M9 12H15" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, lineHeight: 23 }}>Recent Transactions</Text>
        </View>
        <View style={{ paddingHorizontal: 18 }}>
          {!transactionsQuery.data && (transactionsQuery.isLoading || transactionsQuery.isFetching) ? <WalletTransactionSkeleton /> : transactionsQuery.data?.content.length ? transactionsQuery.data.content.map((entry) => <View key={entry.id}><ServiceBalanceTransactionRow compact entry={entry} /><TransactionSeparator /></View>) : !transactionsQuery.isError ? <Text style={[type.caption, { color: colors.muted, paddingVertical: 20 }]}>No transactions yet</Text> : null}
          {transactionsQuery.isError && !transactionsQuery.isFetching ? <WalletTransactionsErrorCard onRetry={() => void transactionsQuery.refetch()} /> : null}
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="See all transactions" onPress={() => router.push("/owner-service-balance-transactions")} style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, paddingVertical: 10, minHeight: 40 }}>
            <Text style={{ color: colors.danger, fontFamily: fonts.sansBold, fontSize: 14 }}>See All</Text><ChevronRight color={colors.danger} size={16} />
          </AnimatedPressable>
        </View>
      </View>

      <WalletLockCard enabled={Boolean(balance?.walletLockEnabled)} busy={lockState.isLoading} onChange={(enabled) => enabled ? setConfirmLock(true) : setDisableLock(true)} />
      {confirmLock ? <ConfirmDialog animatedTransition title="Enable wallet locking?" message="Use your account PIN to open the wallet. This can be reversed anytime" confirmLabel="Continue" onCancel={() => setConfirmLock(false)} onConfirm={() => void enableLock()} /> : null}
      {disableLock ? <WalletPinModal disableLock onCancel={() => setDisableLock(false)} onUnlocked={() => setDisableLock(false)} /> : null}

      {howOpen ? (
        <HowItWorksSheet
          eyebrow="Service balance"
          onClose={() => setHowOpen(false)}
          steps={[
            {
              body: "Add money once, then services you request are paid for from this balance.",
            title: "It is prepaid",
          },
          {
            body: "When you ask for a service, its price is held. It is charged only when the service is actually carried out, and released if it never runs.",
            title: "Held, then charged",
          },
          {
            body: "This balance buys Khatiyan services only. It cannot be sent to anyone, spent on rent or deposits, or withdrawn to a bank account.",
            title: "What it cannot do",
          },
          {
            body: "It stays on your balance for whenever you need it. If you close your Khatiyan account, whatever is left goes back to the bank account you paid from.",
            title: "Money you do not use",
          },
          ]}
          title="How it works"
        />
      ) : null}

      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </ScreenScrollView>
  );
}

/** Layered card artwork for the balance hero. */
function BalanceArtwork() {
  const { fonts } = useTheme();

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ bottom: 0, height: 170, position: "absolute", right: 0, width: 175 }}>
      <View style={{ backgroundColor: "#A8C8FB", borderRadius: 17, bottom: 16, height: 105, position: "absolute", right: 5, transform: [{ rotate: "12deg" }], width: 88 }} />
      <LinearGradient
        colors={["#7AB5FC", "#2D73DC"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{ borderRadius: 17, bottom: 23, height: 119, position: "absolute", right: 67, transform: [{ rotate: "-15deg" }], width: 96 }}
      />
      <LinearGradient
        colors={["#FFFFFF", "#F0F6FF"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          borderColor: "#F7FAFF",
          borderRadius: 16,
          borderWidth: 1,
          bottom: 16,
          elevation: 5,
          height: 106,
          paddingHorizontal: 20,
          paddingTop: 11,
          position: "absolute",
          right: 25,
          shadowColor: "#6C91C2",
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.2,
          shadowRadius: 9,
          transform: [{ rotate: "4deg" }],
          width: 118,
        }}
      >
        <Text style={{ color: "#91A9D0", fontFamily: fonts.display, fontSize: 37, lineHeight: 44 }}>₹</Text>
        <View style={{ backgroundColor: "#C9DDF9", borderRadius: 4, height: 6, marginTop: 2, width: 70 }} />
        <View style={{ backgroundColor: "#DFEAFB", borderRadius: 4, height: 6, marginTop: 8, width: 47 }} />
      </LinearGradient>
      <View style={{ backgroundColor: "#FFC351", borderRadius: 5, height: 25, position: "absolute", right: 47, top: 3, transform: [{ rotate: "19deg" }], width: 7 }} />
      <View style={{ backgroundColor: "#FFC351", borderRadius: 5, height: 24, position: "absolute", right: 21, top: 18, transform: [{ rotate: "41deg" }], width: 7 }} />
    </View>
  );
}

function SummaryTile({
  color,
  icon: Icon,
  label,
  tint,
  value,
}: {
  color: string;
  icon: ComponentType<LucideProps>;
  label: string;
  tint: string;
  value: string;
}) {
  const { colors, fonts } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: tint,
        borderCurve: "continuous",
        borderRadius: 15,
        flex: 1,
        flexDirection: "row",
        gap: spacing.xs,
        minHeight: 66,
        paddingHorizontal: 8,
        paddingVertical: spacing.xs,
      }}
    >
      <View style={{ alignItems: "center", backgroundColor: color === colors.primary ? "#E1EDFF" : "#FFF2DD", borderRadius: 20, height: 40, justifyContent: "center", width: 40 }}>
        <Icon color={color} size={22} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
          {label}
        </Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/**
 * A tab's worth of statement, or the reason it is empty.
 *
 * <p>Both tabs render the same way. The service tab used to be a hard-coded
 * empty state that never looked at the ledger, so the day a hold was finally
 * placed it would still have said there were none.
 */
function EntryList({
  description,
  entries,
  title,
}: {
  description: string;
  entries: ServiceBalanceEntry[];
  title: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        artworkNode={<DepositHistoryArtwork size={96} />}
        compact
        description={description}
        title={title}
      />
    );
  }

  return (
    <View style={{ paddingBottom: spacing.md }}>
      {entries.map((entry, index) => (
        <View key={entry.id}>
          {index > 0 ? <Divider /> : null}
          <EntryRow entry={entry} />
        </View>
      ))}
    </View>
  );
}

/**
 * One statement line.
 *
 * <p>A hold and a spend are deliberately not the same colour or the same arrow:
 * "we are holding this" and "this is gone" is the distinction an owner opens a
 * statement to settle.
 */
function EntryRow({ entry }: { entry: ServiceBalanceEntry }) {
  const { colors, fonts, type } = useTheme();

  const spent = entry.type === "CHARGE";
  // A charge is the sum of everything it moved, whichever columns those were.
  //
  // There are three shapes and they have changed over time: a charge against a
  // hold moves RESERVED, a charge with nothing behind it moves OUTSTANDING, and
  // a charge for work Khatiyan already paid the provider for moves AVAILABLE.
  // Reading any one column printed the other two as "-₹0.00" — which is how a
  // Rs 15 identity check showed as nothing while the balance quietly dropped by
  // the right amount.
  const moved = spent
    ? -(Math.abs(entry.availableDeltaPaise)
        + Math.abs(entry.reservedDeltaPaise)
        + Math.abs(entry.outstandingDeltaPaise))
    : entry.availableDeltaPaise;
  const incoming = moved > 0;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 62, paddingVertical: spacing.md }}>
      <View
        style={{
          alignItems: "center",
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        {incoming ? (
          <ArrowDownToLine color={colors.jade} size={23} strokeWidth={2.2} />
        ) : (
          <ArrowUpRight color={spent ? colors.ink : colors.muted} size={21} strokeWidth={2.1} />
        )}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14.5 }}>
          {entryTitle(entry)}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>{formatEntryDate(entry.createdAt)}</Text>
      </View>

      <Text
        style={{
          color: spent ? colors.ink : incoming ? colors.jade : colors.muted,
          fontFamily: fonts.sansBold,
          fontSize: 15,
        }}
      >
        {moved > 0 ? "+" : "−"}
        {formatMoneyPaise(Math.abs(moved))}
      </Text>
    </View>
  );
}

function entryTitle(entry: ServiceBalanceEntry) {
  if (entry.memo) {
    return entry.memo;
  }
  switch (entry.type) {
    case "TOPUP":
      return "Money added";
    case "RESERVE":
      return "Held for a check";
    case "RELEASE":
      return "Hold returned";
    case "CHARGE":
      return "Identity check";
    case "REFUND":
      return "Money returned";
    case "CHARGEBACK":
      return "Payment reversed by the bank";
    default:
      return "Adjustment";
  }
}

/** Short and local, like every other date in the app. */
function formatEntryDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function formatSummaryDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(value);
}

function QuickAmount({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={`Add ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? "#FFF0F3" : colors.surface,
        borderColor: selected ? colors.danger : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        height: 38,
        justifyContent: "center",
        paddingHorizontal: spacing.sm,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: selected ? colors.danger : colors.muted,
          fontFamily: fonts.sansBold,
          fontSize: 13,
          lineHeight: 17,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
import { CircleHelp } from "lucide-react-native";
