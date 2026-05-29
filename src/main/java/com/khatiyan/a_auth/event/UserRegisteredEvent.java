package com.khatiyan.a_auth.event;

import java.util.UUID;

import com.khatiyan.a_auth.model.UserRole;

/**
 * Published when auth creates a new user account.
 *
 * <p>Other modules can react to this later for welcome notifications,
 * audit trails, onboarding tasks, or analytics. OTP issuing remains
 * inside auth because it is required for the auth flow itself.
 */
public record UserRegisteredEvent(
    UUID userId,
    String phone,
    UserRole role
) {}
