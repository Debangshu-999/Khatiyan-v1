package com.khatiyan.a_auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Tells someone their recovery address changed — at the address it changed FROM.
 *
 * <p>This is the one message an attacker cannot intercept. The recovery address
 * is the PIN-reset channel, so the first move after getting a session on an
 * unlocked phone is to point it somewhere else; from that moment every reset,
 * and every other notification, goes to them. Writing to the outgoing address
 * is the only path that still reaches the real owner.
 *
 * <p>When there was no previous address the new one is told instead. Nothing is
 * at risk yet, but "an address was added to your account" is still the signal
 * that says whether it was you.
 *
 * <p><b>Never throws.</b> A bounced or refused notification must not stop
 * someone correcting their own recovery address — that would turn a mail
 * outage into an account lockout, which is the opposite of the point.
 */
@Slf4j
@Service
public class RecoveryEmailChangeNotifier {

    private final JavaMailSender mailSender;
    private final String fromAddress;

    public RecoveryEmailChangeNotifier(
            JavaMailSender mailSender,
            @Value("${app.otp.delivery.email.from:no-reply@khatiyan.local}") String fromAddress) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
    }

    /**
     * @param previousEmail the address being replaced, or null when one is being
     *                      set for the first time
     * @param newEmail      the address now on file
     */
    public void notifyChanged(String previousEmail, String newEmail) {
        boolean firstTime = previousEmail == null || previousEmail.isBlank();
        String recipient = firstTime ? newEmail : previousEmail;
        if (recipient == null || recipient.isBlank()) {
            return;
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(recipient);
        message.setSubject(firstTime
                ? "A recovery email was added to your Khatiyan account"
                : "Your Khatiyan recovery email was changed");
        // The new address is masked. This mail goes to an address that may no
        // longer belong to the account, so it must not hand a stranger a full
        // second address to go after — enough to recognise, not enough to reuse.
        message.setText(firstTime
                ? "This address was added as the recovery email for your Khatiyan account.\n\n"
                        + "If this was not you, contact support immediately — a recovery email can be "
                        + "used to reset the account PIN."
                : "The recovery email for your Khatiyan account was changed to " + mask(newEmail) + ".\n\n"
                        + "This address will no longer receive account recovery messages.\n\n"
                        + "If this was not you, contact support immediately — whoever made this change "
                        + "can now reset the account PIN.");

        try {
            mailSender.send(message);
        } catch (RuntimeException e) {
            // Logged, not rethrown: the address change itself already succeeded
            // and is the caller's actual request.
            log.error(
                    "Recovery email change notification failed firstTime={} reason={}",
                    firstTime,
                    e.getMessage());
        }
    }

    /** {@code someone@example.com} to {@code s••••••@example.com}. */
    private static String mask(String email) {
        if (email == null) {
            return "an address we cannot show";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "an address we cannot show";
        }
        return email.charAt(0) + "•".repeat(Math.max(1, at - 1)) + email.substring(at);
    }
}
