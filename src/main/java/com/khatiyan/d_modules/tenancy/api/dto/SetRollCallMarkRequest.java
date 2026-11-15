package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;

import com.khatiyan.d_modules.tenancy.model.RollCallStatus;

/** The warden's mark for one night (user, 2026-11-15). A null status clears it. */
public record SetRollCallMarkRequest(LocalDate night, RollCallStatus status) {
}
