import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Text, View } from "react-native";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleAlert,
  Info,
  Lock,
  Plus,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Divider } from "@/components/divider";
import { EmptyState } from "@/components/empty-state";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { TabSwitcher } from "@/components/tab-switcher";
import { useToast } from "@/components/toast";
import { DepositHistoryArtwork } from "@/features/billing/deposit-account-ui";
import { ActionButton, FormInput, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import {
  useGetServiceBalanceQuery,
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

type ActivityTab = "top-ups" | "service-charges";

const ACTIVITY_TABS = [
  { label: "Top-ups", value: "top-ups" as const },
  { label: "Service charges", value: "service-charges" as const },
];

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
  const { colors, fonts, type } = useTheme();
  const toast = useToast();

  const balanceQuery = useGetServiceBalanceQuery(undefined, {
    // The balance moves because of a webhook, not because of anything this
    // screen did — so it re-asks on mount, on focus, and on a pull.
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
    refetchOnReconnect: true,
  });
  const [startTopUp, startState] = useStartServiceBalanceTopUpMutation();
  const [fetchTopUp] = useLazyGetServiceBalanceTopUpQuery();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<ActivityTab>("top-ups");

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
  }, [balanceQuery, fetchTopUp, toast]);

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
      setSheetOpen(false);
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

  const entries = balance?.recentEntries ?? [];
  const topUpEntries = entries.filter((entry) => entry.type === "TOPUP");
  // Top-ups stay their own tab: money in from a card. What a service did with
  // it is the other tab's business.
  //
  // REFUND and CHARGEBACK rows are listed by NEITHER, by decision. Refunded
  // money never lands in this balance — it goes back to the card it came from —
  // and the only refund the product allows runs while the account is being
  // deleted, so no one is here to read it. The owner learns about a refund from
  // a notification instead, which is still to be built. A future reader finding
  // these types unlisted has found the decision, not a bug.
  const serviceEntries = entries.filter(
    (entry) => entry.type === "RESERVE" || entry.type === "CHARGE" || entry.type === "RELEASE",
  );
  const recentTopUpTotalPaise = topUpEntries.reduce(
    (total, entry) => total + Math.max(entry.availableDeltaPaise, 0),
    0,
  );
  const updatedOn = formatSummaryDate(
    balanceQuery.fulfilledTimeStamp ? new Date(balanceQuery.fulfilledTimeStamp) : new Date(),
  );

  return (
    <ScreenScrollView onRefresh={async () => void (await balanceQuery.refetch())} safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        // "balance" in the brand italic accent, the same split every other
        // screen title uses.
        italicTail="balance."
        subtitle="Prepaid money for Khatiyan's paid services."
        title="Service"
        trailing={
          <AnimatedPressable
            accessibilityLabel="How the Service balance works"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setHowOpen(true)}
            style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
            tapLockMs={0}
          >
            <Info color={colors.kicker} size={17} strokeWidth={2.4} />
          </AnimatedPressable>
        }
      />

      {/* The balance stays the single strongest figure. Supporting information
          is kept below the action so it never competes with what can be spent. */}
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: 3 }}>
          <Text style={[type.eyebrow, { color: colors.muted }]}>AVAILABLE BALANCE</Text>
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.display,
              fontSize: 42,
              letterSpacing: -0.9,
              lineHeight: 48,
            }}
          >
            {formatMoneyPaise(balance?.availablePaise ?? 0).replace(/^₹/, "₹ ")}
          </Text>
        </View>

        {(balance?.reservedPaise ?? 0) > 0 ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Lock color={colors.muted} size={15} strokeWidth={2} />
            <Text style={[type.body, { color: colors.muted, flex: 1, fontSize: 13 }]}>
              {formatMoneyPaise(balance?.reservedPaise ?? 0)} is held for checks already requested
            </Text>
          </View>
        ) : null}

        {/* Pending charges sit with the balance, not in a notice somewhere
            else: the two numbers only make sense read together, and an owner
            whose next top-up comes back smaller deserves to know why first. */}
        {outstandingPaise > 0 ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <CircleAlert color={colors.warning} size={15} strokeWidth={2} />
            <Text style={[type.body, { color: colors.muted, flex: 1, fontSize: 13 }]}>
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

        <ActionButton
          disabled={!balance?.topUpEnabled}
          icon={Plus}
          label="Add money"
          onPress={() => {
            setAmountError(null);
            setSheetOpen(true);
          }}
        />

        {!balance?.topUpEnabled ? (
          <Text style={[type.caption, { color: colors.muted, marginTop: -spacing.xs }]}>
            Adding money is not switched on yet. Your balance and history still show here.
          </Text>
        ) : null}

        <Divider />

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderCurve: "continuous",
              borderRadius: radii.card,
              flex: 1,
              flexDirection: "row",
              gap: spacing.sm,
              minHeight: 72,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <CalendarDays color={colors.primary} size={21} strokeWidth={2.1} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 11.5 }}>
                Last updated
              </Text>
              <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 10.5 }]}>
                {updatedOn}
              </Text>
            </View>
          </View>

          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderCurve: "continuous",
              borderRadius: radii.card,
              flex: 1,
              flexDirection: "row",
              gap: spacing.sm,
              minHeight: 72,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <ChartNoAxesColumnIncreasing color={colors.primary} size={21} strokeWidth={2.1} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 11.5 }}>
                Recent top-ups
              </Text>
              <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 10.5 }]}>
                {topUpEntries.length} · {formatMoneyPaise(recentTopUpTotalPaise)}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
        <Text style={[type.eyebrow, { color: colors.muted }]}>RECENT ACTIVITY</Text>
        <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
      </View>

      <TabSwitcher active={activityTab} onChange={setActivityTab} options={ACTIVITY_TABS} />

      {activityTab === "top-ups" ? (
        <EntryList
          description="Money you add to your Service balance will show up here."
          entries={topUpEntries}
          title="No top-ups yet"
        />
      ) : (
        <EntryList
          description="Holds, charges and released holds for paid Khatiyan services will show up here."
          entries={serviceEntries}
          title="No service charges yet"
        />
      )}

      {sheetOpen ? (
        <SheetShell animated onClose={() => setSheetOpen(false)} title="Add money">
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.label, { color: colors.muted }]}>Quick select</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {(balance?.quickAmountsPaise ?? []).map((paise) => (
                  <QuickAmount
                    key={paise}
                    label={formatMoneyPaise(paise)}
                    onPress={() => {
                      setAmount(String(Math.round(paise / 100)));
                      setAmountError(null);
                    }}
                    selected={amount === String(Math.round(paise / 100))}
                  />
                ))}
              </View>
            </View>

            <FormInput
              error={amountError ?? undefined}
              keyboardType="number-pad"
              label="Or enter another amount"
              onChangeText={(next) => {
                setAmount(next.replace(/[^0-9]/g, ""));
                setAmountError(null);
              }}
              placeholder={`${minRupees} to ${maxRupees}`}
              prefix="₹"
              value={amount}
            />

            {outstandingPaise > 0 ? (
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <CircleAlert color={colors.warning} size={14} strokeWidth={2.2} />
                <Text style={[type.caption, { color: colors.muted, flex: 1, lineHeight: 18 }]}>
                  Minimum {formatMoneyPaise(minimumTopUpPaise)} — {formatMoneyPaise(outstandingPaise)} clears your
                  pending charges and the rest goes to your balance.
                </Text>
              </View>
            ) : null}

            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Info color={colors.muted} size={14} strokeWidth={2.2} />
              <Text style={[type.caption, { color: colors.muted, flex: 1, lineHeight: 18 }]}>
                Your balance updates once the payment is confirmed, which can take a moment.
              </Text>
            </View>

            <ActionButton
              disabled={startState.isLoading}
              label={startState.isLoading ? "Opening…" : "Continue to payment"}
              onPress={submitTopUp}
            />
          </View>
        </SheetShell>
      ) : null}

      {howOpen ? (
        <HowItWorksSheet
          eyebrow="Service balance"
          onClose={() => setHowOpen(false)}
          steps={[
            {
              body: "Add money once, then identity checks you request are paid for from this balance.",
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
            body: "It stays on your balance for whenever you need it. If you close your Khatiyan account, whatever is left goes back to the card or UPI app that paid it.",
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
    <Card style={{ gap: 0 }}>
      {entries.map((entry, index) => (
        <View key={entry.id}>
          {index > 0 ? <Divider /> : null}
          <EntryRow entry={entry} />
        </View>
      ))}
    </Card>
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
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm }}>
      <View
        style={{
          alignItems: "center",
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        {incoming ? (
          <ArrowDownToLine color={colors.ink} size={20} strokeWidth={2.1} />
        ) : (
          <ArrowUpRight color={colors.ink} size={20} strokeWidth={2.1} />
        )}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {entryTitle(entry)}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>{formatEntryDate(entry.createdAt)}</Text>
      </View>

      <Text
        style={{
          color: spent ? colors.ink : incoming ? colors.jade : colors.muted,
          fontFamily: fonts.sansBold,
          fontSize: 14,
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
        backgroundColor: selected ? colors.primary : colors.surfaceSunken,
        borderColor: selected ? colors.primary : colors.border,
        borderRadius: radii.pill,
        borderWidth: 1,
        flex: 1,
        height: 42,
        justifyContent: "center",
        paddingHorizontal: spacing.sm,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: selected ? colors.onPrimary : colors.ink,
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
