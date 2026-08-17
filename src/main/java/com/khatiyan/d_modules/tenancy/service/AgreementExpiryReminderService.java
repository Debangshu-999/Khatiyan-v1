package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.tenancy.event.AgreementExpiryApproachingEvent;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Reminds both sides that an agreement's term is running out.
 *
 * <p><b>The tenancy ends with the agreement.</b> A fixed term's last day is
 * agreed when the tenancy starts and is carried as its planned end, so these are
 * the run-up to a departure both sides already committed to — not a warning that
 * something might happen.
 *
 * <p>They still do not <em>cause</em> anything. Closing a tenancy needs a person:
 * damage assessment, the move-out checklist, the deposit decision. What these do
 * is make sure nobody is surprised on the day — the tenant can plan, and the
 * owner can refill the bed.
 */
@Slf4j
@Service
public class AgreementExpiryReminderService {

    private static final ZoneId REMINDER_ZONE = ZoneId.of("Asia/Kolkata");

    /**
     * How far ahead to warn, in days.
     *
     * <p>Front-loaded then tightening: a month gives time to find somewhere else,
     * the last few are the ones people actually act on. Zero is the final day
     * itself. Each is looked up as an exact date rather than a range, so a
     * tenancy gets each reminder once and no duplicates.
     */
    private static final List<Integer> REMINDER_DAYS_BEFORE = List.of(30, 14, 7, 3, 1, 0);

    private final TenancyRepository tenancyRepository;
    private final ApplicationEventPublisher eventPublisher;

    public AgreementExpiryReminderService(
            TenancyRepository tenancyRepository,
            ApplicationEventPublisher eventPublisher) {
        this.tenancyRepository = tenancyRepository;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Fires whichever agreement-expiry reminders are due today.
     *
     * <p>Runs before the exit and billing jobs so a tenant reading their morning
     * notifications sees the warning alongside, not a day out of step.
     */
    @Scheduled(
            cron = "${app.tenancy.agreement-expiry-reminder-cron:0 5 0 * * *}",
            zone = "${app.tenancy.exit-execution-zone:Asia/Kolkata}")
    @SchedulerLock(
            name = "tenancy-agreementExpiryReminders",
            lockAtMostFor = "PT10M",
            lockAtLeastFor = "PT15S")
    @Transactional(readOnly = true)
    public void sendDueAgreementExpiryReminders() {
        LocalDate today = LocalDate.now(REMINDER_ZONE);
        int sentCount = 0;

        for (int daysRemaining : REMINDER_DAYS_BEFORE) {
            // Look up the exact end date this milestone points at, rather than
            // scanning every agreement and computing the gap. A tenancy can only
            // match one milestone per run, so no reminder can double-fire.
            LocalDate agreementEndDate = today.plusDays(daysRemaining);
            List<Tenancy> due = tenancyRepository.findActiveWithAgreementEndingOn(agreementEndDate);

            for (Tenancy tenancy : due) {
                eventPublisher.publishEvent(new AgreementExpiryApproachingEvent(
                        tenancy.getId(),
                        tenancy.getUserId(),
                        tenancy.getPropertyId(),
                        agreementEndDate,
                        daysRemaining));
                sentCount = sentCount + 1;
            }

            if (!due.isEmpty()) {
                log.info(
                        "Agreement expiry reminders queued daysRemaining={} agreementEndDate={} count={}",
                        daysRemaining,
                        agreementEndDate,
                        due.size());
            }
        }

        log.info("Agreement expiry reminder sweep completed today={} reminders={}", today, sentCount);
    }
}
