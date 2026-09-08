/**
 * An Indian number as a person reads it: "+91 98765 43210".
 *
 * <p>
 * The dial code is shown, not implied. A bare ten digits under a name reads as
 * a second line of the name, and the lookup cards are the one place in the app
 * where the owner is checking they typed the RIGHT number — the code being
 * visible is part of what they are checking.
 *
 * <p>
 * Takes the last ten digits rather than stripping a "+91" prefix, so it reads
 * the same whether the stored value carries the code or not. Anything that is
 * not ten digits is returned untouched: a half-typed number should look
 * half-typed, not be padded into something that looks complete.
 */
export function formatIndianPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) {
    return phone.trim();
  }
  const local = digits.slice(-10);
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}
