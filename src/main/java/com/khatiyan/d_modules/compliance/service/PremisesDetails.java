package com.khatiyan.d_modules.compliance.service;

/**
 * The place being licensed, for the WHEREAS recital.
 *
 * <p>Address parts stay separate rather than pre-joined so the recital can mark
 * each one, the way the reference deed does — a reader checking whether the
 * document describes the right building is scanning for the locality and the PIN,
 * not reading a sentence.
 *
 * <p>{@code roomNumber} and {@code sharingLabel} are null on a property's
 * template: the room is chosen at onboarding, so those render as placeholders
 * while the building around them resolves normally.
 */
public record PremisesDetails(
        String propertyName,
        String address,
        String area,
        String city,
        String state,
        String pincode,
        String roomNumber,
        String sharingLabel) {
}
