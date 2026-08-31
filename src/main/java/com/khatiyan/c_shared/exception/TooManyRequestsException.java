package com.khatiyan.c_shared.exception;

/**
 * A limit the caller will be allowed past once they wait.
 *
 * <p>Carries how long, because "try again later" is not something a screen can
 * act on. With the number, a button can count down and re-enable itself; the
 * person is told when rather than left tapping to find out.
 *
 * <p>Separate from {@code ValidationException}, which the OTP limiter used to
 * throw: that maps to 400 and reads as "you sent something wrong", when nothing
 * about the request was wrong except its timing.
 */
public class TooManyRequestsException extends RuntimeException {

    private final long retryAfterSeconds;

    public TooManyRequestsException(String message, long retryAfterSeconds) {
        super(message);
        // Never below one. Zero would render as "try again in 0s" and leave a
        // button that is still refused, which reads as the app lying.
        this.retryAfterSeconds = Math.max(1L, retryAfterSeconds);
    }

    public long retryAfterSeconds() {
        return this.retryAfterSeconds;
    }
}
