package com.khatiyan.a_auth.api.dto;

import com.khatiyan.a_auth.model.OtpDeliveryChannel;
import com.khatiyan.a_auth.model.OtpPurpose;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for asking the auth module to issue an OTP.
 *
 * <p>The same endpoint is used for first PIN setup and PIN reset. The client
 * can choose whether the OTP should be delivered only by SMS or by SMS plus
 * WhatsApp.
 */
public record RequestOtpRequest(
    @NotBlank @Size(max = 15) String phone,
    OtpPurpose purpose,
    OtpDeliveryChannel channel
) {

    public OtpDeliveryChannel resolvedChannel() {
        if (channel == null) {
            return OtpDeliveryChannel.SMS;
        }

        return channel;
    }

    public OtpPurpose resolvedPurpose() {
        if (purpose == null) {
            return OtpPurpose.LOGIN;
        }

        return purpose;
    }
}
