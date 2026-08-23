/**
 * Turns whatever a failed request threw into a sentence worth showing.
 *
 * <p>Lived in the auth feature, and got copied — with drift — into eight other
 * files as `errorText`, `readErrorMessage`, `settleErrorMessage`. This is the
 * thorough version: it reads the API's ErrorResponse body, recognises RTK
 * Query's transport failures, falls back to plain language per status, and
 * refuses to surface a raw JS Error to a user.
 */

/** Plain-language fallback for a response that carried no usable message. */
function statusMessage(status: number) {
  if (status === 401 || status === 403) {
    return "You do not have access to do that.";
  }
  if (status === 404) {
    return "We could not find what you asked for.";
  }
  if (status === 408 || status === 504) {
    return "That took too long. Check your connection and try again.";
  }
  if (status === 429) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (status >= 500) {
    return "Something went wrong at our end. Please try again.";
  }
  return "Please check the details and try again.";
}

/**
 * The API's stable {@code code} from an ErrorResponse body, when there is one.
 *
 * <p>For the handful of refusals a client must react to differently rather than
 * simply display — the session cap being the first. Everything else should keep
 * using {@link errorMessage} and show what the server said.
 */
export function errorCode(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: { code?: unknown } }).data;
    if (typeof data?.code === "string") {
      return data.code;
    }
  }
  return null;
}

/**
 * Extra fields the API attached to a refusal, for the few responses that carry
 * more than a sentence — the device list on a session-cap refusal being the one
 * so far. Returns the whole body so callers can pick what they know about.
 */
export function errorBody(error: unknown): Record<string, unknown> | null {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "object" && data) {
      return data as Record<string, unknown>;
    }
  }
  return null;
}

export function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: { message?: string } }).data;
    if (data?.message) {
      return data.message;
    }
  }

  if (typeof error === "object" && error && "status" in error) {
    const queryError = error as { status?: unknown; error?: unknown; data?: unknown };
    if (queryError.status === "TIMEOUT_ERROR") {
      return "The server took too long to respond. Check your connection and try again.";
    }
    if (queryError.status === "FETCH_ERROR") {
      return "Could not reach the backend. If you are on Expo Go, use the detected laptop URL.";
    }
    if (queryError.status === "PARSING_ERROR") {
      return "Backend responded, but the app could not read the response.";
    }
    if (typeof queryError.status === "number") {
      if (typeof queryError.data === "object" && queryError.data && "message" in queryError.data) {
        const message = (queryError.data as { message?: unknown }).message;
        if (typeof message === "string") {
          return message;
        }
      }
      // A body that came back as plain text rather than our ErrorResponse
      // shape — a proxy page, a gateway error, a filter that rejected before
      // the handler ran. Still more use to the reader than a status code.
      if (typeof queryError.data === "string" && queryError.data.trim()) {
        return queryError.data.trim();
      }
      // Last resort. Never show a raw HTTP status: it tells the person nothing
      // they can act on and reads like the app broke. Say what it means.
      return statusMessage(queryError.status);
    }
    if (typeof queryError.error === "string") {
      return queryError.error;
    }
  }

  // A plain Error is OUR bug, not the server's — a TypeError, a storage
  // failure, a bad assumption. Its message is written for whoever is reading
  // the stack trace, not for the person holding the phone, and shipping it to a
  // toast has already put "Cannot read properties of null" in front of a user.
  // Keep it in the console where it is useful; say something actionable on
  // screen.
  if (error instanceof Error) {
    console.warn("Unexpected client error surfaced to the user", error);
    return "Something went wrong. Please try again.";
  }

  return "Something went wrong. Please try again.";
}
