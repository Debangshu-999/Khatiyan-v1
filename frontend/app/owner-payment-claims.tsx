import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Info } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { HowItWorksSheet, type HowItWorksStep } from "@/components/how-it-works-sheet";
import { MonthSelector, currentMonth } from "@/components/month-selector";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerPaymentListSkeleton } from "@/components/skeletons/owner";
import { ClaimCard, isOwnerVisible } from "@/features/billing/payment-claim-card";
import { useAppSelector } from "@/store/hooks";
import { useListPaymentClaimsQuery } from "@/store/services/payment-intent-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Empty-state artwork shown only when the selected month has no claims.
const PAYMENT_CLAIMS_ILLUSTRATION = require("../assets/workspace/payment_claims1254.png");

/**
 * Cards mounted per batch. A screenful and a bit on a phone, so reaching the
 * bottom of one batch has the next already coming.
 */
const PAGE_SIZE = 8;

/**
 * What a claim is and what answering one does.
 *
 * <p>Plain words on purpose. Every sentence here is about money that has
 * already moved or has not, and an owner reading it is deciding whether to
 * accept somebody as paid.
 */
const CLAIM_STEPS: HowItWorksStep[] = [
  {
    title: "The tenant pays you directly",
    body: "They pay by UPI, bank transfer, card or cheque, whichever you take. The money never passes through Khatiyan, so the app cannot see it arrive.",
  },
  {
    title: "They tell you they have paid",
    body: "The tenant raises a claim on the bill and can add the payment's reference, like a UTR or cheque number, or a photo of it. That is the claim. Cash never comes here, it is recorded at the desk.",
  },
  {
    title: "The bill waits for your answer",
    body: "It sits as confirmation pending until you reply. Nothing expires, and the tenant cannot raise a second claim on the same bill while this one is open.",
  },
  {
    title: "You check your bank statement",
    body: "This is the only proof there is. Match the amount and the reference against your account before you answer. Claims are grouped by the month they were raised, because that is the statement you will have open.",
  },
  {
    title: "Approve once you can see the money",
    body: "The bill is marked paid, the amount counts as collected, and the receipt keeps the reference. Nothing in the app can reverse a paid bill afterwards, so approve only what you have found in your account.",
  },
  {
    title: "Say not found when it is not there",
    body: "The bill goes back to unpaid and the tenant is told straight away. They can pay and claim again. Any late fee for the days since the due date will then apply.",
  },
];

/**
 * Tenants saying they have paid, waiting on the owner's bank statement.
 *
 * <p><b>Owner only.</b> Verifying a claim means matching it against a statement
 * a manager cannot see — approving one would be confirming money reached an
 * account they have no visibility of. The server refuses them too.
 */
export default function OwnerPaymentClaimsScreen() {
  const { colors, type } = useTheme();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const [month, setMonth] = useState(currentMonth());
  const [guideOpen, setGuideOpen] = useState(false);
  const claimsQuery = useListPaymentClaimsQuery({ month, propertyId: propertyId ?? "" }, { skip: !propertyId });
  /**
   * Newest first, straight from the server. A claim raised this morning sits
   * above one from last week whatever became of either — the owner is working
   * down from what just arrived.
   *
   * <p>Filtered again here, though the server already refuses to send the other
   * two states. An attempt a tenant abandoned or withdrew is their own record of
   * trying to pay and was never addressed to the owner, so the rule is worth
   * stating on both sides of the wire rather than trusting one.
   */
  const claims = (claimsQuery.data ?? []).filter(isOwnerVisible);
  const waiting = claims.filter((claim) => claim.status === "TENANT_CONFIRMED").length;

  /**
   * How many cards are on screen, grown as the owner reaches the bottom.
   *
   * <p>
   * The month arrives in one response — a property's claims for one month is a
   * bounded set, and paging the request would cost a round trip per screenful to
   * save nothing. What is worth avoiding is MOUNTING them all: every card holds
   * images, a confirm dialog and two mutations, and a busy month would build all
   * of that before the first row is read. So the list reveals a screenful at a
   * time and the fetch stays whole.
   */
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = claims.slice(0, shown);
  const hasMore = shown < claims.length;

  // Back to the top of the list when the month changes. Otherwise a long
  // September left October showing forty rows of a five-row month.
  useEffect(() => setShown(PAGE_SIZE), [month]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
      // A screenful of warning, so the next batch is already mounted by the time
      // the reader gets there and the list never visibly stops.
      if (distanceFromEnd < layoutMeasurement.height) {
        setShown((current) => (current < claims.length ? current + PAGE_SIZE : current));
      }
    },
    [claims.length],
  );

  return (
    <ScreenScrollView
      background={
        <View style={{ backgroundColor: colors.surface, flex: 1 }}>
          <LinearGradient
            colors={[colors.primarySoft, colors.surface]}
            end={{ x: 0.5, y: 1 }}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            style={{ height: 260 }}
          />
        </View>
      }
      // Not flush to the safe area. Zero sat the title hard against the status
      // bar, which read as the header being cut off rather than as a
      // full-bleed gradient. Small, because the gradient behind it still wants
      // to start at the top of the screen.
      onScroll={onScroll}
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
    >
      <ScreenHeader
        title="Payment"
        italicTail="claims."
        subtitle="Tenants who say they have paid. Check each against your bank statement before approving."
      />

      {/* By month, because a bank statement is read by month. A claim is filed
          under the month it was RAISED, not the month of the bill it pays — a
          tenant settling September's rent in October appears in October, which
          is the statement the owner will have open. */}
      <MonthSelector onChange={setMonth} value={month} />

      {/* The count and the explainer share a line, and the line is always
          here. A screen with no claims on it is exactly where somebody is most
          likely to be asking what this is for. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <Text style={[type.description, { color: colors.muted, flex: 1 }]}>
          {claims.length > 0
            ? `${claims.length} ${claims.length === 1 ? "claim" : "claims"}${waiting > 0 ? ` · ${waiting} still waiting on you` : " · all dealt with"}`
            : ""}
        </Text>
        <AnimatedPressable
          accessibilityLabel="How payment claims work"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => setGuideOpen(true)}
          style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
          tapLockMs={0}
        >
          <Info color={colors.kicker} size={17} strokeWidth={2.4} />
        </AnimatedPressable>
      </View>

      {guideOpen ? (
        <HowItWorksSheet
          eyebrow="Payment claims"
          onClose={() => setGuideOpen(false)}
          steps={CLAIM_STEPS}
          title="How claims work"
        />
      ) : null}

      {claimsQuery.isFetching && claims.length === 0 ? (
        <OwnerPaymentListSkeleton rows={2} />
      ) : claims.length === 0 ? (
        <EmptyState
          description="When a tenant pays by UPI and tells us, their claim appears here for you to confirm. Nothing was raised this month."
          artwork={PAYMENT_CLAIMS_ILLUSTRATION}
          title="No claims this month"
        />
      ) : (
        <>
          {visible.map((claim) => <ClaimCard claim={claim} key={claim.id} />)}

          {/* The list's own footer, not a button. Reaching it has already
              triggered the next batch — this is what the reader looks at for
              the frame it takes to mount, so the list never appears to end
              early. */}
          {hasMore ? (
            <View style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[type.caption, { color: colors.kicker }]}>
                {claims.length - shown} more this month
              </Text>
            </View>
          ) : claims.length > PAGE_SIZE ? (
            <Text style={[type.caption, { color: colors.kicker, paddingVertical: spacing.sm, textAlign: "center" }]}>
              That is every claim raised this month.
            </Text>
          ) : null}
        </>
      )}
    </ScreenScrollView>
  );
}
