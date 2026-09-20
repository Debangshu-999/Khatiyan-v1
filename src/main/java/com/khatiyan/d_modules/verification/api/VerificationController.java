package com.khatiyan.d_modules.verification.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.verification.VerificationModule;
import com.khatiyan.d_modules.verification.api.dto.OtpChallengeResponse;
import com.khatiyan.d_modules.verification.api.dto.StartOtpRequest;
import com.khatiyan.d_modules.verification.api.dto.SubmitOtpRequest;
import com.khatiyan.d_modules.verification.api.dto.VerificationGrantResponse;
import com.khatiyan.d_modules.verification.api.dto.VerificationResultResponse;
import com.khatiyan.d_modules.verification.service.VerificationService;

import jakarta.validation.Valid;

/**
 * The tenant's side of identity verification.
 *
 * <p><b>Every endpoint here acts on the signed-in tenant's own checks.</b> The
 * grant id in the path is never trusted on its own — the service refuses one
 * that belongs to somebody else, and refuses it as "not found" rather than
 * "forbidden", because confirming that a stranger's verification exists is
 * already more than a caller needs.
 *
 * <p>There is no owner-facing endpoint for starting or submitting anything, and
 * there must not be. An owner who could type a tenant's Aadhaar number would
 * make the separation this module is built on decorative.
 */
@RestController
@RequestMapping("/api/v1/verification")
public class VerificationController {

    private final VerificationModule verificationModule;
    private final VerificationService verificationService;

    public VerificationController(
            VerificationModule verificationModule, VerificationService verificationService) {
        this.verificationModule = verificationModule;
        this.verificationService = verificationService;
    }

    /** Everything this tenant has been asked to complete. */
    @GetMapping("/my")
    public ResponseEntity<List<VerificationGrantResponse>> myChecks(@AuthenticationPrincipal UserPrincipal user) {
        return ResponseEntity.ok(verificationService.grantsForTenant(user.userId()).stream()
                .map(VerificationGrantResponse::from)
                .toList());
    }

    /**
     * Asks the provider to text this tenant a code.
     *
     * <p>The Aadhaar number in the body crosses this method on its way to the
     * provider and is written nowhere.
     */
    @PostMapping("/grants/{grantId}/otp")
    public ResponseEntity<OtpChallengeResponse> startOtp(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID grantId,
            @Valid @RequestBody StartOtpRequest request) {
        return ResponseEntity.ok(OtpChallengeResponse.from(
                verificationModule.startOtp(grantId, user.userId(), request.aadhaarNumber())));
    }

    /**
     * Submits the code.
     *
     * <p>Answers 200 whether or not it passed. A wrong code is an ordinary
     * outcome, and the app needs the grant back either way to show how many
     * tries are left.
     */
    @PostMapping("/attempts/{attemptId}/otp")
    public ResponseEntity<VerificationResultResponse> submitOtp(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID attemptId,
            @Valid @RequestBody SubmitOtpRequest request) {
        return ResponseEntity.ok(VerificationResultResponse.from(
                verificationModule.submitOtp(attemptId, user.userId(), request.otp())));
    }
}
