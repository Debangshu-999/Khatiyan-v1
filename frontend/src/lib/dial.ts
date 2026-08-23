import { Linking } from "react-native";

/** India's country code, the only one this app stores numbers under. */
const COUNTRY_CODE = "91";

/** A local Indian mobile number, once the country code is off. */
const LOCAL_LENGTH = 10;

/**
 * The number as a person would key it, with the country code taken off.
 *
 * <p>Numbers are stored and sent as `+91XXXXXXXXXX`, and handing that straight
 * to the dialer put `+91` in the field on every call. It dials correctly either
 * way, so this is about what the caller SEES: a local number is what anyone
 * recognises, and the prefix reads as a foreign call.
 *
 * <p>Only stripped when what remains is a full local number. A ten-digit string
 * beginning "91" is left alone — that is somebody's number, not a country code,
 * and truncating it would dial the wrong person.
 */
export function localDialNumber(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");

  if (digits.startsWith(COUNTRY_CODE) && digits.length === COUNTRY_CODE.length + LOCAL_LENGTH) {
    return digits.slice(COUNTRY_CODE.length);
  }

  return digits;
}

/**
 * Opens the dialer on a number, without the country code.
 *
 * <p>Every phone action in the app goes through here, so the rule lives in one
 * place rather than in each screen's own `tel:` template.
 */
export function openDialer(phone: string | null | undefined): void {
  if (!phone) {
    return;
  }

  const number = localDialNumber(phone);
  if (!number) {
    return;
  }

  void Linking.openURL(`tel:${number}`);
}
