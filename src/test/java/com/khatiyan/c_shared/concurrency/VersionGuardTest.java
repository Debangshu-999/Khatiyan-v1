package com.khatiyan.c_shared.concurrency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;

/** The stale check and the If-Match reading behind it (2026-09-28). */
class VersionGuardTest {

    @Test
    void aMatchingVersionPasses() {
        assertThatCode(() -> VersionGuard.check(5, ExpectedVersion.of(5))).doesNotThrowAnyException();
    }

    @Test
    void anOlderVersionIsStale() {
        assertThatThrownBy(() -> VersionGuard.check(6, ExpectedVersion.of(5)))
                .isInstanceOf(StaleVersionException.class)
                .hasMessage(StaleVersionException.MESSAGE);
    }

    @Test
    void noVersionSentSkipsTheCheck() {
        assertThatCode(() -> VersionGuard.check(6, ExpectedVersion.none())).doesNotThrowAnyException();
        assertThatCode(() -> VersionGuard.check(6, null)).doesNotThrowAnyException();
    }

    @Test
    void ifMatchIsReadAsABareQuotedOrWeakVersion() {
        assertThat(ExpectedVersionInterceptor.parse("5")).isEqualTo(ExpectedVersion.of(5));
        assertThat(ExpectedVersionInterceptor.parse("\"5\"")).isEqualTo(ExpectedVersion.of(5));
        assertThat(ExpectedVersionInterceptor.parse("W/\"5\"")).isEqualTo(ExpectedVersion.of(5));
        assertThat(ExpectedVersionInterceptor.parse(null)).isEqualTo(ExpectedVersion.none());
        assertThat(ExpectedVersionInterceptor.parse("  ")).isEqualTo(ExpectedVersion.none());
    }

    @Test
    void anIfMatchThatIsNotAVersionIsRefused() {
        assertThatThrownBy(() -> ExpectedVersionInterceptor.parse("abc"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("If-Match");
    }
}
