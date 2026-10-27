package com.khatiyan.c_shared.exception;

/**
 * Something the request needs is down for a while, and asking again in a few
 * minutes will work (2026-10-18). Answered with a 503.
 *
 * <p>First used for codes while Valkey is down: they are paused rather than
 * sent or checked against a store that would lose track of them when Valkey
 * comes back.
 */
public class ServiceUnavailableException extends BusinessException {

    public ServiceUnavailableException(String message) {
        super("SERVICE_UNAVAILABLE", message);
    }
}
