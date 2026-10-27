package com.khatiyan.d_modules.lead.api.dto;

/**
 * What became of a batch. The app clears every event it sent either way:
 * accepted ones are stored, repeats were already stored, and rejected ones are
 * kept on the server with the reason, so resending them would change nothing.
 */
public record AppEventBatchResponse(int accepted, int rejected) {
}
