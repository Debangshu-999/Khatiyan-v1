package com.khatiyan.d_modules.notice.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.notice.api.dto.CreateNoticeRequest;
import com.khatiyan.d_modules.notice.api.dto.CreateRecurringNoticeRequest;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.notice.model.Notice;
import com.khatiyan.d_modules.notice.model.NoticePriority;
import com.khatiyan.d_modules.notice.model.RecurringNotice;
import com.khatiyan.d_modules.notice.model.RecurringNoticeFrequency;
import com.khatiyan.d_modules.notice.repository.NoticeAttachmentRepository;
import com.khatiyan.d_modules.notice.repository.NoticeRepository;
import com.khatiyan.d_modules.notice.repository.RecurringNoticeAttachmentRepository;
import com.khatiyan.d_modules.notice.repository.RecurringNoticeRepository;
import com.khatiyan.d_modules.property.PropertyModule;

/**
 * The schedule the client sent is the schedule that gets stored.
 *
 * <p>This class existed with no test at all, and it cost a broken build: the
 * two calls into {@link RecurringNotice} were never updated when the schedule
 * fields were added, so every save threw at runtime while a 255-test suite
 * stayed green. Anything that only fails when the service is actually invoked
 * needs a test that actually invokes it.
 */
@ExtendWith(MockitoExtension.class)
class RecurringNoticeServiceTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock
    private RecurringNoticeRepository recurringNoticeRepository;

    @Mock
    private NoticeRepository noticeRepository;

    @Mock
    private PropertyModule propertyModule;

    @Mock
    private NoticeAccessPolicy noticeAccessPolicy;

    @Mock
    private RecurringNoticeAttachmentRepository templateAttachmentRepository;

    @Mock
    private NoticeAttachmentRepository noticeAttachmentRepository;

    private RecurringNoticeService service;

    /**
     * Fixed at midday so "already passed today" is unambiguous in both
     * directions. These tests previously ran on the system clock with a 23:30
     * start time chosen as "surely later than now" — which stopped being true
     * at 23:30.
     */
    private static final Clock NOON_IST =
            Clock.fixed(Instant.parse("2026-08-17T06:30:00Z"), ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        service = new RecurringNoticeService(
                recurringNoticeRepository,
                noticeRepository,
                propertyModule,
                noticeAccessPolicy,
                templateAttachmentRepository,
                noticeAttachmentRepository,
                "Asia/Kolkata",
                NOON_IST);
    }

    private CreateRecurringNoticeRequest request(
            RecurringNoticeFrequency frequency, Set<DayOfWeek> daysOfWeek, Set<Integer> daysOfMonth) {
        // Later than the fixed clock's noon, so the "already passed today"
        // guard never fires on the happy paths.
        return request(frequency, daysOfWeek, daysOfMonth, LocalTime.of(18, 0), LocalTime.of(19, 0));
    }

    private CreateRecurringNoticeRequest request(
            RecurringNoticeFrequency frequency,
            Set<DayOfWeek> daysOfWeek,
            Set<Integer> daysOfMonth,
            LocalTime startTime,
            LocalTime endTime) {
        return new CreateRecurringNoticeRequest(
                new CreateNoticeRequest("Water tanker", "Arrives in the morning.", NoticePriority.NORMAL, null, null, List.of()),
                frequency,
                daysOfWeek,
                daysOfMonth,
                startTime,
                endTime,
                LocalDate.of(2026, 8, 1),
                null);
    }

    private RecurringNotice captureSaved() {
        ArgumentCaptor<RecurringNotice> saved = ArgumentCaptor.forClass(RecurringNotice.class);
        verify(recurringNoticeRepository).save(saved.capture());
        return saved.getValue();
    }

    @Test
    void storesTheChosenWeekdaysOnAWeeklyTemplate() {
        when(recurringNoticeRepository.save(any(RecurringNotice.class))).thenAnswer(call -> call.getArgument(0));

        service.createRecurringNotice(
                ACTOR, PROPERTY, request(RecurringNoticeFrequency.WEEKLY, Set.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY), null));

        assertThat(captureSaved().getDaysOfWeek())
                .containsExactlyInAnyOrder(DayOfWeek.MONDAY, DayOfWeek.TUESDAY);
    }

    @Test
    void storesTheChosenDaysOnAMonthlyTemplate() {
        when(recurringNoticeRepository.save(any(RecurringNotice.class))).thenAnswer(call -> call.getArgument(0));

        service.createRecurringNotice(
                ACTOR, PROPERTY, request(RecurringNoticeFrequency.MONTHLY, null, Set.of(1, 15)));

        assertThat(captureSaved().getDaysOfMonth()).containsExactlyInAnyOrder(1, 15);
    }

    /**
     * The first day is materialised at creation, not left to the next tick.
     *
     * <p>The generator runs every five minutes, so a template created shortly
     * before its window opened used to miss its own first day: by the time the
     * tick came round the window had closed, and the row nobody saw was marked
     * generated anyway.
     */
    @Test
    void writesTodaysOccurrenceWhenTheTemplateIsCreated() {
        when(recurringNoticeRepository.save(any(RecurringNotice.class))).thenAnswer(call -> call.getArgument(0));

        service.createRecurringNotice(ACTOR, PROPERTY, request(RecurringNoticeFrequency.DAILY, null, null));

        ArgumentCaptor<Notice> occurrence = ArgumentCaptor.forClass(Notice.class);
        verify(noticeRepository).save(occurrence.capture());
        assertThat(occurrence.getValue().getTitle()).isEqualTo("Water tanker");
        assertThat(captureSaved().getLastGeneratedForDate()).isEqualTo(LocalDate.of(2026, 8, 17));
    }

    /**
     * A window that has already closed today is refused rather than filed.
     *
     * <p>Accepting it would write a notice for a window nobody can still see,
     * and the person would only find out by looking for it later.
     */
    @Test
    void refusesATemplateWhoseWindowHasAlreadyPassedToday() {
        assertThatThrownBy(() -> service.createRecurringNotice(
                ACTOR,
                PROPERTY,
                request(RecurringNoticeFrequency.DAILY, null, null, LocalTime.of(9, 0), LocalTime.of(10, 0))))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already passed today");

        verify(noticeRepository, never()).save(any(Notice.class));
    }

    /** A daily template carries no schedule of its own — every day is the schedule. */
    @Test
    void storesNoScheduleOnADailyTemplate() {
        when(recurringNoticeRepository.save(any(RecurringNotice.class))).thenAnswer(call -> call.getArgument(0));

        service.createRecurringNotice(ACTOR, PROPERTY, request(RecurringNoticeFrequency.DAILY, null, null));

        RecurringNotice saved = captureSaved();
        assertThat(saved.getDaysOfWeek()).isEmpty();
        assertThat(saved.getDaysOfMonth()).isEmpty();
    }
}
