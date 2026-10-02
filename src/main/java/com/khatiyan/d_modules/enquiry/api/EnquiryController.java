package com.khatiyan.d_modules.enquiry.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.concurrency.RequiresVersion;
import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.enquiry.api.dto.AssignEnquiryHandlerRequest;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryCallToSettleResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryChannelConsentResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryCountsResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryDetailResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryHandlerSettingsRequest;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryHandlerSettingsResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryListScope;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryReceiptResponse;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryResponse;
import com.khatiyan.d_modules.enquiry.api.dto.RaiseEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.RespondToEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.SetEnquirySentimentRequest;
import com.khatiyan.d_modules.enquiry.api.dto.SettleEnquiryAttemptRequest;
import com.khatiyan.d_modules.enquiry.api.dto.UpdateEnquiryChannelConsentsRequest;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.service.EnquiryChannelConsentService;
import com.khatiyan.d_modules.enquiry.service.EnquiryHandlerService;
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
    private final EnquiryChannelConsentService consentService;
    private final EnquiryHandlerService handlerService;

    public EnquiryController(
            EnquiryService enquiryService,
            EnquiryChannelConsentService consentService,
            EnquiryHandlerService handlerService) {
        this.enquiryService = enquiryService;
        this.consentService = consentService;
        this.handlerService = handlerService;
    }

    // Enquirer side.

    /**
     * What this person has agreed to be contacted on.
     *
     * <p>Not property-scoped: the grant is a standing decision about them, so
     * the consent modal on any property profile and the account settings screen
     * read the same endpoint.
     */
    @GetMapping("/enquiries/channel-consents")
    public EnquiryChannelConsentResponse myChannelConsents(@AuthenticationPrincipal UserPrincipal user) {
        return consentService.myConsents(user.userId());
    }

    /** Replaces the live set — the consent modal's Save, and settings toggles. */
    @PutMapping("/enquiries/channel-consents")
    public EnquiryChannelConsentResponse updateChannelConsents(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody UpdateEnquiryChannelConsentsRequest request) {
        return consentService.replace(user.userId(), request);
    }

    /**
     * Withdraws one channel.
     *
     * <p>Its own route rather than a PUT with one fewer entry, so the account
     * settings master switch cannot grant anything by accident — the operation
     * that only ever takes access away is the one that cannot give it.
     */
    @DeleteMapping("/enquiries/channel-consents/{channel}")
    public EnquiryChannelConsentResponse revokeChannelConsent(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable EnquiryResponseChannel channel) {
        return consentService.revoke(user.userId(), channel);
    }

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

    /**
     * One page of the list, newest first.
     *
     * @param scope ALL for the property's enquiries, MINE for the ones the
     *              caller handles
     */
    @GetMapping("/properties/{propertyId}/enquiries/page")
    public PageResponse<EnquiryDetailResponse> pageForProperty(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @RequestParam(defaultValue = "ALL") EnquiryListScope scope,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return enquiryService.pageForProperty(user.userId(), propertyId, scope, page, size);
    }

    /** The screen's badges: waiting on an answer, the caller's share of it, and the part nobody handles. */
    @GetMapping("/properties/{propertyId}/enquiries/counts")
    public EnquiryCountsResponse counts(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return enquiryService.countsForProperty(user.userId(), propertyId);
    }

    /** The caller's calls still waiting for "Did they respond?". */
    @GetMapping("/properties/{propertyId}/enquiries/calls-to-settle")
    public List<EnquiryCallToSettleResponse> callsToSettle(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return enquiryService.callsToSettle(user.userId(), propertyId);
    }

    /**
     * Starts reaching out. A call records an attempt that stays open until it
     * is settled. Chat opens the conversation, and its first message is the
     * attempt.
     */
    @PatchMapping("/enquiries/{enquiryId}/respond")
    @RequiresVersion
    public EnquiryDetailResponse respond(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID enquiryId,
            @Valid @RequestBody RespondToEnquiryRequest request) {
        return enquiryService.respond(user.userId(), enquiryId, request);
    }

    /** The answer to "Did they respond?" about a call. */
    @PatchMapping("/enquiries/{enquiryId}/attempts/{attemptId}/settle")
    @RequiresVersion
    public EnquiryDetailResponse settleAttempt(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID enquiryId,
            @PathVariable UUID attemptId,
            @Valid @RequestBody SettleEnquiryAttemptRequest request) {
        return enquiryService.settleAttempt(user.userId(), enquiryId, attemptId, request);
    }

    /** The owner gives an enquiry to themselves or a manager, or moves it to someone else. */
    @PatchMapping("/enquiries/{enquiryId}/handler")
    @RequiresVersion
    public EnquiryDetailResponse assignHandler(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID enquiryId,
            @Valid @RequestBody AssignEnquiryHandlerRequest request) {
        return enquiryService.assign(user.userId(), enquiryId, request);
    }

    /** The handler's reading of the enquirer, once they have replied. Can be set again to change it. */
    @PutMapping("/enquiries/{enquiryId}/sentiment")
    @RequiresVersion
    public EnquiryDetailResponse setSentiment(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID enquiryId,
            @Valid @RequestBody SetEnquirySentimentRequest request) {
        return enquiryService.setSentiment(user.userId(), enquiryId, request);
    }

    /** The handler ends the conversation: the chat closes and the enquiry's window ends now. */
    @PostMapping("/enquiries/{enquiryId}/end")
    @RequiresVersion
    public EnquiryDetailResponse endConversation(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID enquiryId) {
        return enquiryService.endConversation(user.userId(), enquiryId);
    }

    // How the property chooses who handles a new enquiry.

    @GetMapping("/properties/{propertyId}/enquiry-handler-settings")
    public EnquiryHandlerSettingsResponse handlerSettings(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return handlerService.settings(user.userId(), propertyId);
    }

    /** The owner's first choice. A property that never chose is in first-to-respond. */
    @PostMapping("/properties/{propertyId}/enquiry-handler-settings")
    public ResponseEntity<EnquiryHandlerSettingsResponse> chooseHandlerSettings(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody EnquiryHandlerSettingsRequest request) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(handlerService.choose(user.userId(), propertyId, request));
    }

    @PutMapping("/properties/{propertyId}/enquiry-handler-settings")
    @RequiresVersion
    public EnquiryHandlerSettingsResponse changeHandlerSettings(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody EnquiryHandlerSettingsRequest request) {
        return handlerService.change(user.userId(), propertyId, request);
    }
}
