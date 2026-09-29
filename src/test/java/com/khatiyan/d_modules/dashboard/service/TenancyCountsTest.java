package com.khatiyan.d_modules.dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.Tenancy;

/**
 * The tenancy snapshot counts only stays that actually began. A pending offer
 * the tenant never signed, one cancelled before it started, and a booking
 * still waiting for its bed all carry a start date, and counting them showed
 * "Started 4" for a month where one person moved in (found 2026-09-27).
 */
class TenancyCountsTest {

    private static final LocalDate SEP = LocalDate.of(2026, 9, 1);
    private static final LocalDate OCT = LocalDate.of(2026, 10, 1);
    private static final LocalDate AUG = LocalDate.of(2026, 8, 1);
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ROOM = UUID.randomUUID();

    private static Tenancy stay(LocalDate start) {
        return Tenancy.start(UUID.randomUUID(), PROPERTY, ROOM, UUID.randomUUID(), 8_000_00, 10_000_00, start);
    }

    private static TenancyResponse cancelledOffer(LocalDate start) {
        Tenancy offer = stay(start);
        offer.markPendingAcceptance();
        offer.cancelPending("Declined");
        return TenancyResponse.from(offer);
    }

    private static TenancyResponse pendingOffer(LocalDate start) {
        Tenancy offer = stay(start);
        offer.markPendingAcceptance();
        return TenancyResponse.from(offer);
    }

    @Test
    void onlyStaysThatBeganCountAsStarted() {
        List<TenancyResponse> stays = List.of(
                TenancyResponse.from(stay(LocalDate.of(2026, 9, 18))),
                cancelledOffer(LocalDate.of(2026, 9, 18)),
                cancelledOffer(LocalDate.of(2026, 9, 19)),
                pendingOffer(LocalDate.of(2026, 9, 25)));

        assertThat(OwnerDashboardService.startedDuring(stays, SEP, OCT)).isEqualTo(1);
    }

    @Test
    void aCancelledOfferIsNeverActiveInLaterMonths() {
        List<TenancyResponse> stays = List.of(
                TenancyResponse.from(stay(LocalDate.of(2026, 8, 20))),
                cancelledOffer(LocalDate.of(2026, 8, 28)));

        // It has no end date, so it used to count as active every month from its start on.
        assertThat(OwnerDashboardService.activeTenantsDuring(stays, AUG, SEP)).isEqualTo(1);
        assertThat(OwnerDashboardService.activeTenantsDuring(stays, SEP, OCT)).isEqualTo(1);
    }
}
