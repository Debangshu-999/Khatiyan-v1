package com.khatiyan.d_modules.analytics.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.analytics.service.AnalyticsService;

/** One endpoint per division screen, spec §6.6. Access is enforced in the service. */
@RestController
@RequestMapping("/api/v1/analytics/properties")
@SuppressWarnings("null")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/{propertyId}/{division}")
    public AnalyticsResponse division(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @PathVariable String division,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        PeriodPreset preset = AnalyticsRequestParser.preset(period);
        boolean custom = preset == PeriodPreset.CUSTOM;
        return analyticsService.divisionAnalytics(
                user.userId(),
                propertyId,
                AnalyticsRequestParser.division(division),
                preset,
                custom ? AnalyticsRequestParser.date("from", from) : null,
                custom ? AnalyticsRequestParser.date("to", to) : null);
    }
}
