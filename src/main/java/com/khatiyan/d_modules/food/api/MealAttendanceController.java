package com.khatiyan.d_modules.food.api;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceAnalyticsResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceDayResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceHistoryResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceLiveResponse;
import com.khatiyan.d_modules.food.api.dto.MealAttendanceMealResponse;
import com.khatiyan.d_modules.food.api.dto.MealPassResponse;
import com.khatiyan.d_modules.food.api.dto.MealScanRequest;
import com.khatiyan.d_modules.food.api.dto.MealScanResponse;
import com.khatiyan.d_modules.food.api.dto.UpdateMealAttendanceRequest;
import com.khatiyan.d_modules.food.service.MealAttendanceService;
import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.Valid;

/** The meal attendance switch, the tenant's pass, scanning it, and the reports (2026-11-01). */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class MealAttendanceController {

    private final MealAttendanceService attendance;

    public MealAttendanceController(MealAttendanceService attendance) {
        this.attendance = attendance;
    }

    @PatchMapping("/properties/{propertyId}/food/attendance/status")
    public ResponseEntity<Void> setEnabled(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdateMealAttendanceRequest request) {
        attendance.setEnabled(user.userId(), propertyId, request.enabled());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/properties/{propertyId}/food/attendance/live")
    public MealAttendanceLiveResponse live(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return attendance.live(user.userId(), propertyId);
    }

    @PostMapping("/properties/{propertyId}/food/attendance/scan")
    public MealScanResponse scan(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestBody MealScanRequest request) {
        return attendance.scan(user.userId(), propertyId, request);
    }

    @GetMapping("/properties/{propertyId}/food/attendance/day")
    public MealAttendanceDayResponse day(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam LocalDate date) {
        return attendance.day(user.userId(), propertyId, date);
    }

    @GetMapping("/properties/{propertyId}/food/attendance/meal")
    public MealAttendanceMealResponse meal(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam LocalDate date,
            @RequestParam MealType mealType) {
        return attendance.meal(user.userId(), propertyId, date, mealType);
    }

    @GetMapping("/properties/{propertyId}/food/attendance/history")
    public MealAttendanceHistoryResponse history(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "14") int size) {
        return attendance.history(user.userId(), propertyId, page, size);
    }

    @GetMapping("/properties/{propertyId}/food/attendance/analytics")
    public MealAttendanceAnalyticsResponse analytics(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return attendance.analytics(user.userId(), propertyId);
    }

    /** The tenant's pass. Their property comes from their active stay. Null when they have none. */
    @GetMapping("/food/me/meal-pass")
    public MealPassResponse myPass(@AuthenticationPrincipal UserPrincipal user) {
        return attendance.myPass(user.userId());
    }
}
