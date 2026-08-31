/**
 * What is wrong with an email address, said specifically.
 *
 * <p>Every email field used to fail the same way: a regex returned false and the
 * screen printed "Enter a valid email address". Typing `te` produced the same
 * message as typing `a@b` or leaving it blank, so the one thing the person
 * needed — WHICH part is wrong — was the one thing it did not say.
 *
 * <p>So the checks run in the order a person builds an address, and the first
 * one that fails is the message. That ordering matters: `te` is missing an @
 * before it is missing a domain, and saying the later thing first sends someone
 * to fix a part they have not written yet.
 *
 * <p>Deliberately not a stricter regex. Real addresses are far stranger than any
 * pattern short enough to read, and the job here is to catch a typo before a
 * deed is issued against it, not to prove deliverability. Anything that survives
 * these checks is accepted.
 */

/**
 * The problem with `value`, or null when there is none.
 *
 * @param blankMessage what to say when the field is empty. Passing null makes
 *        blank acceptable, which is what an optional email field wants — it
 *        still has to be a real address if anything is typed at all.
 */
export function emailProblem(value: string, blankMessage: string | null): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return blankMessage;
  }

  // Checked before anything else. A space is invisible in a field, so somebody
  // staring at an address that looks perfect deserves to be told what is there.
  if (/\s/.test(trimmed)) {
    return "Enter a valid email address, it cannot contain spaces.";
  }

  const atCount = (trimmed.match(/@/g) ?? []).length;
  if (atCount === 0) {
    return 'Enter a valid email address, the "@" is missing.';
  }
  if (atCount > 1) {
    return 'Enter a valid email address, it can only have one "@".';
  }

  const [localPart, domain] = trimmed.split("@");
  if (!localPart) {
    return 'Enter a valid email address, nothing comes before the "@".';
  }
  if (!domain) {
    return 'Enter a valid email address, nothing comes after the "@".';
  }
  if (!domain.includes(".")) {
    return "Enter a valid email address, the domain needs a dot, like .com.";
  }
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return "Enter a valid email address, the domain is not complete.";
  }

  return null;
}
