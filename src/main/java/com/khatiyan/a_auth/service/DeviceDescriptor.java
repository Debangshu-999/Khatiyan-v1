package com.khatiyan.a_auth.service;

import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Reads whatever the caller told us about the device it is signing in from.
 *
 * <p>Pulled off the ambient request rather than threaded through
 * {@code AuthService}: a token is issued from seven different places — PIN,
 * OTP, e-mail link, Firebase, PIN reset — and every one of them would otherwise
 * have to carry two strings it does not care about down to the one line that
 * writes a session row.
 *
 * <p>Everything here is <b>client-supplied and untrusted</b>. It labels a row in
 * a list so a person recognises their own phone; nothing authorises off it, and
 * the values are length-capped because the column is.
 */
@Component
public class DeviceDescriptor {

    static final String LABEL_HEADER = "X-Device-Label";
    static final String PLATFORM_HEADER = "X-Device-Platform";

    private static final int MAX_LABEL_LENGTH = 120;
    private static final int MAX_PLATFORM_LENGTH = 20;

    /** A recognisable name, falling back to the user agent when none was sent. */
    public String label() {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return null;
        }
        String label = request.getHeader(LABEL_HEADER);
        return trimToLength(label != null && !label.isBlank() ? label : request.getHeader("User-Agent"),
                MAX_LABEL_LENGTH);
    }

    public String platform() {
        HttpServletRequest request = currentRequest();
        return request == null ? null : trimToLength(request.getHeader(PLATFORM_HEADER), MAX_PLATFORM_LENGTH);
    }

    /**
     * Null off the request thread — a scheduled job issuing a token is not a
     * device, and must not blow up trying to describe itself as one.
     */
    private HttpServletRequest currentRequest() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        return attributes instanceof ServletRequestAttributes servlet ? servlet.getRequest() : null;
    }

    private String trimToLength(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
