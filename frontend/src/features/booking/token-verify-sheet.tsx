import { useRef, useState } from "react";
import { Image, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Lightbox } from "@/components/image-carousel";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { METHOD_LABEL, PROOF_FIELD } from "@/features/billing/payment-methods";
import { bookingDateLabel } from "@/features/booking/booking-ui";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, FormInput, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import {
  useMarkBookingTokenNotReceivedMutation,
  useMarkBookingTokenReceivedMutation,
  type BookingRequest,
  type BookingTokenClaim,
} from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The handler's two answers to a token the tenant recorded as paid. */
export type TokenAnswer = "RECEIVED" | "NOT_RECEIVED";

/** The record the tenant made that nobody has answered yet. One at most. */
export function waitingTokenClaim(booking: BookingRequest): BookingTokenClaim | null {
  return booking.token?.claims.find((claim) => claim.answer === null) ?? null;
}

/**
 * Whether this reader may answer it now. The server decides who that is, the
 * owner or whoever handles the booking, and says so in what it allows.
 */
export function canVerifyToken(booking: BookingRequest): boolean {
  return waitingTokenClaim(booking) !== null && booking.allowedTokenActions.includes("MARK_RECEIVED") && booking.allowedTokenActions.includes("MARK_NOT_RECEIVED");
}

/**
 * The handler checks a token the tenant recorded as paid, and answers (user,
 * 2026-10-11: "handler verifies the payment and moves the booking forward").
 *
 * <p>"Received" records the token receipt, not booking confirmation, and is
 * asked for once more with what was recorded in front of the
 * reader. "Not received" needs a reason, because the tenant is shown it, and
 * puts the token back to due with the time that was left.
 */
export function BookingTokenVerifySheet({ answer, booking, onClose, onDone }: { answer: TokenAnswer; booking: BookingRequest; onClose: () => void; onDone: () => void }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  // The booking as it was when the sheet opened. An answer is sent against that version, and refused if it moved.
  const [snapshot] = useState(booking);
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const [markReceived] = useMarkBookingTokenReceivedMutation();
  const [markNotReceived] = useMarkBookingTokenNotReceivedMutation();
  const claim = waitingTokenClaim(snapshot);
  const changed = booking.version !== snapshot.version || !canVerifyToken(booking);
  const amount = formatMoneyPaise(snapshot.token?.amountPaise ?? snapshot.tokenPaise);
  // Handed over at the desk, it is checked there. Otherwise where that method's payments show up.
  const where = claim?.paidAtDesk ? "at your desk" : claim ? PROOF_FIELD[claim.method as keyof typeof PROOF_FIELD]?.checkWhere ?? "in your account" : "in your account";

  async function submit() {
    if (busy.current || changed) return;
    const why = reason.trim();
    if (answer === "NOT_RECEIVED" && !why) { setFieldError("Tell the tenant why it is not counted as received."); return; }
    busy.current = true; setWorking(true);
    const step = { propertyId: snapshot.propertyId, requestId: snapshot.id, version: snapshot.version };
    try {
      if (answer === "RECEIVED") await markReceived(step).unwrap();
      else await markNotReceived({ ...step, reason: why }).unwrap();
      toast.success(answer === "RECEIVED" ? "Token received. Awaiting booking confirmation." : "Marked not received. The tenant has been told why.");
      onDone();
    } catch (caught) {
      setRefusal(errorMessage(caught) || "Could not save that. Try again.");
    } finally { busy.current = false; setWorking(false); }
  }

  return <SheetShell title={answer === "RECEIVED" ? "Token received?" : "Not received?"} onClose={() => { if (!busy.current) onClose(); }}>
    <Text style={[type.description, { color: colors.muted }]}>
      {snapshot.tenantName} recorded <Text style={{ color: colors.ink, fontFamily: fonts.sansBold }}>{amount}</Text> paid{claim ? `${claim.paidAtDesk ? " at the desk" : ""} by ${METHOD_LABEL[claim.method]} on ${bookingDateLabel(claim.claimedAt, true)}` : ""}.{claim?.reference ? ` Reference ${claim.reference}.` : ""}
    </Text>
    {answer === "RECEIVED" ? <NoticeBar tone="warning" title="Record token receipt" message={`Confirm only once you can see the money ${where}. The booking will still need final confirmation.`} /> : <>
      <FormInput label="Reason shown to the tenant" multiline maxLength={500} required value={reason} placeholder="What you checked and could not find" disabled={working} error={fieldError ?? undefined} onChangeText={(value) => { setReason(value); setFieldError(null); }} />
      <Text style={[type.description, { color: colors.muted }]}>The token goes back to due. The tenant gets back the time that was left when they recorded it, and can record a payment again.</Text>
    </>}
    {changed ? <NoticeBar title="The booking changed" tone="warning" message="Close this and look at the latest details before answering." /> : null}
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <ActionButton disabled={working} label="Not now" variant="primaryQuiet" onPress={onClose} />
      <ActionButton disabled={working || changed} label={working ? "Saving..." : answer === "RECEIVED" ? "Confirm received" : "Mark not received"} variant={answer === "RECEIVED" ? "primary" : "dangerFilled"} onPress={() => void submit()} />
    </View>
    {/* A refusal the reader cannot fix by retyping is acknowledged, not left on the page. */}
    {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
  </SheetShell>;
}

/**
 * The photos a tenant sent with a recorded payment, small, each opening full
 * screen. The handler checks a payment against these and their own account.
 */
export function TokenProofImages({ urls }: { urls: string[] }) {
  const { colors } = useTheme();
  const [viewingAt, setViewingAt] = useState<number | null>(null);
  if (urls.length === 0) return null;
  return <View style={{ flexDirection: "row", gap: spacing.sm }}>
    {urls.map((url, index) => <AnimatedPressable key={url} accessibilityLabel={`Open payment proof ${index + 1} of ${urls.length}`} accessibilityRole="imagebutton" onPress={() => setViewingAt(index)} style={{ borderColor: colors.border, borderRadius: 10, borderWidth: 1, height: 64, overflow: "hidden", width: 64 }}>
      <Image source={{ uri: url }} style={{ height: "100%", width: "100%" }} />
    </AnimatedPressable>)}
    {viewingAt !== null ? <Lightbox images={urls} initialIndex={viewingAt} onClose={() => setViewingAt(null)} /> : null}
  </View>;
}
