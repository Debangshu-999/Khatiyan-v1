package com.khatiyan.d_modules.nudge.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.nudge.api.dto.NudgeCandidateResponse;
import com.khatiyan.d_modules.nudge.api.dto.NudgeResponse;
import com.khatiyan.d_modules.nudge.api.dto.SendNudgeRequest;
import com.khatiyan.d_modules.nudge.service.NudgeService;

import jakarta.validation.Valid;

/**
 * REST boundary for nudges.
 *
 * <p>Management sends and reviews per property; a tenant only ever reads their
 * own, so the tenant endpoints take no property and no id.
 */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class NudgeController {

    private final NudgeService nudgeService;

    public NudgeController(NudgeService nudgeService) {
        this.nudgeService = nudgeService;
    }

    // Management side.

    /** Active tenants of the property, each with their cooldown state. */
    @GetMapping("/properties/{propertyId}/nudges/candidates")
    public List<NudgeCandidateResponse> listCandidates(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return nudgeService.listCandidates(user.userId(), propertyId);
    }

    /** The Sent tab — the property's nudges from the last seven days. */
    @GetMapping("/properties/{propertyId}/nudges")
    public List<NudgeResponse> listSent(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return nudgeService.listSentForProperty(user.userId(), propertyId);
    }

    @PostMapping("/nudges")
    public ResponseEntity<NudgeResponse> send(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody SendNudgeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(nudgeService.send(user.userId(), request));
    }

    // Tenant side.

    /**
     * The tenant's own nudges from the last seven days.
     *
     * <p>A GET that writes: opening the screen is what marks them read. Kept a
     * GET because the client treats it as a read, and a POST here would make
     * every refresh look like an action.
     */
    @GetMapping("/nudges/received")
    public List<NudgeResponse> listReceived(@AuthenticationPrincipal UserPrincipal user) {
        return nudgeService.listReceivedAndMarkRead(user.userId());
    }

    /** Drives the unread badge on the notifications header pill. */
    @GetMapping("/nudges/unread-count")
    public Map<String, Long> unreadCount(@AuthenticationPrincipal UserPrincipal user) {
        return Map.of("count", nudgeService.countUnread(user.userId()));
    }
}
