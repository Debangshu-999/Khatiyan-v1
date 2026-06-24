package com.khatiyan.a_auth.model;

/**
 * Channels requested by the client for OTP delivery.
 *
 * <p>SMS is always the reliable base channel. When WhatsApp is selected, the
 * same OTP is sent through both SMS and WhatsApp.
 */
public enum OtpDeliveryChannel {
    SMS,
    SMS_AND_WHATSAPP,
    EMAIL,
    SMS_AND_EMAIL
}
