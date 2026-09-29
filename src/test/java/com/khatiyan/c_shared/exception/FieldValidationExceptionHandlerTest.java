package com.khatiyan.c_shared.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class FieldValidationExceptionHandlerTest {

    @Test
    void becomesA400CarryingEveryFieldError() {
        FieldValidationException e = new FieldValidationException(List.of(
                new ErrorResponse.FieldError("from", "Pick a start date"),
                new ErrorResponse.FieldError("to", "Pick an end date")));

        ResponseEntity<ErrorResponse> response = new GlobalExceptionHandler().handleFieldValidation(e);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().code()).isEqualTo("VALIDATION_ERROR");
        assertThat(response.getBody().fieldErrors()).containsExactly(
                new ErrorResponse.FieldError("from", "Pick a start date"),
                new ErrorResponse.FieldError("to", "Pick an end date"));
    }
}
