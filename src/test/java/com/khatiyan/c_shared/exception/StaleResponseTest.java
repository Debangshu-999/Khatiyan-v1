package com.khatiyan.c_shared.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import jakarta.persistence.OptimisticLockException;

/**
 * A stale screen and a lost race get the same answer (2026-09-28): 409 STALE
 * with the message the app shows.
 */
class StaleResponseTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void everyKindOfConflictIsA409Stale() {
        for (Exception conflict : List.<Exception>of(
                new StaleVersionException(),
                new ObjectOptimisticLockingFailureException("raced", null),
                new OptimisticLockException("raced"))) {
            ResponseEntity<ErrorResponse> response = handler.handleStale(conflict);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(response.getBody()).isNotNull();
            assertThat(response.getBody().code()).isEqualTo("STALE");
            assertThat(response.getBody().message())
                    .isEqualTo(StaleVersionException.MESSAGE);
        }
    }
}
