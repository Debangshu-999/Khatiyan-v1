import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock3, Info, ReceiptText, Send } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { HowItWorksSheet, type HowItWorksStep } from "@/components/how-it-works-sheet";
import { Lightbox } from "@/components/image-carousel";
import { MonthSelector, currentMonth } from "@/components/month-selector";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonList } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { BillingStatusBadge } from "@/features/owner/bill-views";
import { ActionButton, ConfirmDialog, formatMoneyPaise } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  useListPaymentClaimsQuery,
  useRejectPaymentIntentMutation,
  useVerifyPaymentIntentMutation,
  type PaymentIntent,
  type PaymentIntentStatus,
} from "@/store/services/payment-intent-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// The large copy: a header illustration is drawn at 126x96, so it needs the
// resolution a 72px glyph does not have.
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
    body: "They open the bill in their app and pay by UPI into your account. The money never passes through Khatiyan, so the app cannot see it arrive.",
  },
  {
    title: "They tell you they have paid",
    body: "The tenant marks the bill as paid and can add the UPI reference number or a photo of their payment screen. That is the claim.",
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
    body: "The bill is marked paid, the amount counts as collected, and the receipt keeps the UPI reference. Nothing in the app can reverse a paid bill afterwards, so approve only what you have found in your account.",
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
        artwork={PAYMENT_CLAIMS_ILLUSTRATION}
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
        <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
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
        <SkeletonList rows={2} />
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

/**
 * The claim states an owner is entitled to see.
 *
 * <p>A tenant who opens a payment and never answers, or answers "it failed",
 * has told the owner nothing. The server enforces this — see
 * {@code PaymentIntentService.OWNER_VISIBLE} — and this narrows the type so the
 * card cannot be written to render a state it should never be handed.
 */
type OwnerVisibleStatus = Extract<
  PaymentIntentStatus,
  "TENANT_CONFIRMED" | "OWNER_VERIFIED" | "OWNER_REJECTED"
>;

type OwnerClaim = PaymentIntent & { status: OwnerVisibleStatus };

function isOwnerVisible(claim: PaymentIntent): claim is OwnerClaim {
  return (
    claim.status === "TENANT_CONFIRMED" ||
    claim.status === "OWNER_VERIFIED" ||
    claim.status === "OWNER_REJECTED"
  );
}

function ClaimCard({ claim }: { claim: OwnerClaim }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [verify, verifyState] = useVerifyPaymentIntentMutation();
  const [reject, rejectState] = useRejectPaymentIntentMutation();
  // Which screenshot the viewer is open on, or null. An index rather than a
  // boolean: a claim can carry two, and opening the second must not start at
  // the first.
  const [viewingProofAt, setViewingProofAt] = useState<number | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = verifyState.isLoading || rejectState.isLoading;
  // Only a claim still awaiting the owner has anything to press. A decided one
  // is on the screen to be READ — offering Approve on a claim already approved
  // would be an action with nothing behind it.
  const open = claim.status === "TENANT_CONFIRMED";

  async function approve() {
    setConfirmingApprove(false);
    try {
      await verify(claim.id).unwrap();
      toast.success("Payment confirmed. The bill is marked paid.");
    } catch (caught) {
      setError(errorMessage(caught) || "Could not confirm that. Try again.");
    }
  }

  async function notFound() {
    setConfirmingReject(false);
    try {
      await reject(claim.id).unwrap();
      toast.success("Marked as not received. The tenant can try again.");
    } catch (caught) {
      setError(errorMessage(caught) || "Could not update that. Try again.");
    }
  }

  return (
    <Card>
      {/* The short code leads. It is what the owner searches their statement
          for — the name and amount are context around it. */}
      {/* State in one corner, age in the other, and nothing between them to
          squeeze either. All three used to share this line with the reference
          code, which is more than a phone card is wide — the age was the piece
          that got pushed off the edge.

          The age is on every card, settled or not. On a decided claim it is not
          pressure any more, it is context: how long ago this one came in, so a
          month of cards reads as a sequence rather than a pile. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <ClaimStatusPill status={claim.status} />
        <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
          <Clock3 color={colors.kicker} size={13} strokeWidth={2.2} />
          <Text style={[type.caption, { color: colors.muted }]}>{describeWait(claim.createdAt)}</Text>
        </View>
      </View>

      {/* The code under the name it belongs to, with the amount beside the pair.
          It leads nothing now — the owner finds a claim by the person and the
          figure, and reaches for the code only once they are matching it against
          a statement line. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>
            {claim.tenantName ?? "Tenant"}
          </Text>
          {/* The glyph inside the code's own fill, not in a container of its
              own. It marks the chip as a BILL reference rather than any other
              code on the card, which matters once the owner is holding a
              statement full of numbers. */}
          <View
            style={{
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: colors.surfaceSunken,
              borderRadius: 6,
              flexDirection: "row",
              gap: 5,
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
            }}
          >
            <ReceiptText color={colors.kicker} size={13} strokeWidth={2.2} />
            <Text style={{ color: colors.inkSoft, fontFamily: fonts.mono, fontSize: 12.5 }}>
              {claim.referenceCode}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 20 }}>
          {formatMoneyPaise(claim.amountPaise)}
        </Text>
      </View>

      {/* paddingTop, because this section's own content starts at its edge —
          unlike the timeline below, whose rows carry their own paddingVertical.
          Without it the label and the 46px thumbnail sat directly on the rule,
          which read as the divider underlining them rather than separating two
          parts of the card. */}
      <View style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.sm }}>
        {claim.tenantReferenceText || claim.proofImageUrls.length > 0 ? (
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.caption, { color: colors.muted }]}>UPI reference</Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.mono, fontSize: 13 }}>
                {claim.tenantReferenceText ?? "Not given"}
              </Text>
            </View>
            {/* One thumbnail, however many were sent. A row of 46px squares
                said "there are two" by taking twice the width, which pushed the
                reference number into a narrower column for no gain — at that
                size neither square is legible anyway. The count says it in a
                corner instead, and the viewer behind it already pages through
                the whole set.

                Pressable, which it was not. A 46px thumbnail of a bank app's
                confirmation screen is unreadable — it is a marker saying
                evidence exists, and the whole point of it is to open. The one
                thing on this screen that could settle a doubtful claim was the
                one thing that did nothing when tapped. */}
            {claim.proofImageUrls.length > 0 ? (
              <AnimatedPressable
                accessibilityLabel={
                  claim.proofImageUrls.length > 1
                    ? `Open ${claim.proofImageUrls.length} payment screenshots`
                    : "Open payment screenshot"
                }
                accessibilityRole="imagebutton"
                onPress={() => setViewingProofAt(0)}
              >
                <View
                  style={{
                    borderColor: colors.border,
                    borderRadius: 6,
                    borderWidth: 1,
                    height: 46,
                    // So the count strip stops at the rounded corner instead of
                    // squaring off the bottom of the thumbnail.
                    overflow: "hidden",
                    width: 46,
                  }}
                >
                  <Image source={{ uri: claim.proofImageUrls[0] }} style={{ height: "100%", width: "100%" }} />

                  {/* How many MORE, not how many in total: the one on screen is
                      already counted by being visible. Dark and translucent
                      because it sits on a screenshot whose colours are the
                      tenant's bank app, not ours. */}
                  {claim.proofImageUrls.length > 1 ? (
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: "rgba(0, 0, 0, 0.62)",
                        bottom: 0,
                        left: 0,
                        position: "absolute",
                        right: 0,
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 10, lineHeight: 15 }}>
                        +{claim.proofImageUrls.length - 1}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </AnimatedPressable>
            ) : null}
          </View>
        ) : (
          // Not an error state. A tenant who paid should not be blocked by not
          // knowing where their app hides the reference — it just means the
          // owner has to go and look, so say that rather than pointing at the
          // short code, which is our identifier and appears nowhere in a bank
          // statement.
          <Text style={[type.caption, { color: colors.muted, fontStyle: "italic", lineHeight: 17 }]}>
            No reference or screenshot given, verify the payment manually on your banking or UPI app.
          </Text>
        )}

      </View>

      {/* Its own bordered section with a glyph per step, the way a notice card
          separates what it says from the facts about it. When each step
          happened, to the minute: the owner is reconciling against a statement
          whose rows are timestamped, and "05 Sept" alone cannot separate two
          payments of the same amount on the same day — which is exactly the
          case that needs separating. */}
      <View style={{ borderTopColor: colors.border, borderTopWidth: 1 }}>
        {claimStamps(claim).map((stamp, index) => (
          <View
            key={stamp.label}
            style={{
              alignItems: "center",
              borderTopColor: colors.border,
              borderTopWidth: index === 0 ? 0 : 1,
              flexDirection: "row",
              gap: spacing.sm,
              paddingVertical: spacing.xs,
            }}
          >
            <stamp.icon color={stamp.tone(colors)} size={14} strokeWidth={2.2} />
            <Text style={[type.caption, { color: colors.kicker, flex: 1 }]}>{stamp.label}</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 12.5 }}>
              {stamp.value}
            </Text>
          </View>
        ))}
      </View>

      {claim.tenantNote ? (
        <Text style={[type.caption, { color: colors.muted, lineHeight: 17 }]}>{claim.tenantNote}</Text>
      ) : null}

      {open ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ActionButton
            disabled={busy}
            label="Not found"
            onPress={() => setConfirmingReject(true)}
            variant="danger"
          />
          <ActionButton disabled={busy} label={busy ? "Saving…" : "Approve"} onPress={() => setConfirmingApprove(true)} />
        </View>
      ) : null}

      {/* Asked because there is no way back. Approving runs the bill through
          recordManualPayment — it is marked paid, the deposit account opens on a
          first cycle, and the paid event moves collected money and the P&L.
          Nothing in the app un-pays a bill afterwards.

          Not styled destructive: the red button is for the answer to "are you
          sure you want to destroy this", and approving a genuine payment is the
          ordinary, correct thing to do. Irreversible is not the same as
          dangerous, and colouring it red would teach owners to hesitate over the
          action they came here to take. */}
      {confirmingApprove ? (
        <ConfirmDialog
          confirmLabel="Approve"
          message={`This marks ${claim.referenceCode} paid and counts ${formatMoneyPaise(claim.amountPaise)} as collected from ${claim.tenantName ?? "the tenant"}. It cannot be undone, so approve it only once you can see the money in your account.`}
          onCancel={() => setConfirmingApprove(false)}
          onConfirm={() => void approve()}
          title="Approve this payment?"
        />
      ) : null}

      {confirmingReject ? (
        <ConfirmDialog
          confirmLabel="Not received"
          destructive
          message={`This puts the bill back to unpaid and lets ${claim.tenantName ?? "the tenant"} try again. Any late fee for the days since it was due will apply.`}
          onCancel={() => setConfirmingReject(false)}
          onConfirm={() => void notFound()}
          title="Not in your statement?"
        />
      ) : null}

      {viewingProofAt !== null ? (
        <Lightbox
          images={claim.proofImageUrls}
          initialIndex={viewingProofAt}
          onClose={() => setViewingProofAt(null)}
        />
      ) : null}

      {error ? <AlertModal message={error} onClose={() => setError(null)} /> : null}
    </Card>
  );
}

/**
 * What became of a claim, in the tenant's terms rather than the enum's.
 *
 * <p>
 * A cancelled claim appears here too. It was raised on this property and the
 * tenant withdrew it, and an owner scanning a month for a payment they half
 * remember needs to see that it was taken back rather than find nothing.
 */
/**
 * Three states, and no catch-all.
 *
 * <p>
 * Every branch is named. This was written with "waiting on you" as the fallback,
 * which meant a withdrawn attempt — arriving in the window before the server
 * started filtering them — was labelled a live claim demanding the owner's
 * attention. A default branch that asserts something specific will eventually
 * assert it about the wrong thing.
 *
 * <p>
 * The billing chip, not the app's caps-on-tint StatusPill. A claim and the bill
 * it pays sit one tap apart, and the glyph is what separates approved from
 * not-found before the colour registers.
 */
function ClaimStatusPill({ status }: { status: OwnerVisibleStatus }) {
  const { colors } = useTheme();
  const display =
    status === "OWNER_VERIFIED"
      ? { background: colors.successSoft, color: colors.successText, icon: CheckCircle2, label: "Approved" }
      : status === "OWNER_REJECTED"
        ? { background: colors.dangerSoft, color: colors.danger, icon: AlertTriangle, label: "Not found" }
        : { background: colors.warningSoft, color: colors.warningText, icon: Clock3, label: "Waiting on you" };

  return (
    <BillingStatusBadge
      background={display.background}
      color={display.color}
      icon={display.icon}
      label={display.label}
    />
  );
}

/**
 * The claim's timeline, in the order the steps happened.
 *
 * <p>
 * {@code createdAt} is when the tenant opened the payment; {@code
 * tenantDecidedAt} is when they came back and said they had paid. They are
 * different moments and the gap between them is often minutes of the tenant
 * standing in front of a UPI app, so both are worth showing.
 *
 * <p>
 * No withdrawn step. A withdrawal is not a claim, and the owner is not sent it.
 */
function claimStamps(claim: OwnerClaim) {
  type Colors = ReturnType<typeof useTheme>["colors"];
  const stamps: {
    icon: typeof Clock3;
    label: string;
    tone: (colors: Colors) => string;
    value: string;
  }[] = [
    { icon: Clock3, label: "Raised", tone: (colors) => colors.kicker, value: formatStamp(claim.createdAt) },
  ];

  if (claim.tenantDecidedAt) {
    stamps.push({
      icon: Send,
      label: "Claimed",
      tone: (colors) => colors.kicker,
      value: formatStamp(claim.tenantDecidedAt),
    });
  }
  if (claim.ownerDecidedAt) {
    // Green or red on the outcome. This is the row an owner scans a settled
    // card for, and the glyph says which way it went without re-reading the
    // chip at the top.
    const approved = claim.status === "OWNER_VERIFIED";
    stamps.push({
      icon: approved ? CheckCircle2 : AlertTriangle,
      label: "Resolved",
      tone: (colors) => (approved ? colors.successText : colors.danger),
      value: formatStamp(claim.ownerDecidedAt),
    });
  }
  return stamps;
}

/** No year: the screen is already filtered to one month. */
function formatStamp(value: string) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
  return `${day} · ${time}`;
}

/**
 * How long ago the claim came in, in the coarsest honest unit.
 *
 * <p>On an open claim this is pressure: it is blocking the tenant from paying
 * anything else on that bill. On a settled one it is the sequence — which of a
 * month's claims arrived first.
 */
function describeWait(createdAt: string) {
  const hours = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000);
  if (hours < 1) {
    return "Just now";
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
