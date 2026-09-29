package com.khatiyan.d_modules.verification.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Closes Aadhaar App sessions nobody answered.
 *
 * <p>A tenant who comes back to the app has theirs closed on the spot. This is
 * for the ones who never came back, so the try is not held forever.
 */
@Slf4j
@Component
public class AadhaarSessionSweepJob {

    private final VerificationService verificationService;

    public AadhaarSessionSweepJob(VerificationService verificationService) {
        this.verificationService = verificationService;
    }

    @Scheduled(fixedDelayString = "${app.verification.session-sweep-delay:PT15M}", initialDelayString = "PT2M")
    @SchedulerLock(name = "verification-sessionSweep", lockAtMostFor = "PT10M", lockAtLeastFor = "PT30S")
    public void sweep() {
        int closed = verificationService.expireStaleSessions();
        if (closed > 0) {
            log.info("Closed {} unanswered Aadhaar App sessions", closed);
        }
    }
}
