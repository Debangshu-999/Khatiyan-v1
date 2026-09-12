package com.khatiyan.d_modules.intelligence.api.dto;

/**
 * What this deployment can actually do.
 *
 * <p>Exists so a client can decide whether to offer an AI affordance at all,
 * rather than showing a control that fails on use. When the module is switched
 * off the whole controller is absent and this endpoint 404s — which the client
 * reads as "everything false". That is deliberate: one answer, whether the
 * feature is disabled, not deployed, or the build predates it.
 */
public record AiCapabilitiesResponse(boolean smartSearch) {
}
