package com.khatiyan.c_shared.concurrency;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * This endpoint acts on an existing record, so the screen must say which
 * version of it it was showing (2026-09-29). Without {@code If-Match} the
 * request is refused with 428 before it reaches the service.
 *
 * <p>On the controller method rather than the service, because the same
 * service code is also reached by webhooks, jobs and other modules, which have
 * no screen and no version to send.
 */
@Documented
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresVersion {
}
