package com.khatiyan.d_modules.verification.provider;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The stand-in's page must be reachable from the phone that opened it.
 *
 * <p>Seen 2026-09-27: built from the configured public base URL, which defaults
 * to localhost, the link opened a broken page on the phone.
 */
class DevAadhaarAppProviderTest {

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void thePageUsesTheAddressThePhoneReachedUsBy() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setScheme("http");
        request.setServerName("192.168.1.40");
        request.setServerPort(8080);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        assertThat(DevAadhaarAppProvider.pageBase("http://localhost:8080")).isEqualTo("http://192.168.1.40:8080");
    }

    @Test
    void outsideARequestTheConfiguredAddressIsUsed() {
        assertThat(DevAadhaarAppProvider.pageBase("http://localhost:8080")).isEqualTo("http://localhost:8080");
    }
}
