package com.khatiyan.d_modules.notice.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.notice.api.dto.CreateRecurringNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.RecurringNoticeResponse;
import com.khatiyan.d_modules.notice.api.dto.UpdateRecurringNoticeRequest;
import com.khatiyan.d_modules.notice.model.Notice;
import com.khatiyan.d_modules.notice.model.RecurringNotice;
import com.khatiyan.d_modules.notice.repository.NoticeRepository;
import com.khatiyan.d_modules.notice.repository.RecurringNoticeRepository;
import com.khatiyan.d_modules.property.PropertyModule;

import lombok.extern.slf4j.Slf4j;

/**
 * Application service for recurring notice templates.
 *
 * <p>Recurring notices are reusable rules. The scheduler uses them to generate
 * normal notice rows with concrete visible windows for each day.
 */
@Slf4j
@Service
public class RecurringNoticeService {

    private final RecurringNoticeRepository recurringNoticeRepository;
    private final NoticeRepository noticeRepository;
    private final PropertyModule propertyModule;
    private final ZoneId generationZone;

    public RecurringNoticeService(
            RecurringNoticeRepository recurringNoticeRepository,
            NoticeRepository noticeRepository,
            PropertyModule propertyModule,
            @Value("${app.notice.recurring-generation-zone:Asia/Kolkata}") String generationZone) {
        this.recurringNoticeRepository = recurringNoticeRepository;
        this.noticeRepository = noticeRepository;
        this.propertyModule = propertyModule;
        this.generationZone = ZoneId.of(generationZone);
    }

    // Admin side recurring notice actions

    @Transactional
    public RecurringNoticeResponse createRecurringNotice(
            UUID actorUserId,
            UUID propertyId,
            CreateRecurringNoticeRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        String title = request.notice().title().trim();
        String body = request.notice().body().trim();
        LocalDate activeFrom = activeFromOrToday(request.activeFrom());
        Instant now = Instant.now();

        // Create the single managed notice up front; the scheduler republishes
        // its visible window each applicable day.
        Notice notice = Notice.publish(
                propertyId,
                actorUserId,
                title,
                body,
                request.notice().priority(),
                windowStart(activeFrom, request.startTime()),
                windowEnd(activeFrom, request.endTime()),
                now);
        noticeRepository.save(notice);

        RecurringNotice recurringNotice = RecurringNotice.create(
                propertyId,
                actorUserId,
                title,
                body,
                request.notice().priority(),
                request.frequency(),
                request.startTime(),
                request.endTime(),
                activeFrom,
                request.activeUntil(),
                notice.getId());

        RecurringNotice savedRecurringNotice = recurringNoticeRepository.save(recurringNotice);

        log.info(
                "Recurring notice created recurringNoticeId={} propertyId={} actorUserId={}",
                savedRecurringNotice.getId(),
                propertyId,
                actorUserId);

        return RecurringNoticeResponse.from(savedRecurringNotice);
    }

    @Transactional(readOnly = true)
    public List<RecurringNoticeResponse> listActiveRecurringNotices(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        return recurringNoticeRepository.findActiveByPropertyId(propertyId)
                .stream()
                .map(recurringNotice -> RecurringNoticeResponse.from(recurringNotice))
                .toList();
    }

    @Transactional
    public RecurringNoticeResponse updateRecurringNotice(
            UUID actorUserId,
            UUID recurringNoticeId,
            UpdateRecurringNoticeRequest request) {
        RecurringNotice recurringNotice = getRecurringNotice(recurringNoticeId);
        propertyModule.ensureCanManageProperty(actorUserId, recurringNotice.getPropertyId());

        String title = request.notice().title().trim();
        String body = request.notice().body().trim();

        recurringNotice.updateDetails(
                title,
                body,
                request.notice().priority(),
                request.frequency(),
                request.startTime(),
                request.endTime(),
                activeFromOrToday(request.activeFrom()),
                request.activeUntil());

        // Keep the managed notice's content in sync; its window stays scheduler-managed.
        if (recurringNotice.getNoticeId() != null) {
            noticeRepository.findNoticeById(recurringNotice.getNoticeId())
                    .ifPresent(notice -> notice.updateDetails(
                            title,
                            body,
                            request.notice().priority(),
                            notice.getVisibleFrom(),
                            notice.getVisibleUntil()));
        }

        log.info(
                "Recurring notice updated recurringNoticeId={} propertyId={} actorUserId={}",
                recurringNoticeId,
                recurringNotice.getPropertyId(),
                actorUserId);

        return RecurringNoticeResponse.from(recurringNotice);
    }

    @Transactional
    public void deleteRecurringNotice(UUID actorUserId, UUID recurringNoticeId) {
        RecurringNotice recurringNotice = getRecurringNotice(recurringNoticeId);
        propertyModule.ensureCanManageProperty(actorUserId, recurringNotice.getPropertyId());

        recurringNotice.softDelete();

        // Remove the managed notice from tenant view as well.
        if (recurringNotice.getNoticeId() != null) {
            noticeRepository.findNoticeById(recurringNotice.getNoticeId())
                    .ifPresent(notice -> notice.softDelete());
        }

        log.info(
                "Recurring notice soft-deleted recurringNoticeId={} propertyId={} actorUserId={}",
                recurringNoticeId,
                recurringNotice.getPropertyId(),
                actorUserId);
    }

    // System generation action

    @Transactional
    public int generateDueRecurringNotices() {
        LocalDate today = LocalDate.now(generationZone);
        Instant now = Instant.now();

        int generatedCount = 0;
        int batchSize = 100;

        while (true) {
            List<RecurringNotice> recurringNotices = recurringNoticeRepository.findDueForProcessing(
                    today,
                    PageRequest.of(0, batchSize));

            if (recurringNotices.isEmpty()) {
                break;
            }

            for (RecurringNotice recurringNotice : recurringNotices) {
                recurringNotice.markProcessedFor(today);

                if (!recurringNotice.shouldGenerateFor(today)) {
                    continue;
                }

                Instant visibleFrom = windowStart(today, recurringNotice.getStartTime());
                Instant visibleUntil = windowEnd(today, recurringNotice.getEndTime());

                Notice notice = recurringNotice.getNoticeId() == null
                        ? null
                        : noticeRepository.findNoticeById(recurringNotice.getNoticeId()).orElse(null);

                if (notice == null) {
                    // First run for a legacy rule (or its notice was removed) —
                    // create the managed notice and link it.
                    notice = Notice.publish(
                            recurringNotice.getPropertyId(),
                            recurringNotice.getCreatedByUserId(),
                            recurringNotice.getTitle(),
                            recurringNotice.getBody(),
                            recurringNotice.getPriority(),
                            visibleFrom,
                            visibleUntil,
                            now);
                    noticeRepository.save(notice);
                    recurringNotice.linkNotice(notice.getId());
                } else {
                    notice.republishForWindow(visibleFrom, visibleUntil, now);
                }

                recurringNotice.markGeneratedFor(today);
                generatedCount++;
            }
        }

        if (generatedCount > 0) {
            log.info("Recurring notices generated count={} date={}", generatedCount, today);
        }

        return generatedCount;
    }


    private RecurringNotice getRecurringNotice(UUID recurringNoticeId) {
        return recurringNoticeRepository.findRecurringNoticeById(recurringNoticeId)
                .orElseThrow(() -> new NotFoundException("RecurringNotice_", recurringNoticeId));
    }

    private LocalDate activeFromOrToday(LocalDate activeFrom) {
        if (activeFrom == null) {
            return LocalDate.now(generationZone);
        }

        return activeFrom;
    }

    private Instant windowStart(LocalDate date, java.time.LocalTime startTime) {
        return date.atTime(startTime).atZone(generationZone).toInstant();
    }

    private Instant windowEnd(LocalDate date, java.time.LocalTime endTime) {
        return date.atTime(endTime).atZone(generationZone).toInstant();
    }
}
