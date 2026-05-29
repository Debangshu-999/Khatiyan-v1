package com.khatiyan.a_auth.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.a_auth.model.User;

/**
 * Persistence access for auth users.
 *
 * <p>Queries should prefer active users because the auth module uses
 * soft deletion through {@code is_active}. Historical inactive users
 * may share a phone number with a newer active account.
 */
@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByPhoneAndActiveTrue(String phone);

    boolean existsByPhoneAndActiveTrue(String phone);
}
