package com.khatiyan.d_modules.notice.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

class NoticeDelayRuleTest {

    private static final Instant CURRENT = Instant.parse("2026-11-02T08:30:20Z");

    @Test
    void theSameTimeIsRefusedEvenIfOnlyTheSecondsDiffer() {
        assertThatThrownBy(() -> NoticeService.ensureLaterThanCurrent(CURRENT, CURRENT))
                .isInstanceOf(ValidationException.class).hasMessageContaining("later time");
        assertThatThrownBy(() -> NoticeService.ensureLaterThanCurrent(CURRENT, Instant.parse("2026-11-02T08:30:00Z")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("later time");
    }

    @Test
    void anEarlierTimeIsRefused() {
        assertThatThrownBy(() -> NoticeService.ensureLaterThanCurrent(CURRENT, CURRENT.minusSeconds(600)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("brought forward");
    }

    @Test
    void aLaterTimeIsAllowed() {
        assertThatCode(() -> NoticeService.ensureLaterThanCurrent(CURRENT, CURRENT.plusSeconds(60))).doesNotThrowAnyException();
    }
}
