package com.khatiyan.d_modules.enquiry.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;

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
 */
@Service
public class EnquiryExpirySchedulerService {

    private static final Logger log = LoggerFactory.getLogger(EnquiryExpirySchedulerService.class);

    private final EnquiryRepository enquiryRepository;

    /** One enquiry per transaction (2026-09-28). */
    private final RecordByRecord recordByRecord;

    public EnquiryExpirySchedulerService(EnquiryRepository enquiryRepository, RecordByRecord recordByRecord) {
        this.enquiryRepository = enquiryRepository;
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

        if (stale.isEmpty()) {
            log.info("Enquiry expiry sweep found nothing past its date");
            return;
        }

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
            return true;
        });
        log.info("Enquiry expiry sweep aged out {} unanswered enquiries", expired);
    }
}
