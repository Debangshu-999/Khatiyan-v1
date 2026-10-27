package com.khatiyan.d_modules.mail.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Sends what is due from the queue, every twenty seconds. Each mail in its
 * own transaction, so one that fails does not hold back the rest.
 */
@Slf4j
@Service
public class MailSendJob {

    static final int BATCH = 50;

    private final MailOutbox outbox;
    private final MailDelivery delivery;
    private final RecordByRecord recordByRecord;

    public MailSendJob(MailOutbox outbox, MailDelivery delivery, RecordByRecord recordByRecord) {
        this.outbox = outbox;
        this.delivery = delivery;
        this.recordByRecord = recordByRecord;
    }

    @Scheduled(fixedDelay = 20_000, initialDelay = 30_000)
    @SchedulerLock(name = "mail-outbox", lockAtMostFor = "PT5M", lockAtLeastFor = "PT5S")
    public void sweep() {
        int sent = sendDue();
        if (sent > 0) {
            log.info("Mail sweep sent {} mails", sent);
        }
    }

    /** Sends everything due now. Safe to call as often as wanted. */
    public int sendDue() {
        return recordByRecord.run("mail-send", outbox.due(BATCH), id -> id, delivery::sendOne);
    }
}
