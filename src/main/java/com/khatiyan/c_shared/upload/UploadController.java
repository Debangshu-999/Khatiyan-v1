package com.khatiyan.c_shared.upload;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.c_shared.upload.UploadSignatureService.UploadSignature;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * Issues upload signatures.
 *
 * <p>Authenticated on purpose: an open signature endpoint is an open upload
 * endpoint into your account, which is a bandwidth bill waiting to happen. It
 * does not check WHAT the caller is attaching to — a signature only grants a
 * write into a fixed folder, and the real authorisation happens when the
 * resulting URL is saved against a concern, notice or payment.
 */
@RestController
@RequestMapping("/api/v1/uploads")
public class UploadController {

    private final UploadSignatureService uploadSignatureService;

    public UploadController(UploadSignatureService uploadSignatureService) {
        this.uploadSignatureService = uploadSignatureService;
    }

    @PostMapping("/signature")
    public UploadSignature createSignature(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody UploadSignatureRequest request) {
        return uploadSignatureService.sign(user.userId(), request.target());
    }

    public record UploadSignatureRequest(
            @NotNull(message = "Upload target is required")
            UploadTarget target) {
    }
}
