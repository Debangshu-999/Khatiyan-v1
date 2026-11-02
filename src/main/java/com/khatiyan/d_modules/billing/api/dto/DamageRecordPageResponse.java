package com.khatiyan.d_modules.billing.api.dto;

import com.khatiyan.c_shared.api.PageResponse;

/** Global counters accompany each page so badges never describe just the loaded rows. */
public record DamageRecordPageResponse(
        PageResponse<DamageRecordResponse> records,
        long openCount,
        long historyCount,
        long notChargedCount) {
}
