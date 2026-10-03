package com.khatiyan.d_modules.enquiry.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.enquiry.event.EnquiryExpiredEvent;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryEndReason;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.enquiry.repository.EnquiryResponseRepository;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Ages unanswered enquiries out.
 *
 * <p>Does two things at once, and the second is easy to miss: it greys the
 * enquiry out for the owner, AND it releases the partial unique index keyed on
 * {@code status = 'NEW'}. Without the second, an enquirer whose question was
 * never answered could not ask about that property again — ever. Expiry is what
 * unblocks them.
 *
 * <p>Status is flipped rather than computed from {@code expires_at} at read
 * time precisely because of that index: a derived expiry would leave the row
 * NEW, and the database would go on refusing the next enquiry.
 *
 * <p>Since 2026-10-02 it also closes the attempts left open on any enquiry
 * whose date has passed, answered or not. A chat nobody replied to and a call
 * nobody settled both end as failed: the window they belonged to is over.
 */
@Service
public class EnquiryExpirySchedulerService {

    private static final Logger log = LoggerFactory.getLogger(EnquiryExpirySchedulerService.class);

    private final EnquiryRepository enquiryRepository;
    private final EnquiryResponseRepository enquiryResponseRepository;
    private final EnquiryService enquiryService;
    private final ApplicationEventPublisher eventPublisher;

    /** One enquiry per transaction (2026-09-28). */
    private final RecordByRecord recordByRecord;

    public EnquiryExpirySchedulerService(
            EnquiryRepository enquiryRepository,
            EnquiryResponseRepository enquiryResponseRepository,
            EnquiryService enquiryService,
            ApplicationEventPublisher eventPublisher,
            RecordByRecord recordByRecord) {
        this.enquiryRepository = enquiryRepository;
        this.enquiryResponseRepository = enquiryResponseRepository;
        this.enquiryService = enquiryService;
        this.eventPublisher = eventPublisher;
        this.recordByRecord = recordByRecord;
    }

    /**
     * Catches up whatever expired while the app was down.
     *
     * <p>Without this, a deployment over a weekend would leave enquiries sitting
     * past their date until the next scheduled tick, still holding their
     * enquirers' index slot.
     */
    @EventListener(ApplicationReadyEvent.class)
    @SchedulerLock(name = "enquiry-expiry-startupCatchUp", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void catchUpOnStartup() {
        expireStaleEnquiries();
    }

    @Scheduled(cron = "${app.enquiry.expiry-cron}", zone = "${app.enquiry.expiry-zone}")
    @SchedulerLock(name = "enquiry-expireStale", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void expireStaleEnquiries() {
        Instant now = Instant.now();
        List<UUID> stale = enquiryRepository.findOpenPastExpiry(now).stream().map(Enquiry::getId).toList();

        // One enquiry per transaction, re-read inside it (2026-09-28): an owner
        // answering one at this moment keeps it. This also fixes the startup
        // catch-up, which called this method directly and so never got the
        // @Transactional it used to carry.
        int expired = recordByRecord.run("enquiry-expire", stale, id -> id, id -> {
            Enquiry enquiry = enquiryRepository.findById(id).orElse(null);
            if (enquiry == null || enquiry.getStatus() != EnquiryStatus.NEW) {
                return false;
            }
            enquiry.expire();
            // Why: nobody tried, or the attempts never reached them.
            enquiry.recordEndReason(enquiryResponseRepository.existsByEnquiryId(id)
                    ? EnquiryEndReason.TENANT_DID_NOT_RESPOND
                    : EnquiryEndReason.HANDLER_DID_NOT_RESPOND);
            // Published inside the record's transaction, so the event is stored
            // only if the expiry is.
            eventPublisher.publishEvent(new EnquiryExpiredEvent(
                    enquiry.getId(), enquiry.getPropertyId(), enquiry.getEnquirerUserId(), now));
            return true;
        });

        // After the enquiries, so an attempt on one that just expired closes in
        // the same run. An attempt that someone settles at this moment is left
        // alone: it is read again inside its own transaction.
        List<UUID> leftOpen = enquiryResponseRepository.findOpenIdsPastEnquiryExpiry(now);
        int closed = recordByRecord.run("enquiry-attempt-expire", leftOpen, id -> id, id -> {
            EnquiryResponse attempt = enquiryResponseRepository.findById(id).orElse(null);
            if (attempt == null || !attempt.isOpen()) {
                return false;
            }
            attempt.settle(EnquiryAttemptOutcome.FAILED, null, now);
            return true;
        });

        // Every enquiry chat closes when its enquiry's date passes, answered or
        // not (owner's rule, 2026-10-03). Both sides then read "Conversation has
        // ended".
        List<UUID> chatsToClose = enquiryRepository.findIdsWithChatToClose(now);
        int chatsClosed = recordByRecord.run(
                "enquiry-chat-close", chatsToClose, id -> id, enquiryService::closeChatOfExpired);

        // Not interested and left alone for 7 days: closed (owner's design,
        // 2026-10-03). Before the window close below, so the reason is theirs.
        List<UUID> notInterested = enquiryRepository.findIdsNotInterestedSince(
                now.minus(Enquiry.NOT_INTERESTED_GRACE), now);
        int notInterestedClosed = recordByRecord.run(
                "enquiry-not-interested-close", notInterested, id -> id, enquiryService::closeNotInterestedAfterGrace);

        // Answered enquiries do not change status when their date passes, so the
        // pipeline is told here, once each (2026-10-03).
        List<UUID> answeredPast = enquiryRepository.findIdsAnsweredPastWindow(now);
        int windowsClosed = recordByRecord.run(
                "enquiry-window-close", answeredPast, id -> id, enquiryService::closeWindowOfAnswered);

        log.info("Enquiry expiry sweep aged out {} unanswered enquiries, closed {} open attempts and {} chats,"
                + " closed {} left not interested, and closed the window of {} answered ones",
                expired, closed, chatsClosed, notInterestedClosed, windowsClosed);
    }
}
