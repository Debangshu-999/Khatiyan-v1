/**
 * Whether an edit form still holds exactly what it was opened with.
 *
 * <p>Saving an untouched form used to fire the request, succeed, toast
 * "Updated." and navigate away — telling the reader something happened when
 * nothing did, and costing them the screen they were on. Callers use this to
 * warn and STAY PUT instead:
 *
 * <pre>
 *   if (isUnchanged(initial, current)) {
 *     toast.warning("No changes have been made.");
 *     return;                      // no request, no navigation
 *   }
 * </pre>
 *
 * <p>Compares by value, one level deep, after trimming strings — a field the
 * reader typed into and then undid, or padded with a space, is not a change.
 * Arrays compare by contents in order, which suits id lists as they are built.
 */
export function isUnchanged<T extends Record<string, unknown>>(initial: T, current: T): boolean {
  const keys = new Set([...Object.keys(initial), ...Object.keys(current)]);

  for (const key of keys) {
    if (!sameValue(initial[key], current[key])) {
      return false;
    }
  }

  return true;
}

function sameValue(left: unknown, right: unknown): boolean {
  const a = normalize(left);
  const b = normalize(right);

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }

  return a === b;
}

/**
 * Treats the several ways "nothing here" is spelled as one value, so a field
 * that arrived null and is now an empty string does not read as an edit.
 */
function normalize(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (value === undefined) {
    return null;
  }
  return value;
}
