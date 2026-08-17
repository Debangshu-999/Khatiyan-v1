package com.khatiyan.d_modules.notice.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.notice.api.dto.NoticeAttachmentRequest;
import com.khatiyan.d_modules.notice.api.dto.NoticeAttachmentResponse;
import com.khatiyan.d_modules.notice.model.Notice;
import com.khatiyan.d_modules.notice.model.NoticeAttachment;
import com.khatiyan.d_modules.notice.repository.NoticeAttachmentRepository;
import com.khatiyan.d_modules.notice.repository.NoticeRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Files attached to a notice.
 *
 * <p>Attachments belong to a notice ROW, not to a recurring template. A
 * recurring notice builds a fresh row each day, so each day carries its own
 * files and they age out with that day — which is the whole reason per-day rows
 * exist (V6069). Attaching to the template would put Monday's menu on Tuesday's
 * notice, the exact bug that model was introduced to prevent.
 */
@Slf4j
@Service
public class NoticeAttachmentService {

    private final NoticeAttachmentRepository attachmentRepository;
    private final NoticeRepository noticeRepository;
    private final NoticeAccessPolicy noticeAccessPolicy;

    public NoticeAttachmentService(
            NoticeAttachmentRepository attachmentRepository,
            NoticeRepository noticeRepository,
            NoticeAccessPolicy noticeAccessPolicy) {
        this.attachmentRepository = attachmentRepository;
        this.noticeRepository = noticeRepository;
        this.noticeAccessPolicy = noticeAccessPolicy;
    }

    @Transactional(readOnly = true)
    public List<NoticeAttachmentResponse> listAttachments(UUID actorUserId, UUID noticeId) {
        Notice notice = requireNotice(noticeId);
        noticeAccessPolicy.ensureCanViewNotices(actorUserId, notice.getPropertyId());
        return toResponses(attachmentRepository.findByNoticeIdOrderBySortOrderAsc(noticeId));
    }

    @Transactional
    public List<NoticeAttachmentResponse> addAttachments(
            UUID actorUserId, UUID noticeId, List<NoticeAttachmentRequest> requests) {
        Notice notice = requireNotice(noticeId);
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, notice.getPropertyId());
        // Permission is not the only question. Being allowed to manage notices
        // on this property says nothing about whether THIS notice is still open
        // to change — a live or archived one is not.
        notice.ensureEditableAt(Instant.now());

        List<NoticeAttachment> existing = attachmentRepository.findByNoticeIdOrderBySortOrderAsc(noticeId);
        if (existing.size() + requests.size() > NoticeAttachment.MAX_PER_NOTICE) {
            int remaining = NoticeAttachment.MAX_PER_NOTICE - existing.size();
            throw new ValidationException(
                    "A notice can have at most " + NoticeAttachment.MAX_PER_NOTICE + " attachments. "
                            + (remaining <= 0
                                    ? "This notice is already full."
                                    : "You can add " + remaining + " more."));
        }

        List<NoticeAttachment> added = build(noticeId, requests, existing.size());
        attachmentRepository.saveAll(added);
        existing.addAll(added);

        log.info("Notice attachments added noticeId={} added={} total={}", noticeId, added.size(), existing.size());
        return toResponses(existing);
    }

    @Transactional
    public List<NoticeAttachmentResponse> removeAttachment(UUID actorUserId, UUID noticeId, UUID attachmentId) {
        Notice notice = requireNotice(noticeId);
        noticeAccessPolicy.ensureCanManageNotices(actorUserId, notice.getPropertyId());
        // Removal is an edit too — arguably the one that matters most, since it
        // would take evidence off a notice tenants have already seen.
        notice.ensureEditableAt(Instant.now());

        NoticeAttachment attachment = attachmentRepository.findByIdAndNoticeId(attachmentId, noticeId)
                .orElseThrow(() -> new NotFoundException("Notice attachment", attachmentId));
        attachmentRepository.delete(attachment);

        // The stored file is left in place for the orphan sweep. Deleting it
        // inline would make removing an attachment fail whenever storage did.
        List<NoticeAttachment> remaining =
                new ArrayList<>(attachmentRepository.findByNoticeIdOrderBySortOrderAsc(noticeId));
        remaining.removeIf(candidate -> candidate.getId().equals(attachmentId));
        resequence(remaining);

        log.info("Notice attachment removed noticeId={} attachmentId={} remaining={}",
                noticeId, attachmentId, remaining.size());
        return toResponses(remaining);
    }

    /**
     * Attaches the files chosen while the notice was being written.
     *
     * <p>No access check: the caller has just created this notice, having
     * already passed the manage check to do so.
     */
    @Transactional
    public void attachOnPublish(UUID noticeId, List<NoticeAttachmentRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return;
        }
        attachmentRepository.saveAll(build(noticeId, requests, 0));
        log.info("Notice attachments saved at publish noticeId={} count={}", noticeId, requests.size());
    }

    @Transactional(readOnly = true)
    public List<NoticeAttachmentResponse> attachmentsFor(UUID noticeId) {
        return toResponses(attachmentRepository.findByNoticeIdOrderBySortOrderAsc(noticeId));
    }

    /** Attachments for many notices at once, keyed by notice. */
    @Transactional(readOnly = true)
    public Map<UUID, List<NoticeAttachmentResponse>> attachmentsFor(Collection<UUID> noticeIds) {
        if (noticeIds == null || noticeIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<NoticeAttachmentResponse>> byNotice = new LinkedHashMap<>();
        for (NoticeAttachment attachment : attachmentRepository.findAllByNoticeIds(noticeIds)) {
            byNotice.computeIfAbsent(attachment.getNoticeId(), key -> new ArrayList<>())
                    .add(NoticeAttachmentResponse.from(attachment));
        }
        return byNotice;
    }

    private List<NoticeAttachment> build(UUID noticeId, List<NoticeAttachmentRequest> requests, int startSlot) {
        List<NoticeAttachment> rows = new ArrayList<>();
        int slot = startSlot;
        for (NoticeAttachmentRequest request : requests) {
            if (slot >= NoticeAttachment.MAX_PER_NOTICE) {
                break;
            }
            rows.add(NoticeAttachment.of(
                    noticeId,
                    request.kind(),
                    request.url(),
                    request.publicId(),
                    request.fileName(),
                    request.contentType(),
                    request.sizeBytes(),
                    slot++));
        }
        return rows;
    }

    /** Renumbers slots to 0..n-1 so no gaps or duplicates survive a removal. */
    private void resequence(List<NoticeAttachment> attachments) {
        for (int index = 0; index < attachments.size(); index++) {
            attachments.get(index).moveTo(index);
        }
        attachmentRepository.saveAll(attachments);
    }

    private Notice requireNotice(UUID noticeId) {
        return noticeRepository.findById(noticeId)
                .orElseThrow(() -> new NotFoundException("Notice", noticeId));
    }

    private List<NoticeAttachmentResponse> toResponses(List<NoticeAttachment> attachments) {
        return attachments.stream().map(NoticeAttachmentResponse::from).toList();
    }
}
