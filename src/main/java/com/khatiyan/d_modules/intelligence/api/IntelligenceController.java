package com.khatiyan.d_modules.intelligence.api;

import java.math.BigDecimal;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchRequest;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse;
import com.khatiyan.d_modules.intelligence.api.dto.SearchSuggestionsResponse;
import com.khatiyan.d_modules.intelligence.api.dto.SmartSearchResponse;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchResultsService;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchService;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchSuggestions;

import jakarta.validation.Valid;

/**
 * The intelligence module's HTTP surface.
 *
 * <p>Authenticated, because every call spends from a shared free-tier allowance
 * and an anonymous one could drain a day's budget in a minute. The per-person
 * quota needs somebody to charge it to as well.
 *
 * <p><b>Absent entirely when the module is off.</b> The whole working stack —
 * provider client, service, this controller — is conditional on
 * {@code app.ai.enabled}, so a disabled module holds no client and opens no
 * connection pool. Nothing here needs a polite refusal for that case, because
 * nothing reaches it: a client asks
 * {@link IntelligenceCapabilitiesController} first, and that endpoint — the one
 * exception, always registered — answers "off" without this controller
 * existing. So a disabled module reads as a feature that is not there rather
 * than a button that fails.
 */
@RestController
@RequestMapping("/api/v1/ai")
@ConditionalOnProperty(prefix = "app.ai", name = "enabled", havingValue = "true")
public class IntelligenceController {

    private final SmartSearchService smartSearchService;
    private final SmartSearchResultsService resultsService;
    private final SmartSearchSuggestions suggestions;

    public IntelligenceController(
            SmartSearchService smartSearchService,
            SmartSearchResultsService resultsService,
            SmartSearchSuggestions suggestions) {
        this.smartSearchService = smartSearchService;
        this.resultsService = resultsService;
        this.suggestions = suggestions;
    }

    /**
     * Reads a sentence and answers it: filters, listings, and a line under each
     * one saying why it is there.
     *
     * <p>One call, where interpreting used to be its own round trip. The
     * reasons cannot be written before the results exist, and a landmark cannot
     * be resolved without the region, so splitting this across calls would put
     * the orchestration in the client for no gain. What the sentence did is
     * still returned as ordinary filters, so everything remains visible and
     * changeable in the controls a person would have used by hand.
     */
    @PostMapping("/discovery/search")
    public SmartSearchResponse search(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody InterpretSearchRequest request) {
        return resultsService.search(user.userId(), request);
    }

    /**
     * Example sentences for the empty AI search box.
     *
     * <p>No model call and nothing spent from anybody's allowance, so it is
     * asked for every time the box opens and answers differently each time.
     * The device point and state only choose which listings to write from and
     * are never stored.
     */
    @GetMapping("/discovery/suggestions")
    public SearchSuggestionsResponse suggestions(
            @RequestParam(required = false) String state,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude) {
        return new SearchSuggestionsResponse(suggestions.suggest(state, latitude, longitude));
    }

    /**
     * Reads a sentence and returns filters the discovery search can run.
     *
     * <p>Interpretation on its own, for a client that wants to fill its filter
     * controls and run the ordinary search itself. {@code /discovery/search}
     * does the whole job in one call and is what the app uses.
     */
    @PostMapping("/discovery/interpret")
    public InterpretSearchResponse interpretSearch(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody InterpretSearchRequest request) {
        return smartSearchService.interpret(user.userId(), request);
    }
}
