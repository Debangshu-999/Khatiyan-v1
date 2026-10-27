package com.khatiyan.c_shared.valkey;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Seals personal data written into Valkey, so that reading Valkey directly
 * shows none of it (user, 2026-10-27: "keep it but make sure it can't be read").
 * AES-256-GCM: a fresh 12-byte nonce per value, and tampering fails to open.
 *
 * <p><b>The key never leaves this backend's memory.</b> Without
 * {@code app.cache.field-key} it is random per start. That costs nothing: a
 * start already raises the auth generation, so nothing cached before it is
 * read again. Run more than one backend copy and they must share one key
 * (base64, 32 bytes, set from the environment), or each would read the
 * others' entries as misses.
 *
 * <p>A value that does not open is a miss, never an error: the caller reads
 * the database instead.
 */
@Component
public class CacheFieldCipher {

    static final String PREFIX = "enc:";
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    public CacheFieldCipher(@Value("${app.cache.field-key:}") String configuredKey) {
        this.key = new SecretKeySpec(keyBytes(configuredKey), "AES");
    }

    /** A cipher with a random key, for tests and for a backend with no key configured. */
    public static CacheFieldCipher random() {
        return new CacheFieldCipher("");
    }

    /** {@code enc:} and the nonce and ciphertext in base64. Null stays null. */
    public String seal(String plain) {
        if (plain == null) {
            return null;
        }
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(
                    ByteBuffer.allocate(nonce.length + sealed.length).put(nonce).put(sealed).array());
        } catch (GeneralSecurityException impossible) {
            throw new IllegalStateException("AES-GCM is unavailable", impossible);
        }
    }

    /** The plain value, or empty when it is not one of ours or will not open. */
    public Optional<String> open(String sealed) {
        if (sealed == null || !sealed.startsWith(PREFIX)) {
            return Optional.empty();
        }
        try {
            byte[] all = Base64.getUrlDecoder().decode(sealed.substring(PREFIX.length()));
            if (all.length <= NONCE_BYTES) {
                return Optional.empty();
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, all, 0, NONCE_BYTES));
            byte[] plain = cipher.doFinal(all, NONCE_BYTES, all.length - NONCE_BYTES);
            return Optional.of(new String(plain, StandardCharsets.UTF_8));
        } catch (IllegalArgumentException | GeneralSecurityException unreadable) {
            return Optional.empty();
        }
    }

    private static byte[] keyBytes(String configured) {
        if (configured != null && !configured.isBlank()) {
            byte[] decoded = Base64.getDecoder().decode(configured.strip());
            if (decoded.length != 32) {
                throw new IllegalStateException("app.cache.field-key must be 32 bytes, base64");
            }
            return decoded;
        }
        byte[] generated = new byte[32];
        new SecureRandom().nextBytes(generated);
        return generated;
    }
}
