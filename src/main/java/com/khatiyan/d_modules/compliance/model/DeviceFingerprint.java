package com.khatiyan.d_modules.compliance.model;

/**
 * How a device described itself when a declaration was made.
 *
 * <p>Every field is a claim by the client and none of it is verified — the app
 * could say anything. It is still worth recording, for two reasons. A person's
 * declarations across months form a consistent picture, and a record that breaks
 * that pattern is worth a second look. And a specific claim is falsifiable in a
 * way that no claim at all is not.
 *
 * <p>Stored, never acted on. Nothing branches on these values.
 */
public record DeviceFingerprint(
        String brand,
        String model,
        String osVersion,
        String osBuild,
        String appVersion,
        /**
         * This installation of the app, generated on first launch and kept in
         * the device keystore.
         *
         * <p>Ours rather than the platform's advertising or Android ID: those
         * are resettable by the user, shared across our own app's reinstalls in
         * ways we do not control, and carry privacy expectations we would rather
         * not inherit for something this mundane.
         */
        String installId,
        String platform) {
}
