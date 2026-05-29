package com.khatiyan.c_shared.exception;

import lombok.Getter;

/**
 * Base for all expected, business-rule exceptions.
 *
 * <p>Carries a stable {@code code} for clients to switch on,
 * separate from the human-readable {@code message}.
 */
@Getter
public class BusinessException extends RuntimeException {

    private final String code;

    public BusinessException(String code, String message) {
        super(message);
        this.code = code;
    }
}
