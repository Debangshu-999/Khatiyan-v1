package com.khatiyan.d_modules.intelligence.api.dto;

import java.util.List;

/**
 * Example sentences for the AI search box, at most three.
 *
 * <p>Each one is written from a real listing near the device, so tapping it
 * always finds something. Empty when there is nothing near enough to suggest.
 */
public record SearchSuggestionsResponse(List<String> suggestions) {
}
