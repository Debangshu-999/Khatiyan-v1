package com.khatiyan.d_modules.mail.service;

import java.io.UnsupportedEncodingException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;

/**
 * Sends one queued mail, inside the transaction that took it.
 *
 * <p>The address is read now, not when the mail was queued, and only a
 * verified one is used. A send that fails is tried again later, a little
 * further apart each time, and given up after five tries. A mail still unsent
 * a day after it was due is dropped: what it says has gone stale, and a long
 * outage should not end in a burst of old mail.
 */
@Slf4j
@Service
public class MailDelivery {

    static final int MOST_ATTEMPTS = 5;
    static final Duration STALE_AFTER = Duration.ofDays(1);
    private static final List<Duration> BACK_OFF =
            List.of(Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(15), Duration.ofHours(1));

    private final MailOutbox outbox;
    private final AuthModule authModule;
    private final JavaMailSender mailSender;
    private final String fromAddress;
    private final Clock clock;

    public MailDelivery(
            MailOutbox outbox,
            AuthModule authModule,
            JavaMailSender mailSender,
            @Value("${app.otp.delivery.email.from:no-reply@khatiyan.local}") String fromAddress,
            Clock clock) {
        this.outbox = outbox;
        this.authModule = authModule;
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
        this.clock = clock;
    }

    /** @return true when it was sent */
    public boolean sendOne(UUID id) {
        Optional<MailOutbox.Queued> taken = outbox.take(id);
        if (taken.isEmpty()) {
            return false;
        }
        MailOutbox.Queued mail = taken.get();
        Instant now = clock.instant();
        if (mail.dueAt().plus(STALE_AFTER).isBefore(now)) {
            outbox.closed(mail.id(), "EXPIRED", mail.attempts(), "Not sent within a day of being due");
            log.info("Mail dropped as stale id={} kind={}", mail.id(), mail.kind());
            return false;
        }
        Optional<String> address = authModule.findById(mail.userId())
                .filter(UserSummaryResponse::emailVerified)
                .map(UserSummaryResponse::email)
                .filter(email -> !email.isBlank());
        if (address.isEmpty()) {
            outbox.closed(mail.id(), "SKIPPED", mail.attempts(), "No verified email");
            return false;
        }

        int attempts = mail.attempts() + 1;
        try {
            mailSender.send(message(address.get(), mail));
            outbox.sent(mail.id(), attempts);
            log.info("Mail sent id={} kind={} userId={}", mail.id(), mail.kind(), mail.userId());
            return true;
        } catch (MailException | MessagingException | UnsupportedEncodingException failure) {
            if (attempts >= MOST_ATTEMPTS) {
                outbox.closed(mail.id(), "FAILED", attempts, failure.getMessage());
                log.error("Mail given up id={} kind={} attempts={} reason={}",
                        mail.id(), mail.kind(), attempts, failure.getMessage());
            } else {
                Duration wait = BACK_OFF.get(Math.min(attempts - 1, BACK_OFF.size() - 1));
                outbox.retryAt(mail.id(), attempts, now.plus(wait), failure.getMessage());
                log.warn("Mail send failed, retrying id={} kind={} attempts={} in={} reason={}",
                        mail.id(), mail.kind(), attempts, wait, failure.getMessage());
            }
            return false;
        }
    }

    private MimeMessage message(String to, MailOutbox.Queued mail) throws MessagingException, UnsupportedEncodingException {
        MimeMessage message = mailSender.createMimeMessage();
        // Multipart "related" with an "alternative" inside: text and HTML, and the logo the HTML shows.
        MimeMessageHelper helper = new MimeMessageHelper(message, MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED, "UTF-8");
        helper.setFrom(fromAddress, "Khatiyan");
        helper.setTo(to);
        helper.setSubject(mail.subject());
        helper.setText(mail.text(), mail.html());
        helper.addInline(MailRenderer.LOGO_CID, new ClassPathResource("mail/logo.png"), "image/png");
        return message;
    }
}
