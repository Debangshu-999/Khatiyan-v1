package com.khatiyan.d_modules.enquiry.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryDetailResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryReceiptResponse;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryResponse;
import com.khatiyan.d_modules.enquiry.api.dto.RaiseEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.RespondToEnquiryRequest;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;

import jakarta.validation.Valid;

/**
 * REST boundary for property enquiries.
 *
 * <p>Sign-in is required on both sides. Discovery itself is public, but an
 * enquiry is a request to be contacted and is worthless without a verified
 * person behind it.
 */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class EnquiryController {

    private final EnquiryService enquiryService;

    public EnquiryController(EnquiryService enquiryService) {
        this.enquiryService = enquiryService;
    }

    // Enquirer side.

    /** Whether the profile should offer the button, or say "Enquiry sent". */
    @GetMapping("/properties/{propertyId}/enquiries/me")
    public MyEnquiryResponse myEnquiry(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return enquiryService.myEnquiryFor(user.userId(), propertyId);
    }

    @PostMapping("/properties/{propertyId}/enquiries")
    public ResponseEntity<EnquiryReceiptResponse> raise(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody RaiseEnquiryRequest request) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(enquiryService.raise(user.userId(), propertyId, request));
    }

    // Management side.

    @GetMapping("/properties/{propertyId}/enquiries")
    public List<EnquiryDetailResponse> listForProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return enquiryService.listForProperty(user.userId(), propertyId);
    }

    /** Drives the badge on the workspace tile. */
    @GetMapping("/properties/{propertyId}/enquiries/open-count")
    public Map<String, Long> openCount(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return Map.of("count", enquiryService.countOpenForProperty(user.userId(), propertyId));
    }

    @PatchMapping("/enquiries/{enquiryId}/respond")
    public EnquiryDetailResponse respond(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID enquiryId,
            @Valid @RequestBody RespondToEnquiryRequest request) {
        return enquiryService.respond(user.userId(), enquiryId, request);
    }
}
