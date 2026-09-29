package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import com.khatiyan.a_auth.model.Gender;

/**
 * What the owner confirmed about the tenant at a manual ID check. Both null
 * when the stay was verified another way, or declared before these were asked.
 * The deed names the tenant by these over their account's own values.
 */
public record IdCheckedParticulars(Gender gender, LocalDate dateOfBirth) {

    public static final IdCheckedParticulars NONE = new IdCheckedParticulars(null, null);
}
