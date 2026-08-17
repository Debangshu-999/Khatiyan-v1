package com.khatiyan.d_modules.notice.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.notice.api.dto.CreateRecurringNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.RecurringNoticeResponse;
import com.khatiyan.d_modules.notice.api.dto.UpdateRecurringNoticeRequest;
import com.khatiyan.d_modules.notice.model.Notice;
import com.khatiyan.d_modules.notice.api.dto.NoticeAttachmentRequest;
import com.khatiyan.d_modules.notice.api.dto.NoticeAttachmentResponse;
import com.khatiyan.d_modules.notice.model.NoticeAttachment;
import com.khatiyan.d_modules.notice.model.RecurringNoticeAttachment;
import com.khatiyan.d_modules.notice.repository.NoticeAttachmentRepository;
import com.khatiyan.d_modules.notice.repository.RecurringNoticeAttachmentRepository;
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
    private final NoticeAccessPolicy noticeAccessPolicy;
    private final RecurringNoticeAttachmentRepository templateAttachmentRepository;
    private final NoticeAttachmentRepository noticeAttachmentRepository;
    private final ZoneId generationZone;
    private final Clock clock;

    public RecurringNoticeService(
            RecurringNoticeRepository recurringNoticeRepository,
            NoticeRepository noticeRepository,
            PropertyModule propertyModule,
            NoticeAccessPolicy noticeAccessPolicy,
            RecurringNoticeAttachmentRepository templateAttachmentRepository,
            NoticeAttachmentRepository noticeAttachmentRepository,
            @Value("${app.notice.recurring-generation-zone:Asia/Kolkata}") String generationZone,
            Clock clock) {
        this.recurringNoticeRepository = recurringNoticeRepository;
        this.noticeRepository = noticeRepository;
        this.propertyModule = propertyModule;
        this.noticeAccessPolicy = noticeAccessPolicy;
        this.templateAttachmentRepository = templateAttachmentRepository;
        this.noticeAttachmentRepository = noticeAttachmentRepository;
        this.generationZone = ZoneId.of(generationZone);
        // Injected so "has this start time already passed?" is testable. With
        // the system clock hard-coded, the only way to test that guard was to
        // pick a wall-clock time and hope the suite never ran late enough to
        // cross it — which it did, at 23:30.
        this.clock = clock.withZone(this.generationZone);
    }

    // Admin side recurring notice actions

    @Transactional
    public RecurringNoticeResponse createRecurringNotice(
            UUID actorUserId,
            UUID propertyId,
            CreateRecurringNoticeRequest request) {
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, propertyId);

        String title = request.notice().title().trim();
        String body = request.notice().body().trim();
        LocalDate activeFrom = activeFromOrToday(request.activeFrom());

        RecurringNotice recurringNotice = RecurringNotice.create(
                propertyId,
                actorUserId,
                title,
                body,
                request.notice().priority(),
                request.frequency(),
                request.daysOfWeek(),
                request.daysOfMonth(),
                request.startTime(),
                request.endTime(),
                activeFrom,
                request.activeUntil());

        ensureFirstOccurrenceIsStillAhead(recurringNotice);

        RecurringNotice savedRecurringNotice = recurringNoticeRepository.save(recurringNotice);

        // Today's occurrence is materialised here rather than left to the next
        // scheduler tick. The generator runs every five minutes, so a template
        // created a minute before its window opened used to miss its own first
        // day entirely — by the time the tick came round the window had already
        // passed, and the notice nobody saw was silently marked generated.
        generateOccurrenceIfDue(savedRecurringNotice, LocalDate.now(clock));

        log.info(
                "Recurring notice created recurringNoticeId={} propertyId={} actorUserId={}",
                savedRecurringNotice.getId(),
                propertyId,
                actorUserId);

        replaceTemplateAttachments(savedRecurringNotice.getId(), request.notice().attachments());

        return RecurringNoticeResponse.from(savedRecurringNotice, templateAttachmentsFor(savedRecurringNotice.getId()));
    }

    @Transactional(readOnly = true)
    public List<RecurringNoticeResponse> listActiveRecurringNotices(UUID actorUserId, UUID propertyId) {
        noticeAccessPolicy.ensureCanViewNotices(actorUserId, propertyId);

        return recurringNoticeRepository.findActiveByPropertyId(propertyId)
                .stream()
                .map(recurringNotice ->
                        RecurringNoticeResponse.from(recurringNotice, templateAttachmentsFor(recurringNotice.getId())))
                .toList();
    }

    @Transactional
    public RecurringNoticeResponse updateRecurringNotice(
            UUID actorUserId,
            UUID recurringNoticeId,
            UpdateRecurringNoticeRequest request) {
        RecurringNotice recurringNotice = getRecurringNotice(recurringNoticeId);
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, recurringNotice.getPropertyId());

        String title = request.notice().title().trim();
        String body = request.notice().body().trim();

        recurringNotice.updateDetails(
                title,
                body,
                request.notice().priority(),
                request.frequency(),
                request.daysOfWeek(),
                request.daysOfMonth(),
                request.startTime(),
                request.endTime(),
                activeFromOrToday(request.activeFrom()),
                request.activeUntil());

        // Push the edit onto today's occurrence too, but only while it is still
        // upcoming. Once tenants can see a notice its text stops being ours to
        // rewrite, so a live or finished occurrence is left alone and the change
        // takes effect from tomorrow's generation.
        noticeRepository
                .findUpcomingOccurrence(recurringNotice.getId(), Instant.now())
                .ifPresent(notice -> notice.updateDetails(
                        title,
                        body,
                        request.notice().priority(),
                        notice.getVisibleFrom(),
                        notice.getVisibleUntil()));

        log.info(
                "Recurring notice updated recurringNoticeId={} propertyId={} actorUserId={}",
                recurringNoticeId,
                recurringNotice.getPropertyId(),
                actorUserId);

        // Replaced wholesale rather than diffed: editing a template is a save of
        // the whole form. Days already generated keep the copies they were born
        // with — a notice people have read does not rewrite itself.
        replaceTemplateAttachments(recurringNoticeId, request.notice().attachments());

        return RecurringNoticeResponse.from(recurringNotice, templateAttachmentsFor(recurringNoticeId));
    }

    @Transactional
    public void deleteRecurringNotice(UUID actorUserId, UUID recurringNoticeId) {
        RecurringNotice recurringNotice = getRecurringNotice(recurringNoticeId);
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, recurringNotice.getPropertyId());

        recurringNotice.softDelete();

        // Pull any occurrence that is live or still to come out of tenant view.
        // Archived ones are history and stay put — deleting a template should not
        // erase the record of notices tenants already saw.
        noticeRepository
                .findActiveOccurrences(recurringNotice.getId())
                .forEach(Notice::softDelete);

        log.info(
                "Recurring notice soft-deleted recurringNoticeId={} propertyId={} actorUserId={}",
                recurringNoticeId,
                recurringNotice.getPropertyId(),
                actorUserId);
    }

    // System generation action

    @Transactional
    public int generateDueRecurringNotices() {
        LocalDate today = LocalDate.now(clock);

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
                boolean due = recurringNotice.shouldGenerateFor(today);

                // Today gets its own row, always built fresh from the template.
                // Yesterday's row keeps whatever the owner did to it and ages out
                // via the archive job; nothing carries forward.
                generateOccurrenceIfDue(recurringNotice, today);

                if (due) {
                    generatedCount++;
                }
            }
        }

        if (generatedCount > 0) {
            log.info("Recurring notices generated count={} date={}", generatedCount, today);
        }

        return generatedCount;
    }


    /**
     * Refuses a template whose very first showing would already be over.
     *
     * <p>Only when it is due today: a daily notice for 8am created at 9am has
     * nothing to show until tomorrow, and silently accepting it would file a
     * notice for a window that has already closed. Saying so lets the person
     * move the time — or the start date — while they still have the form open.
     *
     * <p>The comparison is in the generation zone, because that is the clock
     * the schedule is written against.
     */
    private void ensureFirstOccurrenceIsStillAhead(RecurringNotice recurringNotice) {
        LocalDate today = LocalDate.now(clock);

        if (!recurringNotice.shouldGenerateFor(today)) {
            return;
        }
        if (recurringNotice.getStartTime().isAfter(LocalTime.now(clock))) {
            return;
        }

        throw new ValidationException(
                "That start time has already passed today. Pick a later time, or start it from a later date.");
    }

    /**
     * Writes one day's occurrence from a template, if that day is due.
     *
     * <p>Shared by creation and the scheduler so both produce identical rows;
     * the two used to differ only in that creation produced none at all.
     */
    private void generateOccurrenceIfDue(RecurringNotice recurringNotice, LocalDate date) {
        recurringNotice.markProcessedFor(date);

        if (!recurringNotice.shouldGenerateFor(date)) {
            return;
        }

        Notice occurrence = Notice.publishOccurrence(
                recurringNotice.getId(),
                date,
                recurringNotice.getPropertyId(),
                recurringNotice.getCreatedByUserId(),
                recurringNotice.getTitle(),
                recurringNotice.getBody(),
                recurringNotice.getPriority(),
                windowStart(date, recurringNotice.getStartTime()),
                windowEnd(date, recurringNotice.getEndTime()),
                Instant.now());

        noticeRepository.save(occurrence);
        copyTemplateAttachments(recurringNotice.getId(), occurrence.getId());
        recurringNotice.markGeneratedFor(date);
    }

    /** The template's own files, for a response. */
    private List<NoticeAttachmentResponse> templateAttachmentsFor(UUID recurringNoticeId) {
        return templateAttachmentRepository.findByRecurringNoticeIdOrderBySortOrderAsc(recurringNoticeId)
                .stream()
                .map(attachment -> new NoticeAttachmentResponse(
                        attachment.getId(),
                        attachment.getKind(),
                        attachment.getUrl(),
                        attachment.getPublicId(),
                        attachment.getFileName(),
                        attachment.getContentType(),
                        attachment.getSizeBytes(),
                        attachment.getSortOrder()))
                .toList();
    }

    private void replaceTemplateAttachments(UUID recurringNoticeId, List<NoticeAttachmentRequest> requests) {
        templateAttachmentRepository.deleteByRecurringNoticeId(recurringNoticeId);
        // Forced before the inserts. Hibernate orders inserts ahead of deletes
        // when it flushes, so without this the new row at sort_order 0 collides
        // with the old one still sitting there and the save fails with a
        // duplicate key on uq_recurring_notice_attachments_sort.
        templateAttachmentRepository.flush();
        if (requests == null || requests.isEmpty()) {
            return;
        }
        List<RecurringNoticeAttachment> rows = new ArrayList<>();
        int slot = 0;
        for (NoticeAttachmentRequest request : requests) {
            if (slot >= RecurringNoticeAttachment.MAX_PER_TEMPLATE) {
                break;
            }
            rows.add(RecurringNoticeAttachment.of(
                    recurringNoticeId,
                    request.kind(),
                    request.url(),
                    request.publicId(),
                    request.fileName(),
                    request.contentType(),
                    request.sizeBytes(),
                    slot++));
        }
        templateAttachmentRepository.saveAll(rows);
    }

    /**
     * Duplicates the template's files onto one generated day.
     *
     * <p>Copies rather than references, so the owner can add today's menu to
     * today's notice, or drop a file from one day, without touching the template
     * or any other day. All days point at the same stored asset by URL, so the
     * file itself is stored once however many days exist.
     */
    private void copyTemplateAttachments(UUID recurringNoticeId, UUID noticeId) {
        List<RecurringNoticeAttachment> templateAttachments =
                templateAttachmentRepository.findByRecurringNoticeIdOrderBySortOrderAsc(recurringNoticeId);
        if (templateAttachments.isEmpty()) {
            return;
        }
        // The generator can run twice for the same day on a retry; without this
        // the copies would duplicate and collide on (notice_id, sort_order).
        if (noticeAttachmentRepository.countByNoticeId(noticeId) > 0) {
            return;
        }
        List<NoticeAttachment> copies = new ArrayList<>();
        int slot = 0;
        for (RecurringNoticeAttachment attachment : templateAttachments) {
            copies.add(NoticeAttachment.of(
                    noticeId,
                    attachment.getKind(),
                    attachment.getUrl(),
                    attachment.getPublicId(),
                    attachment.getFileName(),
                    attachment.getContentType(),
                    attachment.getSizeBytes(),
                    slot++));
        }
        noticeAttachmentRepository.saveAll(copies);
    }

    private RecurringNotice getRecurringNotice(UUID recurringNoticeId) {
        return recurringNoticeRepository.findRecurringNoticeById(recurringNoticeId)
                .orElseThrow(() -> new NotFoundException("RecurringNotice", recurringNoticeId));
    }

    private LocalDate activeFromOrToday(LocalDate activeFrom) {
        if (activeFrom == null) {
            return LocalDate.now(clock);
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
