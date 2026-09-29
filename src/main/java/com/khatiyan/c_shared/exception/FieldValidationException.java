package com.khatiyan.c_shared.exception;

import java.util.List;

/**
 * A request refused field by field, for parameters that are not a JSON body.
 *
 * <p>{@code MethodArgumentNotValidException} already carries field errors for
 * validated bodies. Query parameters parsed by hand (analytics periods) had no
 * way to say which field was wrong, so a date picker could not put the message
 * under the date that caused it.
 */
public class FieldValidationException extends BusinessException {

    private final List<ErrorResponse.FieldError> fieldErrors;

    public FieldValidationException(List<ErrorResponse.FieldError> fieldErrors) {
        super("VALIDATION_ERROR", "Request validation failed");
        this.fieldErrors = List.copyOf(fieldErrors);
    }

    public List<ErrorResponse.FieldError> getFieldErrors() {
        return fieldErrors;
    }
}
