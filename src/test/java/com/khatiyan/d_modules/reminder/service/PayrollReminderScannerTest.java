package com.khatiyan.d_modules.reminder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.property.model.SharingType;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.reminder.model.ReminderRecord;
import com.khatiyan.d_modules.reminder.model.ReminderSourceType;
import com.khatiyan.d_modules.reminder.model.ReminderType;
import com.khatiyan.d_modules.staff.StaffModule;
import com.khatiyan.d_modules.staff.api.dto.SalaryMonthOpenItem;
import com.khatiyan.d_modules.staff.api.dto.SalaryPaymentDueItem;

/**
 * Payroll reminders at both ends of the month.
 *
 * <p>The behaviour under test is batching. Khatiyan records salary rather than
 * paying it, so these reminders exist to stop an owner forgetting to write the
 * payment down — and a per-employee notification defeats that, because eight
 * pushes at 00:40 on the 1st is how a useful reminder gets muted. One per
 * property, except a new joiner, who is news about a person and is named.
 */
@ExtendWith(MockitoExtension.class)
class PayrollReminderScannerTest {

    private static final UUID PROPERTY_ID = UUID.randomUUID();
    private static final UUID OTHER_PROPERTY_ID = UUID.randomUUID();
    private static final UUID OWNER_ID = UUID.randomUUID();
    private static final LocalDate PAYROLL_MONTH = LocalDate.of(2026, 8, 1);

    /** Inside the end-of-month window: 4 days to 31 Aug. */
    private static final LocalDate LATE_IN_MONTH = LocalDate.of(2026, 8, 27);

    /** Outside it: 21 days to go. */
    private static final LocalDate EARLY_IN_MONTH = LocalDate.of(2026, 8, 10);

    @Mock
    private StaffModule staffModule;

    @Mock
    private PropertyModule propertyModule;

    @Mock
    private ReminderService reminderService;

    private SalaryMonthOpenedReminderScannerService openedScanner;
    private SalaryReminderScannerService dueScanner;

    @BeforeEach
    void setUp() {
        openedScanner = new SalaryMonthOpenedReminderScannerService(staffModule, propertyModule, reminderService);
        dueScanner = new SalaryReminderScannerService(staffModule, propertyModule, reminderService, 4);
    }

    // ---- Month opened -----------------------------------------------------

    @Test
    void rolloversAreBatchedIntoOneReminderPerProperty() {
        givenProperty(PROPERTY_ID, "Sunrise PG");
        when(staffModule.listOpenSalaryMonths(EARLY_IN_MONTH)).thenReturn(List.of(
                openMonth(PROPERTY_ID, "Ravi", 12_000_00, false),
                openMonth(PROPERTY_ID, "Sita", 10_000_00, false),
                openMonth(PROPERTY_ID, "Arun", 8_000_00, false)));
        givenReminderIsNew();

        assertThat(openedScanner.scan(EARLY_IN_MONTH)).isEqualTo(1);

        assertThat(capturedKey()).isEqualTo("SALARY_MONTHS_OPENED:%s:2026-08".formatted(PROPERTY_ID));
        assertThat(capturedBody())
                .contains("3 salaries")
                .contains("Rs. 30000.00")
                .contains("August 2026")
                .contains("Sunrise PG");
    }

    @Test
    void eachPropertyGetsItsOwnBatch() {
        givenProperty(PROPERTY_ID, "Sunrise PG");
        givenProperty(OTHER_PROPERTY_ID, "Riverside PG");
        when(staffModule.listOpenSalaryMonths(EARLY_IN_MONTH)).thenReturn(List.of(
                openMonth(PROPERTY_ID, "Ravi", 12_000_00, false),
                openMonth(OTHER_PROPERTY_ID, "Sita", 10_000_00, false)));
        givenReminderIsNew();

        assertThat(openedScanner.scan(EARLY_IN_MONTH)).isEqualTo(2);
    }

    /**
     * A first salary month is not a rollover — it can land on any day of the
     * month and the owner needs the name, so it never joins the batch.
     */
    @Test
    void aNewJoinerIsAnnouncedByName() {
        givenProperty(PROPERTY_ID, "Sunrise PG");
        when(staffModule.listOpenSalaryMonths(EARLY_IN_MONTH)).thenReturn(List.of(
                openMonth(PROPERTY_ID, "Priya", 15_000_00, true)));
        givenReminderIsNew();

        assertThat(openedScanner.scan(EARLY_IN_MONTH)).isEqualTo(1);

        verify(reminderService).createPendingIfAbsent(
                anyString(),
                eq(ReminderType.SALARY_ACCOUNT_OPENED),
                eq(ReminderSourceType.SALARY_ACCOUNT),
                any(),
                eq(OWNER_ID),
                eq(PROPERTY_ID),
                eq(null),
                eq(EARLY_IN_MONTH),
                eq("Salary account opened"),
                anyString(),
                eq(NotificationCategory.PROPERTY),
                eq(NotificationPriority.NORMAL),
                eq(NotificationDeliveryMode.IN_APP_AND_PUSH),
                eq(NotificationAudience.MANAGEMENT));
        assertThat(capturedBody()).contains("Priya").contains("Rs. 15000.00").contains("August 2026");
    }

    @Test
    void aNewJoinerIsNotFoldedIntoTheBatch() {
        givenProperty(PROPERTY_ID, "Sunrise PG");
        when(staffModule.listOpenSalaryMonths(EARLY_IN_MONTH)).thenReturn(List.of(
                openMonth(PROPERTY_ID, "Ravi", 12_000_00, false),
                openMonth(PROPERTY_ID, "Sita", 10_000_00, false),
                openMonth(PROPERTY_ID, "Priya", 15_000_00, true)));
        givenReminderIsNew();

        // Two reminders: the pair as a batch, the joiner on her own.
        assertThat(openedScanner.scan(EARLY_IN_MONTH)).isEqualTo(2);
        assertThat(capturedBodies()).anySatisfy(body -> assertThat(body).contains("2 salaries").contains("Rs. 22000.00"));
        assertThat(capturedBodies()).anySatisfy(body -> assertThat(body).contains("Priya"));
    }

    @Test
    void nothingIsAnnouncedWhenNoMonthsAreOpen() {
        when(staffModule.listOpenSalaryMonths(EARLY_IN_MONTH)).thenReturn(List.of());

        assertThat(openedScanner.scan(EARLY_IN_MONTH)).isZero();

        verifyNoInteractions(reminderService);
    }

    // ---- Payment due ------------------------------------------------------

    /**
     * The condition is true all month; the reminder is the last call. Scanning
     * early must not even ask, or an owner is nagged from the 2nd about a salary
     * they always pay on the 30th.
     */
    @Test
    void unpaidSalariesAreNotChasedEarlyInTheMonth() {
        assertThat(dueScanner.scan(EARLY_IN_MONTH)).isZero();

        verifyNoInteractions(staffModule);
        verifyNoInteractions(reminderService);
    }

    @Test
    void unpaidSalariesAreBatchedIntoOneReminderPerProperty() {
        givenProperty(PROPERTY_ID, "Sunrise PG");
        when(staffModule.listSalaryPaymentDue(LATE_IN_MONTH)).thenReturn(List.of(
                dueItem(PROPERTY_ID, "Ravi", 12_000_00),
                dueItem(PROPERTY_ID, "Sita", 10_000_00)));
        givenReminderIsNew();

        assertThat(dueScanner.scan(LATE_IN_MONTH)).isEqualTo(1);

        assertThat(capturedKey()).isEqualTo("SALARY_PAYMENT_DUE:%s:%s:2026-08".formatted(PROPERTY_ID, OWNER_ID));
        assertThat(capturedBody())
                .contains("2 salaries")
                .contains("Rs. 22000.00")
                .contains("Sunrise PG");
    }

    /** With one unpaid salary the name is the useful part, not the count. */
    @Test
    void aLoneUnpaidSalaryIsNamed() {
        givenProperty(PROPERTY_ID, "Sunrise PG");
        when(staffModule.listSalaryPaymentDue(LATE_IN_MONTH)).thenReturn(List.of(
                dueItem(PROPERTY_ID, "Ravi", 12_000_00)));
        givenReminderIsNew();

        dueScanner.scan(LATE_IN_MONTH);

        assertThat(capturedBody()).contains("Ravi's salary of Rs. 12000.00").doesNotContain("1 salary");
    }

    @Test
    void anAlreadySentReminderIsNotCounted() {
        givenProperty(PROPERTY_ID, "Sunrise PG");
        when(staffModule.listSalaryPaymentDue(LATE_IN_MONTH)).thenReturn(List.of(
                dueItem(PROPERTY_ID, "Ravi", 12_000_00)));
        when(reminderService.createPendingIfAbsent(
                anyString(), any(), any(), any(), any(), any(), any(), any(), anyString(), anyString(),
                any(), any(), any(), any())).thenReturn(Optional.empty());

        assertThat(dueScanner.scan(LATE_IN_MONTH)).isZero();
    }

    @Test
    void nothingIsChasedWhenEverySalaryIsPaid() {
        when(staffModule.listSalaryPaymentDue(LATE_IN_MONTH)).thenReturn(List.of());

        assertThat(dueScanner.scan(LATE_IN_MONTH)).isZero();

        verify(reminderService, never()).createPendingIfAbsent(
                anyString(), any(), any(), any(), any(), any(), any(), any(), anyString(), anyString(),
                any(), any(), any(), any());
    }

    // ---- Fixtures ---------------------------------------------------------

    private void givenProperty(UUID propertyId, String name) {
        when(propertyModule.getActiveProperty(propertyId)).thenReturn(property(propertyId, name));
    }

    /** Every key is unseen, so the scanner counts one reminder per call. */
    private void givenReminderIsNew() {
        when(reminderService.createPendingIfAbsent(
                anyString(), any(), any(), any(), any(), any(), any(), any(), anyString(), anyString(),
                any(), any(), any(), any())).thenReturn(Optional.of(mock(ReminderRecord.class)));
    }

    private String capturedKey() {
        return captureStrings().get(0).getAllValues().get(0);
    }

    private String capturedBody() {
        return capturedBodies().get(0);
    }

    private List<String> capturedBodies() {
        return captureStrings().get(1).getAllValues();
    }

    /** Captors for the reminder key and the body, in that order. */
    private List<ArgumentCaptor<String>> captureStrings() {
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(reminderService, atLeastOnce()).createPendingIfAbsent(
                key.capture(), any(), any(), any(), any(), any(), any(), any(), anyString(), body.capture(),
                any(), any(), any(), any());
        return List.of(key, body);
    }

    private static SalaryMonthOpenItem openMonth(UUID propertyId, String holder, long netPaise, boolean first) {
        return new SalaryMonthOpenItem(
                propertyId, UUID.randomUUID(), "SAL-000001", holder, PAYROLL_MONTH, netPaise, first);
    }

    private static SalaryPaymentDueItem dueItem(UUID propertyId, String holder, long outstandingPaise) {
        return new SalaryPaymentDueItem(
                propertyId, UUID.randomUUID(), "SAL-000001", holder, PAYROLL_MONTH, outstandingPaise);
    }

    private static PropertyResponse property(UUID propertyId, String name) {
        return new PropertyResponse(
                propertyId,
                "PROP-2026-000001",
                OWNER_ID,
                name,
                "Address",
                "Madhapur",
                "Hyderabad",
                "Telangana",
                "500046",
                null,
                null,
                PropertyType.PG,
                PgFor.ANYONE,
                PreferredTenantType.ANYONE,
                false,
                Set.of(),
                false,
                BathroomType.COMMON,
                Set.of(SharingType.DOUBLE),
                Set.of(),
                Set.of(),
                2_000_00L,
                1_500_00L,
                100_00L,
                BillingCollectionTiming.CYCLE_START,
                3,
                10_000_00,
                NoticePeriod.ONE_MONTH,
                0,
                null,
                true,
                true);
    }
}
