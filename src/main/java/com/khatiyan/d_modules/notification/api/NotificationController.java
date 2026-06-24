package com.khatiyan.d_modules.notification.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.notification.api.dto.NotificationDeviceTokenResponse;
import com.khatiyan.d_modules.notification.api.dto.NotificationResponse;
import com.khatiyan.d_modules.notification.api.dto.RegisterNotificationDeviceRequest;
import com.khatiyan.d_modules.notification.service.NotificationService;

import jakarta.validation.Valid;

/**
 * REST API boundary for the authenticated user's notification inbox and push
 * devices.
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    // In-app notification inbox endpoints

    @GetMapping("/me")
    public List<NotificationResponse> listMyNotifications(@AuthenticationPrincipal UserPrincipal user) {
        return notificationService.listMyNotifications(user.userId());
    }

    @GetMapping("/me/unread-count")
    public long countMyUnreadNotifications(@AuthenticationPrincipal UserPrincipal user) {
        return notificationService.countMyUnreadNotifications(user.userId());
    }

    /**
     * Recent feed for the bell — last 7 days, scoped to current tenancy for
     * USERs with an active tenancy, all-time for OWNERs, empty for USERs
     * without an active tenancy.
     */
    @GetMapping("/me/feed/recent")
    public List<NotificationResponse> listMyRecentFeed(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String account) {
        return notificationService.listMyRecentNotifications(user.userId(), account, user.role());
    }

    /**
     * Older feed for the bell — older than 7 days, still within the current
     * tenancy window for USERs. Scoped to the active account (tenant vs
     * management) so multi-role users see a separated feed.
     */
    @GetMapping("/me/feed/older")
    public List<NotificationResponse> listMyOlderFeed(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String account) {
        return notificationService.listMyOlderNotifications(user.userId(), account, user.role());
    }

    /**
     * Unread count for the bell badge — counts unread in the current scope
     * across both recent and older buckets, scoped to the active account.
     */
    @GetMapping("/me/feed/unread-count")
    public long countMyCurrentUnread(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String account) {
        return notificationService.countMyCurrentUnreadNotifications(user.userId(), account, user.role());
    }

    @PatchMapping("/{recipientId}/read")
    public NotificationResponse markRead(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID recipientId) {
        return notificationService.markRead(user.userId(), recipientId);
    }

    @PatchMapping("/me/read-all")
    public ResponseEntity<Void> markAllRead(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String account) {
        notificationService.markAllRead(user.userId(), account);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{recipientId}/archive")
    public ResponseEntity<Void> archive(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID recipientId) {
        notificationService.archive(user.userId(), recipientId);
        return ResponseEntity.noContent().build();
    }

    // Push device endpoints

    @PostMapping("/devices")
    public NotificationDeviceTokenResponse registerDevice(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody RegisterNotificationDeviceRequest request) {
        return notificationService.registerDevice(user.userId(), request);
    }

    @GetMapping("/devices")
    public List<NotificationDeviceTokenResponse> listMyDevices(@AuthenticationPrincipal UserPrincipal user) {
        return notificationService.listMyDevices(user.userId());
    }

    @DeleteMapping("/devices/{tokenId}")
    public ResponseEntity<Void> deactivateDevice(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tokenId) {
        notificationService.deactivateDevice(user.userId(), tokenId);
        return ResponseEntity.noContent().build();
    }
}
