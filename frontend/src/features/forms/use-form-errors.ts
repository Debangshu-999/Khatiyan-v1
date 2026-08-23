import { useCallback, useMemo, useState } from "react";

/**
 * The two error channels every form in this app uses.
 *
 * <p>**Field errors** are problems with what was typed — empty, malformed, out
 * of range. They render under the field, because that is where the fix is. They
 * appear on submit, not on every keystroke, and clear as soon as the field they
 * blame is edited.
 *
 * <p>**The server error** is a refusal from the backend. It gets a modal: the
 * reader cannot fix it by retyping, so there is nothing to look at and nothing
 * to correct in place.
 *
 * <p>Toasts are for neither. They confirm things that worked.
 *
 * <p>`blocked` is the submit gate. Once a submit has produced field errors the
 * button stays disabled until every one of them is cleared, so the same invalid
 * payload cannot be fired at the server repeatedly.
 */
export function useFormErrors<Field extends string>() {
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  /** True while any field is in error — bind to the submit button's `disabled`. */
  const blocked = useMemo(() => Object.keys(errors).length > 0, [errors]);

  /**
   * Records the result of validation. Pass an empty object for "all good".
   *
   * <p>Returns whether the form is clear, so a handler can read:
   * `if (!form.validate({ ... })) return;`
   */
  const validate = useCallback((found: Partial<Record<Field, string>>) => {
    setErrors(found);
    return Object.keys(found).length === 0;
  }, []);

  /**
   * Clears one field's error. Call from `onChangeText`, so correcting the field
   * that was blamed releases the submit gate without waiting for another submit.
   */
  const clearField = useCallback((field: Field) => {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  /**
   * Wipes every field error.
   *
   * <p>Returns the SAME object when there was nothing to clear. A reset effect
   * that calls this on mount would otherwise set fresh state on every render and
   * spin forever.
   */
  const clearAll = useCallback(
    () => setErrors((current) => (Object.keys(current).length === 0 ? current : {})),
    [],
  );

  return {
    blocked,
    clearAll,
    clearField,
    /** Dismisses the server-error modal. */
    dismissServerError: useCallback(() => setServerError(null), []),
    errors,
    /** Shows the server-error modal. */
    failFromServer: setServerError,
    serverError,
    validate,
  };
}
