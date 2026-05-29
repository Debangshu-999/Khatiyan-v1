package com.khatiyan.d_modules.notification.model;

/**
 * Provider-neutral result for one push send attempt.
 */
public record PushSendResult(
    boolean delivered,
    boolean retryable,
    String failureReason
) {

    public static PushSendResult success() {
        return new PushSendResult(true, false, null);
    }

    public static PushSendResult retryableFailure(String failureReason) {
        return new PushSendResult(false, true, failureReason);
    }

    public static PushSendResult permanentFailure(String failureReason) {
        return new PushSendResult(false, false, failureReason);
    }
}
