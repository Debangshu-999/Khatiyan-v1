package com.khatiyan.d_modules.enquiry.service;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.enquiry.model.Enquiry;
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

    public EnquiryExpirySchedulerService(EnquiryRepository enquiryRepository) {
        this.enquiryRepository = enquiryRepository;
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
    @Transactional
    public void expireStaleEnquiries() {
        Instant now = Instant.now();
        List<Enquiry> stale = enquiryRepository.findOpenPastExpiry(now);

        if (stale.isEmpty()) {
            log.info("Enquiry expiry sweep found nothing past its date");
            return;
        }

        stale.forEach(Enquiry::expire);
        log.info("Enquiry expiry sweep aged out {} unanswered enquiries", stale.size());
    }
}
