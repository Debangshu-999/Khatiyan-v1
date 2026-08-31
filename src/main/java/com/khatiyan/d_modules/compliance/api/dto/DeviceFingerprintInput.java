package com.khatiyan.d_modules.compliance.api.dto;

import jakarta.validation.constraints.Size;

/**
 * What the app says about the device it is running on.
 *
 * <p>Every field is optional. A missing fingerprint weakens a record; a refused
 * declaration because a phone would not report its build number helps nobody.
 *
 * <p>Length-capped at the DTO rather than only at the column, so an oversized
 * value is a validation error the client can act on instead of a truncation
 * nobody notices or a constraint violation at insert.
 */
public record DeviceFingerprintInput(
        @Size(max = 64) String brand,
        @Size(max = 96) String model,
        @Size(max = 48) String osVersion,
        @Size(max = 96) String osBuild,
        @Size(max = 32) String appVersion,
        @Size(max = 64) String installId,
        @Size(max = 24) String platform) {
}
