package com.khatiyan.c_shared.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;

/** A client leaving mid-reply is not a server error, and there is nobody left to answer (user, 2026-11-02). */
class ClientGoneTest {

    @Test
    void aClientLeavingIsNotHandledAsAnUnhandledException() {
        var handler = new ExceptionHandlerMethodResolver(GlobalExceptionHandler.class)
                .resolveMethodByThrowable(new AsyncRequestNotUsableException("Connection reset by peer"));

        assertThat(handler.getName()).isEqualTo("handleClientGone");
        assertThat(handler.getReturnType()).isEqualTo(void.class);
    }
}
