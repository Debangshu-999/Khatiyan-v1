package com.khatiyan.a_auth.service.providers;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.model.OtpDeliveryProviderType;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.service.OtpDeliveryProvider;

/**
 * SMTP-backed email provider for OTP delivery.
 */
@Component
@ConditionalOnProperty(prefix = "app.otp.delivery.email", name = "provider", havingValue = "smtp")
public class SmtpEmailOtpDeliveryProvider implements OtpDeliveryProvider {

    private final JavaMailSender mailSender;
    private final String fromAddress;
    private final String subjectPrefix;

    public SmtpEmailOtpDeliveryProvider(
            JavaMailSender mailSender,
            @Value("${app.otp.delivery.email.from:no-reply@khatiyan.local}") String fromAddress,
            @Value("${app.otp.delivery.email.subject-prefix:Khatiyan}") String subjectPrefix) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
        this.subjectPrefix = subjectPrefix;
    }

    @Override
    public OtpDeliveryProviderType type() {
        return OtpDeliveryProviderType.EMAIL;
    }

    @Override
    public void sendOtp(String recipient, String otp, OtpPurpose purpose) {
        if (recipient == null || recipient.isBlank()) {
            throw new IllegalArgumentException("Email OTP recipient is required");
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(recipient);
        message.setSubject(subjectPrefix + " verification code");
        message.setText("Your " + subjectPrefix + " verification code is " + otp + ". It expires in 10 minutes. Purpose: " + purpose + ".");
        mailSender.send(message);
    }
}
