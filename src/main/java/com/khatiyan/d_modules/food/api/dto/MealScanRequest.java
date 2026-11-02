package com.khatiyan.d_modules.food.api.dto;

/** The scanned pass, or the six digit code printed on it. */
public record MealScanRequest(String token, String code) {
}
