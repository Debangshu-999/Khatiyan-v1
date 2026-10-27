/**
 * A person's name as a card shows it (user, 2026-10-28): the first and last
 * name only, so a middle name or two never pushes the card's row apart.
 * "Debangshu Kumar Das" is "Debangshu Das". One or two words are left as they
 * are, and an empty name stays empty.
 *
 * <p>Cards only. A detail screen, a form, an agreement or a receipt keeps the
 * whole name.
 */
export function cardName(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length > 2 ? `${words[0]} ${words[words.length - 1]}` : words.join(" ");
}
