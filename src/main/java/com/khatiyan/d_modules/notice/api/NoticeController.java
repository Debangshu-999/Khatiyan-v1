package com.khatiyan.d_modules.notice.api;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.notice.api.dto.CreateNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.DelayNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.AddNoticeAttachmentsRequest;
import com.khatiyan.d_modules.notice.api.dto.NoticeAttachmentResponse;
import com.khatiyan.d_modules.notice.api.dto.NoticeResponse;
import com.khatiyan.d_modules.notice.api.dto.UpdateNoticeRequest;
import com.khatiyan.d_modules.notice.service.NoticeAttachmentService;
import com.khatiyan.d_modules.notice.service.NoticeService;

import jakarta.validation.Valid;

/**
 * REST API boundary for time-bound property notices.
 *
 * <p>Owners and managers publish and archive notices for properties they can
 * manage. Tenants only read notices visible for their active property.
 */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class NoticeController {

    private final NoticeService noticeService;
    private final NoticeAttachmentService noticeAttachmentService;

    public NoticeController(NoticeService noticeService, NoticeAttachmentService noticeAttachmentService) {
        this.noticeService = noticeService;
        this.noticeAttachmentService = noticeAttachmentService;
    }

    // Admin side notice endpoints

    @PostMapping("/properties/{propertyId}/notices")
    public ResponseEntity<NoticeResponse> publishNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateNoticeRequest request) {
        NoticeResponse response = noticeService.publishNotice(user.userId(), propertyId, request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/notices/" + response.id()))
                .body(response);
    }

    @GetMapping("/properties/{propertyId}/notices/published")
    public List<NoticeResponse> listPublishedNotices(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return noticeService.listPublishedNotices(user.userId(), propertyId);
    }

    @GetMapping("/properties/{propertyId}/notices/visible")
    public List<NoticeResponse> listVisibleNoticesForProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return noticeService.listVisibleNoticesForProperty(user.userId(), propertyId);
    }

    @GetMapping("/properties/{propertyId}/notices/archived")
    public List<NoticeResponse> listArchivedNotices(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return noticeService.listArchivedNotices(user.userId(), propertyId);
    }

    /**
     * Attachments on an existing notice.
     *
     * <p>Every mutation returns the whole ordered list, because removing one
     * renumbers the rest — a response carrying a single row would leave the
     * client's copy wrong.
     */
    @GetMapping("/notices/{noticeId}/attachments")
    public List<NoticeAttachmentResponse> listNoticeAttachments(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID noticeId) {
        return noticeAttachmentService.listAttachments(user.userId(), noticeId);
    }

    @PostMapping("/notices/{noticeId}/attachments")
    public List<NoticeAttachmentResponse> addNoticeAttachments(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID noticeId,
            @Valid @RequestBody AddNoticeAttachmentsRequest request) {
        return noticeAttachmentService.addAttachments(user.userId(), noticeId, request.attachments());
    }

    @DeleteMapping("/notices/{noticeId}/attachments/{attachmentId}")
    public List<NoticeAttachmentResponse> removeNoticeAttachment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID noticeId,
            @PathVariable UUID attachmentId) {
        return noticeAttachmentService.removeAttachment(user.userId(), noticeId, attachmentId);
    }

    @GetMapping("/notices/{noticeId}")
    public NoticeResponse getNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID noticeId) {
        return noticeService.getNoticeDetail(user.userId(), noticeId);
    }

    @GetMapping("/properties/{propertyId}/notices/upcoming")
    public List<NoticeResponse> listUpcomingNotices(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return noticeService.listUpcomingNotices(user.userId(), propertyId);
    }

    @PatchMapping("/notices/{noticeId}")
    public NoticeResponse updateNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID noticeId,
            @Valid @RequestBody UpdateNoticeRequest request) {
        return noticeService.updateNotice(user.userId(), noticeId, request);
    }

    @PatchMapping("/notices/{noticeId}/delay")
    public NoticeResponse delayNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID noticeId,
            @Valid @RequestBody DelayNoticeRequest request) {
        return noticeService.delayNotice(user.userId(), noticeId, request.visibleFrom());
    }

    @PatchMapping("/notices/{noticeId}/archive")
    public ResponseEntity<Void> archiveNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID noticeId) {
        noticeService.archiveNotice(user.userId(), noticeId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/notices/{noticeId}")
    public ResponseEntity<Void> deleteNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID noticeId) {
        noticeService.deleteNotice(user.userId(), noticeId);
        return ResponseEntity.noContent().build();
    }

    // Tenant side notice endpoints

    @GetMapping("/notices/me/visible")
    public List<NoticeResponse> listVisibleNoticesForTenant(
            @AuthenticationPrincipal UserPrincipal user) {
        return noticeService.listVisibleNoticesForTenant(user.userId());
    }
}
