import { OtpCodeSheet } from "@/components/otp-code-sheet";

/**
 * The second factor on a signature.
 *
 * <p>The sheet itself is the shared {@link OtpCodeSheet}; this is its wording
 * for signing an agreement.
 *
 * <p>Deliberately never calls the code a signature. Under the IT Act this is
 * neither a s.3 digital signature nor a Second Schedule electronic signature;
 * it is evidence of assent, which is what makes the contract enforceable under
 * s.10A. Saying more would misstate the legal effect to the person relying on
 * it.
 */
export function OtpSigningSheet({
  busy,
  onClose,
  onResend,
  onSubmit,
  resending,
  sentTo,
}: {
  busy: boolean;
  onClose: () => void;
  onResend: () => void;
  onSubmit: (otp: string) => void;
  resending: boolean;
  /** Last four digits of the number the code went to. */
  sentTo: string;
}) {
  return (
    <OtpCodeSheet
      busy={busy}
      busyLabel="Signing…"
      message={`We sent a six-digit code to the number ending ${sentTo}. Entering it records your agreement to the terms you just read.`}
      onClose={onClose}
      onResend={onResend}
      onSubmit={onSubmit}
      resending={resending}
      title="Confirm it's you"
    />
  );
}
