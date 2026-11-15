package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Someone sharing the tenant's room (2026-11-11): a first name and an initial,
 * and since when. Nothing else about them leaves the server.
 */
public record RoommateResponse(UUID tenancyId, String name, LocalDate since) {
}
