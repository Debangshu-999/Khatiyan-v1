import type { LocationGeocodedAddress } from "expo-location";

type NativeAddress = Pick<
  LocationGeocodedAddress,
  "city" | "district" | "formattedAddress" | "name" | "postalCode" | "region" | "street" | "streetNumber"
>;

function clean(value: string | null) {
  return value?.trim() || null;
}

function same(first: string | null, second: string | null) {
  return Boolean(first && second && first.toLocaleLowerCase() === second.toLocaleLowerCase());
}

function streetLine(address: NativeAddress, parts: string[]) {
  const street = clean(address.street);
  const number = clean(address.streetNumber);
  if (street && number && !street.includes(number)) {
    return number + " " + street;
  }
  return street ?? clean(address.name) ?? parts[0] ?? null;
}

/**
 * Native reverse geocoding often exposes only the municipality as city while
 * its Android address line contains the familiar sector and metro city. Keep
 * those address levels separate: a street is not an area, and an administrative
 * district is not a substitute for a display city.
 */
export function resolveCurrentLocationAddress(address: NativeAddress) {
  const parts = (address.formattedAddress ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const street = streetLine(address, parts);
  const nativeCity = clean(address.city);
  const pincode = clean(address.postalCode);

  // Salt Lake/Sector V can be reported as Bidhannagar municipality even when
  // the same address explicitly names Kolkata. Use the metro city shown in the
  // address, while leaving district/subregion out of the user-facing line.
  const kolkata = parts.find((part) => /^kolkata$/i.test(part));
  const westBengal = /^west bengal$/i.test(address.region ?? "")
    || parts.some((part) => /^west bengal(?:\s+\d{6})?$/i.test(part));
  const city = (westBengal && kolkata)
    ? kolkata
    : westBengal && pincode === "700091" && /^bidhannagar$/i.test(nativeCity ?? "")
      ? "Kolkata"
      : nativeCity && !/\b(district|parganas)\b/i.test(nativeCity)
        ? nativeCity
        : null;

  // Prefer a named sector anywhere in the formatted address. For other
  // addresses, take the last component before the city, never the street or
  // the administrative district.
  const sector = parts.find((part) => /^sector[\s-]*(?:\d+|[ivxlcdm]+)\b/i.test(part));
  const cityIndex = parts.findIndex((part) => same(part, nativeCity) || same(part, city));
  const beforeCity = cityIndex > 0 ? parts.slice(0, cityIndex).reverse() : [];
  const locality = sector ?? beforeCity.find((part) =>
    !same(part, street) && !same(part, clean(address.district))
  ) ?? null;

  const addressParts = [street, locality, city ? city + (pincode ? " " + pincode : "") : pincode]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.findIndex((other) => other.toLocaleLowerCase() === part.toLocaleLowerCase()) === index);
  const searchParts = [locality, city]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.findIndex((other) => same(other, part)) === index);

  return {
    city,
    displayAddress: addressParts.join(", ") || "Current location",
    locality,
    searchHint: searchParts.join(", "),
  };
}
