package com.khatiyan.d_modules.tenancy.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.tenancy.event.AgreementExpiryApproachingEvent;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

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
 *
 * <p><b>Only inside the stay's ending-soon window</b> ({@link Tenancy#endingSoonLeadDays()}:
 * 7, 15 or 30 days by term length), so a one-month stay is not warned a month
 * out, on its first day. <b>Condition-based, with catch-up:</b> each run sends
 * the milestone due NOW if {@code tenancy.agreement_expiry_reminder_log} does not
 * have it. They used to fire only on the exact day at 00:05, so a night the
 * server was down lost that milestone for good. Now a missed night is caught by
 * the next run, once, and never as a burst of the ones in between.
 */
@Slf4j
@Service
public class AgreementExpiryReminderService {

    /** Front-loaded then tightening: a month to find somewhere else, the last few are the ones people act on. */
    private static final List<Integer> MILESTONES = List.of(0, 1, 3, 7, 14, 30);
    private static final int LONGEST_LEAD_DAYS = 30;

    private final TenancyRepository tenancyRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final NamedParameterJdbcTemplate jdbc;

    public AgreementExpiryReminderService(
            TenancyRepository tenancyRepository,
            ApplicationEventPublisher eventPublisher,
            NamedParameterJdbcTemplate jdbc) {
        this.tenancyRepository = tenancyRepository;
        this.eventPublisher = eventPublisher;
        this.jdbc = jdbc;
    }

    /** Returns how many reminders were sent. Triggered by {@link AgreementExpiryReminderScheduler}. */
    @Transactional
    public int sendDue(LocalDate today) {
        int sent = 0;
        for (Tenancy tenancy : tenancyRepository.findActiveFixedTermsEndingBetween(today, today.plusDays(LONGEST_LEAD_DAYS))) {
            int daysRemaining = (int) ChronoUnit.DAYS.between(today, tenancy.getAgreementEndDate());
            Integer milestone = dueMilestone(daysRemaining, tenancy.endingSoonLeadDays());
            if (milestone == null || !record(tenancy, milestone, today)) {
                continue;
            }
            eventPublisher.publishEvent(new AgreementExpiryApproachingEvent(
                    tenancy.getId(),
                    tenancy.getUserId(),
                    tenancy.getPropertyId(),
                    tenancy.getAgreementEndDate(),
                    daysRemaining));
            sent = sent + 1;
        }
        log.info("Agreement expiry reminder sweep completed today={} reminders={}", today, sent);
        return sent;
    }

    /**
     * The milestone due with this many days left: the smallest one not below
     * them, inside the stay's window. Null outside it. Five days left in a
     * 7-day window is the 7-day reminder; two days left is the 3-day one.
     */
    static Integer dueMilestone(int daysRemaining, int leadDays) {
        if (daysRemaining < 0 || daysRemaining > leadDays) {
            return null;
        }
        for (int milestone : MILESTONES) {
            if (milestone >= daysRemaining && milestone <= leadDays) {
                return milestone;
            }
        }
        return null;
    }

    /** True when this milestone had not been sent: the insert is the claim. */
    private boolean record(Tenancy tenancy, int milestone, LocalDate today) {
        return jdbc.update("""
                INSERT INTO tenancy.agreement_expiry_reminder_log (tenancy_id, days_before, sent_on)
                VALUES (:tenancyId, :daysBefore, :today)
                ON CONFLICT (tenancy_id, days_before) DO NOTHING
                """, new MapSqlParameterSource()
                .addValue("tenancyId", tenancy.getId())
                .addValue("daysBefore", milestone)
                .addValue("today", today)) > 0;
    }
}
