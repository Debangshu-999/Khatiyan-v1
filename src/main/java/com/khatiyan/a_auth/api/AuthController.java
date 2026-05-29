package com.khatiyan.a_auth.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.a_auth.api.dto.OtpVerifyResponse;
import com.khatiyan.a_auth.api.dto.PinLoginRequest;
import com.khatiyan.a_auth.api.dto.RegisterOwnerRequest;
import com.khatiyan.a_auth.api.dto.RegisterUserRequest;
import com.khatiyan.a_auth.api.dto.RequestOtpRequest;
import com.khatiyan.a_auth.api.dto.ResetPinRequest;
import com.khatiyan.a_auth.api.dto.SetPinRequest;
import com.khatiyan.a_auth.api.dto.TokenResponse;
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
        authService.registerUser(request.phone(), request.fullName(), clientIp(servletRequest));
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @PostMapping("/owner/register")
    public ResponseEntity<Void> registerOwner(
            @Valid @RequestBody RegisterOwnerRequest request,
            HttpServletRequest servletRequest) {
        authService.registerOwner(request.phone(), request.fullName(), clientIp(servletRequest));
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

    @PostMapping("/pin/reset/confirm")
    public TokenResponse resetPin(@Valid @RequestBody ResetPinRequest request) {
        return authService.resetPIN(request.phone(), request.otp(), request.newPin());
    }

    @PatchMapping("/me")
    public UserSummaryResponse updateProfile(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody UpdateUserProfileRequest request) {
        return authService.updateProfile(user.userId(), request.fullName());
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

