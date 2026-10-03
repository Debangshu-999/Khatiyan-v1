package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryCallResult;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * The handler's answer about a call: "Record response".
 *
 * <p>Send {@code callResult}, and the outcome follows from it: the two
 * accepted answers are a success, the other two a failure. {@code outcome} on
 * its own is still taken, for a caller that only knows success or failure.
 *
 * @param outcome         SUCCEEDED or FAILED. Worked out from {@code callResult} when left out
 * @param note            optional: talking points, or what held them back
 * @param callResult      how the call went
 * @param durationSeconds optional: how long an accepted call ran
 */
public record SettleEnquiryAttemptRequest(
        EnquiryAttemptOutcome outcome,
        @Size(max = 500, message = "The note can be at most 500 characters.")
        String note,
        EnquiryCallResult callResult,
        @Min(value = 0, message = "The call cannot run for less than no time.")
        @Max(value = 86399, message = "A call can be at most 23 hours, 59 minutes and 59 seconds.")
        Integer durationSeconds) {

    public SettleEnquiryAttemptRequest {
        if (outcome == null && callResult != null) {
            outcome = callResult.outcome();
        }
    }

    /** Success or failure alone, with no detail. */
    public SettleEnquiryAttemptRequest(EnquiryAttemptOutcome outcome, String note) {
        this(outcome, note, null, null);
    }
}
