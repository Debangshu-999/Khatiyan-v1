package com.khatiyan.d_modules.lead.service;

import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.concurrency.RecordByRecord;
import com.khatiyan.d_modules.lead.repository.LeadRepository;
import com.khatiyan.d_modules.lead.repository.LeadRepository.LeadToLevel;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * Brings every lead that is in play level, once an hour.
 *
 * <p>A lead is normally moved by the events of its enquiry and its bookings.
 * This is the net under them: an event that never arrived, a window that ran
 * out with nobody to announce it, and the leads that were already open the day
 * the pipeline learnt to follow bookings. Each lead is read as it stands and
 * made to agree, the very operation an event leads to, so a run that finds
 * nothing to do changes nothing.
 *
 * <p>Only leads that count: early, advanced and booked. A record still at
 * Enquired is closed by its enquiry's own events. A lead per transaction, so
 * one that fails does not hold the rest back.
 */
@Slf4j
@Service
public class LeadPipelineSchedulerService {

    private final LeadRepository leadRepository;
    private final LeadPipelineService pipeline;
    private final RecordByRecord recordByRecord;

    public LeadPipelineSchedulerService(
            LeadRepository leadRepository, LeadPipelineService pipeline, RecordByRecord recordByRecord) {
        this.leadRepository = leadRepository;
        this.pipeline = pipeline;
        this.recordByRecord = recordByRecord;
    }

    @Scheduled(cron = "0 20 * * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "lead-pipeline-sweep", lockAtMostFor = "PT10M", lockAtLeastFor = "PT15S")
    public void sweep() {
        int moved = levelOpenLeads();
        if (moved > 0) {
            log.info("Lead pipeline sweep moved {} leads that no event had", moved);
        }
    }

    /** @return how many leads changed stage or closed */
    public int levelOpenLeads() {
        List<LeadToLevel> leads = leadRepository.findOpenLeadsToLevel();
        return recordByRecord.run("lead-level", leads, LeadToLevel::getId,
                lead -> pipeline.syncFromEnquiry(lead.getEnquiryId(), lead.getPropertyId(), lead.getProspectUserId()));
    }
}
