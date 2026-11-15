/**
 * India's 28 states and 8 union territories, as a property's State (user,
 * 2026-11-08: a dropdown instead of free text). One spelling each, so a search
 * scoped by state matches every property filed in it.
 */
export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  // Union territories.
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

/** Old names and the geocoder's spellings, lower-cased, to the list's own. */
const ALIASES: Record<string, IndianState> = {
  "nct of delhi": "Delhi",
  "national capital territory of delhi": "Delhi",
  "new delhi": "Delhi",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  "andaman & nicobar islands": "Andaman and Nicobar Islands",
  "jammu & kashmir": "Jammu and Kashmir",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra & nagar haveli and daman & diu": "Dadra and Nagar Haveli and Daman and Diu",
};

/**
 * The list's spelling of a typed, saved or geocoded state, or null when it is
 * not one. A property saved before the dropdown, or a map pick, lands on the
 * right entry instead of a blank.
 */
export function matchIndianState(value: string | null | undefined): IndianState | null {
  const key = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return INDIAN_STATES.find((state) => state.toLowerCase() === key) ?? ALIASES[key] ?? null;
}
