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
import com.khatiyan.d_modules.notice.api.dto.CreateRecurringNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.RecurringNoticeResponse;
import com.khatiyan.d_modules.notice.api.dto.UpdateRecurringNoticeRequest;
import com.khatiyan.d_modules.notice.service.RecurringNoticeService;

import jakarta.validation.Valid;

/**
 * REST API boundary for recurring notice templates.
 *
 * <p>Owners and managers create reusable templates that generate normal
 * tenant-visible notices on schedule. Tenants never read templates directly.
 */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class RecurringNoticeController {

    private final RecurringNoticeService recurringNoticeService;

    public RecurringNoticeController(RecurringNoticeService recurringNoticeService) {
        this.recurringNoticeService = recurringNoticeService;
    }

    // Admin side recurring notice endpoints

    @PostMapping("/properties/{propertyId}/recurring-notices")
    public ResponseEntity<RecurringNoticeResponse> createRecurringNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreateRecurringNoticeRequest request) {
        RecurringNoticeResponse response = recurringNoticeService.createRecurringNotice(
                user.userId(),
                propertyId,
                request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/recurring-notices/" + response.id()))
                .body(response);
    }

    @GetMapping("/properties/{propertyId}/recurring-notices")
    public List<RecurringNoticeResponse> listActiveRecurringNotices(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return recurringNoticeService.listActiveRecurringNotices(user.userId(), propertyId);
    }

    @PatchMapping("/recurring-notices/{recurringNoticeId}")
    public RecurringNoticeResponse updateRecurringNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID recurringNoticeId,
            @Valid @RequestBody UpdateRecurringNoticeRequest request) {
        return recurringNoticeService.updateRecurringNotice(user.userId(), recurringNoticeId, request);
    }

    @DeleteMapping("/recurring-notices/{recurringNoticeId}")
    public ResponseEntity<Void> deleteRecurringNotice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID recurringNoticeId) {
        recurringNoticeService.deleteRecurringNotice(user.userId(), recurringNoticeId);
        return ResponseEntity.noContent().build();
    }
}
