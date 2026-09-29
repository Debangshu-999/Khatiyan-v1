package com.khatiyan.d_modules.reminder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.billing.BillingModule;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.model.BillingCycleCategory;
import com.khatiyan.d_modules.billing.model.BillingCycleStatus;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

/**
 * A guest stay must never reach the reminder table.
 *
 * <p>The failure this exists to prevent took the whole application down. The
 * scanner built a TENANT reminder for a daily guest's bill, whose
 * {@code tenantUserId} is null because the stay has no account, and
 * {@code reminder_records.recipient_user_id} is NOT NULL. Since the startup
 * catch-up runs on {@code ApplicationReadyEvent}, the constraint violation
 * aborted the boot rather than merely failing a scan.
 */
@ExtendWith(MockitoExtension.class)
class BillingReminderScannerTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 30);
    private static final UUID PROPERTY_ID = UUID.randomUUID();
    private static final UUID TENANCY_ID = UUID.randomUUID();
    private static final UUID TENANT_ID = UUID.randomUUID();

    @Mock
    private BillingModule billingModule;

    @Mock
    private ReminderService reminderService;

    private BillingReminderScannerService scanner;

    @BeforeEach
    void setUp() {
        scanner = new BillingReminderScannerService(billingModule, reminderService);
    }

    @Test
    void skipsAGuestStayBillBecauseThereIsNobodyToRemind() {
        when(billingModule.findCyclesDueBetweenForReminders(TODAY, TODAY.plusDays(3)))
                .thenReturn(List.of(cycle(null, TODAY.plusDays(1))));
        when(billingModule.findOverdueCyclesForReminders()).thenReturn(List.of());

        int created = scanner.scan(TODAY);

        assertThat(created).isZero();
        verify(reminderService, never()).createPendingIfAbsent(
                anyString(), any(), any(), any(), any(), any(), any(), any(),
                anyString(), anyString(), any(), any(), any(), any());
    }

    @Test
    void stillRemindsATenantWhoHasAnAccount() {
        when(billingModule.findCyclesDueBetweenForReminders(TODAY, TODAY.plusDays(3)))
                .thenReturn(List.of(cycle(TENANT_ID, TODAY.plusDays(1))));
        when(billingModule.findOverdueCyclesForReminders()).thenReturn(List.of());
        when(reminderService.createPendingIfAbsent(
                anyString(), any(), any(), any(), eq(TENANT_ID), any(), any(), any(),
                anyString(), anyString(), any(), any(), any(), any()))
                .thenReturn(Optional.of(org.mockito.Mockito.mock(
                        com.khatiyan.d_modules.reminder.model.ReminderRecord.class)));

        int created = scanner.scan(TODAY);

        assertThat(created).isEqualTo(1);
    }

    /**
     * A one-off bill is not rent (2026-09-29): the reminder said "Your rent
     * bill ... is due today" for an extra-charge bill.
     */
    @Test
    void remindsAOneOffBillAsABillNotRent() {
        when(billingModule.findCyclesDueBetweenForReminders(TODAY, TODAY.plusDays(3)))
                .thenReturn(List.of(cycle(TENANT_ID, TODAY, BillingCycleCategory.ONE_OFF)));
        when(billingModule.findOverdueCyclesForReminders()).thenReturn(List.of());

        scanner.scan(TODAY);

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(reminderService).createPendingIfAbsent(
                anyString(), any(), any(), any(), any(), any(), any(), any(),
                title.capture(), body.capture(), any(), any(), any(), any());
        assertThat(title.getValue()).isEqualTo("Bill due today");
        assertThat(body.getValue()).isEqualTo("Your one-off bill of Rs. 1300.00 is due today.");
    }

    @Test
    void remindsAnOverdueOneOffBillAsABillNotRent() {
        when(billingModule.findCyclesDueBetweenForReminders(TODAY, TODAY.plusDays(3))).thenReturn(List.of());
        when(billingModule.findOverdueCyclesForReminders())
                .thenReturn(List.of(cycle(TENANT_ID, TODAY.minusDays(2), BillingCycleCategory.ONE_OFF)));

        scanner.scan(TODAY);

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(reminderService).createPendingIfAbsent(
                anyString(), any(), any(), any(), any(), any(), any(), any(),
                title.capture(), body.capture(), any(), any(), any(), any());
        assertThat(title.getValue()).isEqualTo("Bill overdue");
        assertThat(body.getValue()).isEqualTo("Your one-off bill of Rs. 1300.00 is overdue. Please complete the payment.");
    }

    @Test
    void stillCallsARentCycleRent() {
        when(billingModule.findCyclesDueBetweenForReminders(TODAY, TODAY.plusDays(3)))
                .thenReturn(List.of(cycle(TENANT_ID, TODAY)));
        when(billingModule.findOverdueCyclesForReminders()).thenReturn(List.of());

        scanner.scan(TODAY);

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(reminderService).createPendingIfAbsent(
                anyString(), any(), any(), any(), any(), any(), any(), any(),
                title.capture(), body.capture(), any(), any(), any(), any());
        assertThat(title.getValue()).isEqualTo("Rent due today");
        assertThat(body.getValue()).isEqualTo("Your rent bill of Rs. 1300.00 is due today.");
    }

    private static BillingCycleResponse cycle(UUID tenantUserId, LocalDate rentDueDate) {
        return cycle(tenantUserId, rentDueDate, BillingCycleCategory.RENT_CYCLE);
    }

    private static BillingCycleResponse cycle(UUID tenantUserId, LocalDate rentDueDate, BillingCycleCategory category) {
        return new BillingCycleResponse(
                UUID.randomUUID(),
                "BIL-2026-000001",
                TENANCY_ID,
                "TEN-2026-000001",
                tenantUserId,
                tenantUserId == null ? "Ravi Menon" : "Test Tenant",
                null,
                null,
                PROPERTY_ID,
                UUID.randomUUID(),
                "101",
                tenantUserId == null ? TenancyBillingType.DAILY : TenancyBillingType.MONTHLY,
                category,
                category == BillingCycleCategory.ONE_OFF ? null : 1,
                TODAY.minusDays(1),
                rentDueDate,
                rentDueDate,
                BillingCollectionTiming.CYCLE_START,
                0,
                1_300_00L,
                0L,
                0L,
                null,
                0L,
                1_300_00L,
                BillingCycleStatus.UNPAID,
                null,
                Instant.now(),
                Instant.now(),
                List.of(), null, 0L);
    }
}
