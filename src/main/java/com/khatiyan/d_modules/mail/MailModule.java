package com.khatiyan.d_modules.mail;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.d_modules.mail.service.MailOutbox;
import com.khatiyan.d_modules.mail.service.MailRenderer;

/**
 * The one way into the mail module.
 *
 * <p>Queue a mail inside the transaction that made the change it tells of: if
 * that change rolls back, nothing is queued. The key names the telling, so a
 * second call with the same key queues nothing, however it comes about.
 */
@Component
public class MailModule {

    private final MailOutbox outbox;
    private final MailRenderer renderer;
    private final AuthModule authModule;
    private final Clock clock;

    public MailModule(MailOutbox outbox, MailRenderer renderer, AuthModule authModule, Clock clock) {
        this.outbox = outbox;
        this.renderer = renderer;
        this.authModule = authModule;
        this.clock = clock;
    }

    /** Whether this person has a verified email, so a mail would reach them. */
    public boolean canMail(UUID userId) {
        return authModule.findById(userId)
                .filter(UserSummaryResponse::emailVerified)
                .map(UserSummaryResponse::email)
                .filter(email -> !email.isBlank())
                .isPresent();
    }

    /** Queues a mail to go now. See {@link #queue(UUID, String, String, MailContent, Instant)}. */
    @Transactional
    public boolean queue(UUID userId, String kind, String dedupeKey, MailContent content) {
        return queue(userId, kind, dedupeKey, content, clock.instant());
    }

    /**
     * Queues a mail, unless the person has no verified email or the key was
     * queued before.
     *
     * @param kind      what it is, for the log: VISIT_SCHEDULED, BOOKING_CONFIRMED, ...
     * @param dedupeKey names this telling, once ever: "visit-moved:VIS-12:2026-10-05:960"
     * @param sendAfter not before this
     * @return true when it was queued
     */
    @Transactional
    public boolean queue(UUID userId, String kind, String dedupeKey, MailContent content, Instant sendAfter) {
        if (!canMail(userId)) {
            return false;
        }
        return outbox.add(userId, kind, dedupeKey, renderer.render(content), sendAfter);
    }
}
