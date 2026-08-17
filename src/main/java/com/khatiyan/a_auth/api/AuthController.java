package com.khatiyan.a_auth.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.a_auth.api.dto.EmailLoginConfirmRequest;
import com.khatiyan.a_auth.api.dto.EmailOtpRequest;
import com.khatiyan.a_auth.api.dto.EmailRecoveryStatusResponse;
import com.khatiyan.a_auth.api.dto.EmailResetPinRequest;
import com.khatiyan.a_auth.api.dto.OtpVerifyResponse;
import com.khatiyan.a_auth.api.dto.ChangePinRequest;
import com.khatiyan.a_auth.api.dto.PinLoginRequest;
import com.khatiyan.a_auth.api.dto.RegisterOwnerRequest;
import com.khatiyan.a_auth.api.dto.RegisterUserRequest;
import com.khatiyan.a_auth.api.dto.RequestOtpRequest;
import com.khatiyan.a_auth.api.dto.ResetPinRequest;
import com.khatiyan.a_auth.api.dto.SetPinRequest;
import com.khatiyan.a_auth.api.dto.TokenResponse;
import com.khatiyan.a_auth.api.dto.UpdateRecoveryEmailRequest;
import com.khatiyan.a_auth.api.dto.UpdateUserProfileRequest;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.api.dto.VerifyOtpRequest;
import com.khatiyan.a_auth.firebase.FirebaseAuthService;
import com.khatiyan.a_auth.firebase.dto.FirebaseRegisterRequest;
import com.khatiyan.a_auth.firebase.dto.FirebaseSetPinRequest;
import com.khatiyan.a_auth.model.OtpPurpose;
import com.khatiyan.a_auth.service.AuthService;
import com.khatiyan.c_shared.identity.UserPrincipal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

 /**
 * REST API boundary for authentication flows.
 *
 * <p>This controller stays thin and delegates all auth decisions to
 * {@code AuthService}. Public routes live under {@code /api/v1/auth}.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final FirebaseAuthService firebaseAuthService;

    public AuthController(
            AuthService authService,
            FirebaseAuthService firebaseAuthService) {
        this.authService = authService;
        this.firebaseAuthService = firebaseAuthService;
    }

    @PostMapping("/user/register")
    public ResponseEntity<Void> registerUser(
            @Valid @RequestBody RegisterUserRequest request,
            HttpServletRequest servletRequest) {
        authService.registerUser(request.phone(), request.email(), request.fullName(), clientIp(servletRequest));
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @PostMapping("/owner/register")
    public ResponseEntity<Void> registerOwner(
            @Valid @RequestBody RegisterOwnerRequest request,
            HttpServletRequest servletRequest) {
        authService.registerOwner(request.phone(), request.email(), request.fullName(), clientIp(servletRequest));
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @PostMapping("/firebase/user/register")
    public OtpVerifyResponse registerUserWithFirebase(@Valid @RequestBody FirebaseRegisterRequest request) {
        return firebaseAuthService.registerUser(request.idToken(), request.fullName());
    }

    @PostMapping("/firebase/owner/register")
    public OtpVerifyResponse registerOwnerWithFirebase(@Valid @RequestBody FirebaseRegisterRequest request) {
        return firebaseAuthService.registerOwner(request.idToken(), request.fullName());
    }

    @PostMapping("/firebase/pin/set")
    public TokenResponse setPinWithFirebase(@Valid @RequestBody FirebaseSetPinRequest request) {
        return firebaseAuthService.setPin(request.idToken(), request.pin());
    }

    @PostMapping("/otp/request")
    public ResponseEntity<Void> requestOtp(
            @Valid @RequestBody RequestOtpRequest request,
            HttpServletRequest servletRequest) {
        if (request.resolvedPurpose() == OtpPurpose.PIN_RESET) {
            authService.requestPINResetOTP(request.phone(), request.resolvedChannel(), clientIp(servletRequest));
        } else {
            authService.requestPinSetupOTP(request.phone(), request.resolvedChannel(), clientIp(servletRequest));
        }
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/otp/verify")
    public OtpVerifyResponse verifyOtp(@Valid @RequestBody VerifyOtpRequest request) {
        return authService.verifyOTP(request.phone(), request.otp(), request.purpose());
    }

    @PostMapping("/pin/set")
    public TokenResponse setPin(@Valid @RequestBody SetPinRequest request) {
        return authService.setPIN(request.phone(), request.otp(), request.pin());
    }

    @PostMapping("/email/login/request")
    public ResponseEntity<Void> requestEmailLogin(
            @Valid @RequestBody EmailOtpRequest request,
            HttpServletRequest servletRequest) {
        authService.requestEmailLoginOTP(request.email(), clientIp(servletRequest));
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/email/login/confirm")
    public TokenResponse confirmEmailLogin(@Valid @RequestBody EmailLoginConfirmRequest request) {
        return authService.loginWithEmailOTP(request.email(), request.otp());
    }
    @PostMapping("/pin/login")
    public TokenResponse loginWithPin(
            @Valid @RequestBody PinLoginRequest request,
            HttpServletRequest servletRequest) {
        return authService.loginWithPIN(
                request.phone(),
                request.pin(),
                clientIp(servletRequest));
    }

    @PostMapping("/pin/reset/request")
    public ResponseEntity<Void> requestPinReset(
            @Valid @RequestBody RequestOtpRequest request,
            HttpServletRequest servletRequest) {
        authService.requestPINResetOTP(request.phone(), request.resolvedChannel(), clientIp(servletRequest));
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/pin/reset/email/request")
    public ResponseEntity<Void> requestEmailPinReset(
            @Valid @RequestBody EmailOtpRequest request,
            HttpServletRequest servletRequest) {
        authService.requestPINResetOTPByEmail(request.email(), clientIp(servletRequest));
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/pin/reset/email/verify")
    public OtpVerifyResponse verifyEmailPinReset(@Valid @RequestBody EmailLoginConfirmRequest request) {
        return authService.verifyOTPByEmail(request.email(), request.otp(), OtpPurpose.PIN_RESET);
    }

    @PostMapping("/pin/reset/email/confirm")
    public TokenResponse resetEmailPin(@Valid @RequestBody EmailResetPinRequest request) {
        return authService.resetPINByEmail(request.email(), request.otp(), request.newPin());
    }
    @PostMapping("/pin/reset/confirm")
    public TokenResponse resetPin(@Valid @RequestBody ResetPinRequest request) {
        return authService.resetPIN(request.phone(), request.otp(), request.newPin());
    }

    @PostMapping("/pin/change")
    public TokenResponse changePin(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody ChangePinRequest request) {
        return authService.changePIN(user.userId(), request.currentPin(), request.otp(), request.newPin());
    }

    @GetMapping("/me/email")
    public EmailRecoveryStatusResponse emailRecoveryStatus(@AuthenticationPrincipal UserPrincipal user) {
        return authService.emailRecoveryStatus(user.userId());
    }

    @PatchMapping("/me/email")
    public EmailRecoveryStatusResponse updateRecoveryEmail(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody UpdateRecoveryEmailRequest request) {
        return authService.updateRecoveryEmail(user.userId(), request.email());
    }
    @PostMapping("/me/email/verification/request")
    public ResponseEntity<Void> requestEmailVerification(@AuthenticationPrincipal UserPrincipal user) {
        authService.requestEmailVerification(user.userId());
        return ResponseEntity.accepted().build();
    }

    @GetMapping(value = "/email/verify", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> verifyEmail(@RequestParam(required = false) String token) {
        boolean verified = authService.verifyEmail(token);
        String title = verified ? "Email verified" : "Verification link invalid";
        String body = verified
                ? "Your email is verified. You can now close this page and use email login or PIN reset."
                : "This verification link is invalid or has expired. Return to Khatiyan and request a new one.";
        String html = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"
                + title + "</title></head><body style=\"font-family:Arial,sans-serif;max-width:560px;margin:64px auto;padding:24px;color:#1e1b18\"><h1>"
                + title + "</h1><p style=\"font-size:18px;line-height:1.55\">" + body + "</p></body></html>";
        return ResponseEntity.status(verified ? HttpStatus.OK : HttpStatus.BAD_REQUEST)
                .contentType(MediaType.TEXT_HTML)
                .body(html);
    }
    @PatchMapping("/me")
    public UserSummaryResponse updateProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody UpdateUserProfileRequest request) {
        return authService.updateProfile(
                user.userId(), request.fullName(), request.profilePhotoUrl(), request.profilePhotoPublicId());
    }

    @GetMapping("/me")
    public UserSummaryResponse getProfile(@AuthenticationPrincipal UserPrincipal user) {
        return authService.getProfile(user.userId());
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }

        return request.getRemoteAddr();
    }
}

