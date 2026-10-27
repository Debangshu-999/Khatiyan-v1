import { useRef, useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import { AlertModal } from "@/components/alert-modal";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonForm } from "@/components/skeletons/primitives";
import { useToast } from "@/components/toast";
import { BankTab, DeskTab, PaymentMethodDropdown, UpiTab, payMethodOptions, type PayOption } from "@/features/billing/pay-bill-sheet";
import { METHOD_ORDER, type TenderMethod } from "@/features/billing/payment-methods";
import { PaymentProofForm, PaymentProofHeading, type PaymentProof } from "@/features/billing/raise-claim-modal";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, NoticeBar, formatMoneyPaise } from "@/features/owner/owner-ui";
import { useClaimBookingTokenPaidMutation, useGetBookingTokenPayDetailsQuery, type BookingRequest } from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * How a token is paid from where the tenant is: by UPI or by bank transfer, to
 * the details the owner set for tokens. Cash, a card and a cheque change hands
 * at the property, so they are recorded under "Paid at desk" and nowhere else.
 */
export type TokenPaidMethod = Exclude<TenderMethod, "CASH" | "CARD" | "CHEQUE">;

/** How a token is handed over at the property's desk (user, 2026-10-11: "cash card UPI cheque"). Never a bank transfer. */
export type TokenDeskMethod = Exclude<TenderMethod, "BANK_TRANSFER">;
const DESK_ORDER: TokenDeskMethod[] = ["CASH", "CARD", "UPI", "CHEQUE"];

/** The picker's third line. It is a place to pay, not a way of paying: the way is asked for with the proof. */
const DESK = "DESK";
const DESK_OPTION: PayOption<typeof DESK> = { icon: "desk", label: "Paid at desk", value: DESK };
type PayChoice = TokenPaidMethod | typeof DESK;

/** The desk card's words, as the user gave them (2026-10-11). */
const DESK_TITLE = "Pay at desk";
const DESK_MESSAGE = "Hand over the amount at the property desk, either via cash, card, UPI or cheque. If you have already done so, you can submit the proof here.";

export function tokenPaidMethods(accepted: readonly string[]): TokenPaidMethod[] {
  return METHOD_ORDER.filter((method): method is TokenPaidMethod => (method === "UPI" || method === "BANK_TRANSFER") && accepted.includes(method));
}

/** The ways a token is handed over at the desk, in the order the sheet lists them. The server sends all four. */
export function tokenDeskMethods(taken: readonly string[]): TokenDeskMethod[] {
  return DESK_ORDER.filter((method) => taken.includes(method));
}

/**
 * The sheet behind the tenant's "View/Record payment" button (the user's
 * name for it, 2026-10-11): where to pay the token, laid out as the bill's pay
 * sheet is, and then the proof (with images of that sheet: "like this, just
 * instead of Scan and pay there should be submit payment proof").
 *
 * <p>Three ways, each with its own "Submit payment proof": UPI, with a QR and
 * an address to copy. A bank transfer, with the account. And "Paid at desk",
 * with the bill sheet's desk card. Nothing here opens a UPI app. The person
 * pays however they like and comes back to submit the proof.
 *
 * <p>The second step is the bill claim's own proof form, that way's reference
 * or a photo, with a back arrow to the first. For the desk it starts with a
 * picker of how the token was handed over there, cash, card, UPI or cheque,
 * and the proof under it is that one's. A reference or photo is required;
 * only a cash payment handed over at the desk may have no receipt.
 *
 * <p>It only records. Whoever handles the booking checks the payment and
 * answers, and "received" is what confirms the booking. While that answer is
 * waited for the server offers no second record, so the button that opens
 * this is not drawn.
 */
export function BookingTokenPaidSheet({ booking, onClose, onDone }: { booking: BookingRequest; onClose: () => void; onDone: () => void }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  // The booking as it was when the sheet opened. A record is sent against that version, and refused if it moved.
  const [snapshot] = useState(booking);
  const details = useGetBookingTokenPayDetailsQuery(booking.id, { refetchOnMountOrArgChange: true });
  const [picked, setPicked] = useState<PayChoice | null>(null);
  // The way whose proof is being given. Null while the sheet is still showing where to pay.
  const [proofFor, setProofFor] = useState<PayChoice | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const [claim] = useClaimBookingTokenPaidMutation();
  // How it was handed over at the desk, chosen with the proof. Last, so the states above keep their places.
  const [deskPicked, setDeskPicked] = useState<TokenDeskMethod | null>(null);
  const data = details.currentData;
  const methods = tokenPaidMethods(data?.acceptedMethods ?? []);
  const deskMethods = tokenDeskMethods(data?.deskMethods ?? []);
  const options: PayOption<PayChoice>[] = [...payMethodOptions(methods), ...(deskMethods.length > 0 ? [DESK_OPTION] : [])];
  const choice = picked && options.some((option) => option.value === picked) ? picked : options[0]?.value ?? null;
  const deskMethod = deskPicked && deskMethods.includes(deskPicked) ? deskPicked : deskMethods[0] ?? null;
  const changed = booking.version !== snapshot.version || !booking.allowedTokenActions.includes("CLAIM_PAID");
  const payee = data?.payee ?? null;

  async function submit(method: TenderMethod, atDesk: boolean, proof: PaymentProof) {
    if (busy.current || changed) return;
    const reference = proof.referenceText?.trim() || null;
    const proofImageUrls = proof.proofImageUrls.map((url) => url.trim()).filter(Boolean).slice(0, 2);
    if (!(atDesk && method === "CASH") && !reference && !proofImageUrls.length) {
      setRefusal("Enter a transaction reference or upload a payment photo.");
      return;
    }
    busy.current = true; setWorking(true);
    try {
      await claim({ requestId: snapshot.id, version: snapshot.version, method, paidAtDesk: atDesk, reference, proofImageUrls }).unwrap();
      toast.success("Sent to the property to confirm.");
      onDone();
    } catch (caught) {
      setRefusal(errorMessage(caught) || "Could not send that. Try again.");
    } finally { busy.current = false; setWorking(false); }
  }

  async function copy(value: string, what: string) {
    await Clipboard.setStringAsync(value);
    toast.success(`${what} copied.`);
  }

  // Each way has this one button: where Scan and pay sits on a bill, under the account, and under the desk card.
  const submitProof = choice ? <View style={{ flexDirection: "row" }}><ActionButton disabled={changed} label="Submit payment proof" onPress={() => setProofFor(choice)} /></View> : null;
  const back = () => setProofFor(null);

  return <SheetShell title={proofFor ? "Submit payment proof" : data ? `Pay ${formatMoneyPaise(data.amountPaise)}` : "Pay token"} onClose={() => { if (!busy.current) onClose(); }}>
    {!data && !details.isError ? <SkeletonForm fields={3} /> : null}
    {details.isError ? <>
      <NoticeBar title="Could not load the token" message={errorMessage(details.error)} tone="danger" />
      <View style={{ flexDirection: "row" }}><ActionButton label="Try again" onPress={() => void details.refetch()} /></View>
    </> : null}
    {data && proofFor === DESK && deskMethod ? (
      // Paid at the desk: first how it was handed over, in the sheet's own picker, then that way's proof
      // (user, 2026-10-11: "inside the submit proof there should be the picker for Cash card UPI cheque").
      <View style={{ gap: spacing.md }}>
        <PaymentProofHeading icon={DESK_OPTION.icon} label={DESK_OPTION.label} onBack={back} />
        <PaymentMethodDropdown onChange={setDeskPicked} options={payMethodOptions(deskMethods)} value={deskMethod} />
        <PaymentProofForm key={`desk:${deskMethod}`} boxedProof busy={working} disabled={changed} hideMethod method={deskMethod} onSubmit={(proof) => void submit(deskMethod, true, proof)} referenceCode={data.referenceCode} requireProof={deskMethod !== "CASH"} showOptionalHint={false} skipLabel="Submit without proof" submitLabel="Submit payment proof" />
      </View>
    ) : data && proofFor && proofFor !== DESK ? (
      // That way's own reference or a photo, exactly as a bill's claim asks, with a way back to where to pay.
      <PaymentProofForm key={proofFor} boxedProof busy={working} disabled={changed} method={proofFor} onBack={back} onSubmit={(proof) => void submit(proofFor, false, proof)} referenceCode={data.referenceCode} requireProof showOptionalHint={false} submitLabel="Submit payment proof" />
    ) : data ? (
      <View style={{ gap: spacing.md }}>
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
          {payee?.payeeName ?? "This property"} · <Text style={{ fontFamily: fonts.mono }}>{data.referenceCode}</Text>
        </Text>
        {choice ? <>
          {/* Only offer a choice when the token can be paid more than one way. */}
          {options.length > 1 ? <PaymentMethodDropdown onChange={setPicked} options={options} value={choice} /> : null}
          <View style={{ gap: spacing.md }}>
            {choice === "UPI" && payee
              ? <UpiTab action={submitProof} busy={false} hasPayLink={false} onCopy={(value, what) => void copy(value, what)} onScanAndPay={() => undefined} onSelectUpiApp={() => undefined} payee={payee} selectedUpiApp="GOOGLE_PAY" />
              : choice === DESK
                ? <>
                  {/* The bill sheet's own desk card (user, 2026-10-11: "exactly like the pay bill modal"), in the user's words. */}
                  <DeskTab message={DESK_MESSAGE} method="CASH" title={DESK_TITLE} />
                  {submitProof}
                </>
                : <>
                  {choice === "BANK_TRANSFER" && payee ? <BankTab onCopy={(value, what) => void copy(value, what)} payee={payee} referenceCode={data.referenceCode} /> : null}
                  {submitProof}
                </>}
          </View>
        </> : <NoticeBar title="Nowhere to pay yet" message="This property has not set up a way to take its token. Ask them in the chat how to pay it." tone="info" />}
      </View>
    ) : null}
    {changed ? <NoticeBar title="The booking changed" message="Close this and look at the latest token status before recording a payment." tone="warning" /> : null}
    {/* A refusal the reader cannot fix by retyping is acknowledged, not left on the page. */}
    {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
  </SheetShell>;
}
