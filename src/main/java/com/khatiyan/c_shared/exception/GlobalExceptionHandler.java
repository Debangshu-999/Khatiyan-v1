package com.khatiyan.c_shared.exception;

import java.util.LinkedHashMap;
import java.util.Map;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import com.khatiyan.a_auth.api.dto.SessionLimitResponse;
import com.khatiyan.a_auth.api.dto.UserSessionResponse;
import com.khatiyan.a_auth.service.SessionLimitReachedException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.khatiyan.d_modules.payment.provider.PaymentProviderUnavailableException;

import java.util.List;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ErrorResponse.of(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidation(ValidationException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponse.of(e.getCode(), e.getMessage()));
    }

    /**
     * 429, carrying how long to wait.
     *
     * <p>The body mirrors the shape ApiRateLimitFilter already writes, so a
     * client reads {@code retryAfterSeconds} the same way whichever limiter
     * refused it.
     */
    @ExceptionHandler(TooManyRequestsException.class)
    public ResponseEntity<Map<String, Object>> handleTooManyRequests(TooManyRequestsException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", "RATE_LIMITED");
        body.put("message", e.getMessage());
        body.put("retryAfterSeconds", e.retryAfterSeconds());

        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", String.valueOf(e.retryAfterSeconds()))
            .body(body);
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(ForbiddenException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(ErrorResponse.of(e.getCode(), e.getMessage()));
    }

    /**
     * Declared BEFORE the BusinessException handler it specialises. Spring picks
     * the most specific match regardless, but the ordering keeps the pair
     * obvious to whoever reads this next.
     */
    @ExceptionHandler(SessionLimitReachedException.class)
    public ResponseEntity<SessionLimitResponse> handleSessionLimit(SessionLimitReachedException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(SessionLimitResponse.of(
                e.getCode(),
                e.getMessage(),
                // No caller session to compare against: nobody is signed in yet,
                // so none of these can be "this device".
                e.getSessions().stream().map(session -> UserSessionResponse.from(session, null)).toList()));
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(BusinessException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponse.of(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(PaymentProviderUnavailableException.class)
    public ResponseEntity<ErrorResponse> handlePaymentProviderUnavailable(PaymentProviderUnavailableException e) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(ErrorResponse.of(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleArgValidation(MethodArgumentNotValidException e) {
        List<ErrorResponse.FieldError> errors = e.getBindingResult().getFieldErrors().stream()
            .map(fe -> new ErrorResponse.FieldError(fe.getField(), fe.getDefaultMessage()))
            .toList();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponse.withFieldErrors("VALIDATION_ERROR", "Request validation failed", errors));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraint(ConstraintViolationException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponse.of("CONSTRAINT_VIOLATION", e.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpMessageNotReadableException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponse.of("INVALID_REQUEST_BODY", "Request body is missing or malformed"));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
            .body(ErrorResponse.of("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleUnsupportedMethod(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
            .body(ErrorResponse.of("METHOD_NOT_ALLOWED", "HTTP method is not supported for this endpoint"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(DataIntegrityViolationException e) {
        // A DB constraint reaching this handler is a server-side fault, not user
        // error — never surface the constraint/SQL detail. Log it for us; return
        // a neutral message. Genuinely user-correctable cases (e.g. duplicates)
        // should be caught earlier as a ValidationException with a clear message.
        log.error("Database rejected request data", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ErrorResponse.of("INTERNAL_ERROR", "Something went wrong while processing your request. Please try again."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception e) {
        log.error("Unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ErrorResponse.of("INTERNAL_ERROR", "An unexpected error occurred"));
    }
}
