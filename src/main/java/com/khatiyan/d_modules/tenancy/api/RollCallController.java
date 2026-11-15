package com.khatiyan.d_modules.tenancy.api;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.tenancy.api.dto.AddRollCallWifiRequest;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallCheckInRequest;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallNightResponse;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallSettingsResponse;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallTodayResponse;
import com.khatiyan.d_modules.tenancy.api.dto.SaveRollCallSettingsRequest;
import com.khatiyan.d_modules.tenancy.api.dto.SetRollCallMarkRequest;
import com.khatiyan.d_modules.tenancy.service.RollCallService;

/**
 * The nightly roll call (user, 2026-11-15): the tenant's check-in, and the
 * warden's night list, marks, settings and WiFi.
 */
@RestController
public class RollCallController {

    private final RollCallService service;

    public RollCallController(RollCallService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/tenancies/me/roll-call")
    public RollCallTodayResponse mine(@AuthenticationPrincipal UserPrincipal user) {
        return service.mine(user.userId());
    }

    @PostMapping("/api/v1/tenancies/me/roll-call/check-in")
    public RollCallTodayResponse checkIn(@AuthenticationPrincipal UserPrincipal user, @RequestBody RollCallCheckInRequest request) {
        return service.checkIn(user.userId(), request);
    }

    @PostMapping("/api/v1/tenancies/me/roll-call/mark-present")
    public RollCallTodayResponse markPresent(@AuthenticationPrincipal UserPrincipal user) {
        return service.markPresent(user.userId());
    }

    @GetMapping("/api/v1/properties/{propertyId}/roll-call")
    public RollCallNightResponse night(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate night) {
        return service.night(user.userId(), propertyId, night);
    }

    @PutMapping("/api/v1/properties/{propertyId}/roll-call/marks/{tenancyId}")
    public RollCallNightResponse setMark(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID tenancyId,
            @RequestBody SetRollCallMarkRequest request) {
        return service.setMark(user.userId(), propertyId, tenancyId, request);
    }

    @GetMapping("/api/v1/properties/{propertyId}/roll-call/settings")
    public RollCallSettingsResponse settings(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID propertyId) {
        return service.settingsOf(user.userId(), propertyId);
    }

    @PutMapping("/api/v1/properties/{propertyId}/roll-call/settings")
    public RollCallSettingsResponse saveSettings(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestBody SaveRollCallSettingsRequest request) {
        return service.saveSettings(user.userId(), propertyId, request);
    }

    @PostMapping("/api/v1/properties/{propertyId}/roll-call/wifi")
    public RollCallSettingsResponse addWifi(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestBody AddRollCallWifiRequest request) {
        return service.addWifi(user.userId(), propertyId, request);
    }

    @DeleteMapping("/api/v1/properties/{propertyId}/roll-call/wifi/{wifiId}")
    public RollCallSettingsResponse removeWifi(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable UUID wifiId) {
        return service.removeWifi(user.userId(), propertyId, wifiId);
    }
}
