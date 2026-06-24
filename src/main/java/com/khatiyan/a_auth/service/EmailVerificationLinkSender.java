package com.khatiyan.a_auth.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class EmailVerificationLinkSender {
    private final JavaMailSender mailSender;
    private final String fromAddress;
    private final String verificationUrl;

    public EmailVerificationLinkSender(
            JavaMailSender mailSender,
            @Value("${app.otp.delivery.email.from:no-reply@khatiyan.local}") String fromAddress,
            @Value("${app.email.verification-url:http://localhost:8080/api/v1/auth/email/verify}") String verificationUrl) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
        this.verificationUrl = verificationUrl;
    }

    public void send(String email, String token) {
        String link = verificationUrl + "?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(email);
        message.setSubject("Verify your Khatiyan email");
        message.setText("Verify your Khatiyan recovery email by opening this link:\n\n" + link
                + "\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.");
        try {
            mailSender.send(message);
        } catch (RuntimeException e) {
            // Log the real cause (SMTP host/port/timeout); the request still surfaces
            // as a generic 500 so SMTP details never reach the user.
            log.error("Email verification link delivery failed email={} reason={}", email, e.getMessage());
            throw e;
        }
    }
}