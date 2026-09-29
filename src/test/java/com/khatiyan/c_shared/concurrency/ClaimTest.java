package com.khatiyan.c_shared.concurrency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Method;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.method.HandlerMethod;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.VersionRequiredException;

/**
 * How an action names its record (2026-09-29): If-Match is read once, the
 * first claim compares it and bumps, later claims in the same request only bump.
 */
class ClaimTest {

    /** Any versioned row. */
    static class Row extends BaseEntity {
        Row(long version) {
            ReflectionTestUtils.setField(this, "version", version);
        }
    }

    static class Endpoints {
        @RequiresVersion
        public void edit() {
        }

        public void create() {
        }
    }

    @AfterEach
    void clear() {
        ExpectedVersionHolder.clear();
    }

    @Test
    void theFirstClaimComparesAndLaterOnesOnlyBump() {
        ExpectedVersionHolder.set(ExpectedVersion.of(4));
        Row stay = new Row(4);
        Row bill = new Row(9);

        VersionGuard.claim(stay);
        assertThatCode(() -> VersionGuard.claim(bill)).doesNotThrowAnyException();

        assertThat(stay.getUpdatedAt()).isNotNull();
        assertThat(bill.getUpdatedAt()).isNotNull();
    }

    @Test
    void aClaimOnAnOlderVersionIsStale() {
        ExpectedVersionHolder.set(ExpectedVersion.of(3));

        assertThatThrownBy(() -> VersionGuard.claim(new Row(4))).isInstanceOf(StaleVersionException.class);
    }

    @Test
    void withNoVersionHeldAClaimOnlyBumps() {
        Row row = new Row(7);

        VersionGuard.claim(row);

        assertThat(row.getUpdatedAt()).isNotNull();
    }

    @Test
    void anEndpointThatNeedsAVersionRefusesARequestWithout() throws Exception {
        ExpectedVersionInterceptor interceptor = new ExpectedVersionInterceptor();
        HandlerMethod edit = handler("edit");

        assertThatThrownBy(() -> interceptor.preHandle(
                new MockHttpServletRequest(), new MockHttpServletResponse(), edit))
                .isInstanceOf(VersionRequiredException.class);
        assertThat(ExpectedVersionHolder.take().isPresent()).isFalse();
    }

    @Test
    void theHeaderIsHeldForTheRequestAndClearedAfter() throws Exception {
        ExpectedVersionInterceptor interceptor = new ExpectedVersionInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("If-Match", "\"12\"");

        interceptor.preHandle(request, new MockHttpServletResponse(), handler("edit"));
        interceptor.afterCompletion(request, new MockHttpServletResponse(), handler("edit"), null);
        assertThat(ExpectedVersionHolder.take().isPresent()).isFalse();

        interceptor.preHandle(request, new MockHttpServletResponse(), handler("create"));
        assertThat(ExpectedVersionHolder.take()).isEqualTo(ExpectedVersion.of(12));
    }

    @Test
    void anEndpointThatCreatesNeedsNoVersion() throws Exception {
        assertThat(new ExpectedVersionInterceptor().preHandle(
                new MockHttpServletRequest(), new MockHttpServletResponse(), handler("create"))).isTrue();
    }

    private static HandlerMethod handler(String name) throws NoSuchMethodException {
        Method method = Endpoints.class.getMethod(name);
        return new HandlerMethod(new Endpoints(), method);
    }
}
