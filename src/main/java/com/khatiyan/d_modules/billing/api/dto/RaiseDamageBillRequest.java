package com.khatiyan.d_modules.billing.api.dto;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * A Damage bill at checkout (2026-10-31): the records on it, and how much of
 * them the deposit takes straight away when the total outgrows it. Null or zero
 * leaves the deposit alone.
 */
public record RaiseDamageBillRequest(
        @NotEmpty(message = "Pick the damage records to bill") List<UUID> recordIds,
        @PositiveOrZero(message = "The deposit's share can't be negative") Long fromDepositPaise) {
}
