package com.khatiyan.a_auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for setting a PIN for the first time.
 *
 * <p>The OTP is submitted with the new PIN so the flow stays stateless;
 * the server does not need to remember a temporary "OTP verified"
 * session between requests.
 *
 * <p>
 * <b>The name and email ride along for the same reason.</b> Registration used to
 * write them the moment it was called, on a public endpoint that knows nothing
 * but a phone number — so anyone could rename a provisioned tenant and wipe
 * their verified recovery address without ever holding the number. They are
 * carried here instead and applied only once the code checks out. Both are
 * optional: a fresh signup already stored them at registration, and only the
 * resume path needs them again.
 */
public record SetPinRequest(
    @NotBlank @Size(max = 15) String phone,
    @NotBlank @Pattern(regexp = "\\d{6}") String otp,
    @NotBlank @Pattern(regexp = "\\d{6}") String pin,
    @Size(max = 120) String fullName,
    @Size(max = 254) String email
) {}
