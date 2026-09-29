package com.khatiyan.d_modules.verification.api;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.d_modules.verification.service.VerificationService;

import tools.jackson.databind.JsonNode;

/**
 * Where the verification provider posts an Aadhaar App result.
 *
 * <p>Carries no sign-in, because the provider has none. The one-time token in
 * the path is what ties a result to an attempt: it was made for that attempt,
 * only its hash is stored, and a result for a closed attempt is ignored.
 * Nothing in the answer says whose check it was.
 */
@RestController
@RequestMapping("/api/v1/verification/callbacks")
public class VerificationCallbackController {

    private final VerificationService verificationService;

    public VerificationCallbackController(VerificationService verificationService) {
        this.verificationService = verificationService;
    }

    @PostMapping("/{token}")
    public ResponseEntity<Map<String, Boolean>> receive(@PathVariable String token, @RequestBody JsonNode body) {
        return verificationService.handleCallback(token, body)
                ? ResponseEntity.ok(Map.of("received", true))
                : ResponseEntity.notFound().build();
    }
}
