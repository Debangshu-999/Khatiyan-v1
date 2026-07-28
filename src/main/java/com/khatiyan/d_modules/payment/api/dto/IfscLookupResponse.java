package com.khatiyan.d_modules.payment.api.dto;

/**
 * Result of resolving an IFSC against the bank directory.
 *
 * <p>{@code status} is deliberately three-valued: "this branch does not exist"
 * and "we could not reach the directory" must not look the same to the caller,
 * because only the first is the owner's mistake.
 */
public record IfscLookupResponse(
        String ifsc,
        IfscLookupStatus status,
        String bank,
        String branch,
        String city,
        String state) {

    public enum IfscLookupStatus {
        FOUND,
        NOT_FOUND,
        UNAVAILABLE
    }

    public static IfscLookupResponse found(String ifsc, String bank, String branch, String city, String state) {
        return new IfscLookupResponse(ifsc, IfscLookupStatus.FOUND, bank, branch, city, state);
    }

    public static IfscLookupResponse notFound(String ifsc) {
        return new IfscLookupResponse(ifsc, IfscLookupStatus.NOT_FOUND, null, null, null, null);
    }

    public static IfscLookupResponse unavailable(String ifsc) {
        return new IfscLookupResponse(ifsc, IfscLookupStatus.UNAVAILABLE, null, null, null, null);
    }

    public boolean isFound() {
        return status == IfscLookupStatus.FOUND;
    }

    public boolean isNotFound() {
        return status == IfscLookupStatus.NOT_FOUND;
    }
}
