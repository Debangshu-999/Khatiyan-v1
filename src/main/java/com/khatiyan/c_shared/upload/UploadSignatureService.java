package com.khatiyan.c_shared.upload;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;

import lombok.extern.slf4j.Slf4j;

/**
 * Mints short-lived signatures for direct-to-Cloudinary uploads.
 *
 * <p>No SDK: Cloudinary's signature is a SHA-1 over the upload parameters, sorted
 * by key, joined as {@code k=v} pairs with {@code &}, with the API secret
 * appended. Pulling in a dependency to concatenate a string would be the more
 * fragile choice.
 *
 * <p>Every parameter that is signed must also be sent by the client, and every
 * parameter the client sends (bar the file, api_key and the signature itself)
 * must have been signed — Cloudinary rejects the upload otherwise. That is what
 * stops a client changing the folder after the fact.
 */
@Slf4j
@Service
public class UploadSignatureService {

    private final CloudinaryProperties properties;

    public UploadSignatureService(CloudinaryProperties properties) {
        this.properties = properties;
    }

    public UploadSignature sign(UUID actorUserId, UploadTarget target) {
        if (!properties.isConfigured()) {
            throw new ValidationException("File uploads are not configured on this server");
        }

        long timestamp = Instant.now().getEpochSecond();

        // Sorted, because the signature is order-sensitive and a TreeMap makes
        // that a property of the structure rather than something to remember.
        Map<String, String> signed = new TreeMap<>();
        // Signed, so the client cannot widen it. Cloudinary rejects anything
        // outside the list, which is what stops a renamed archive being uploaded
        // into the photo folders.
        signed.put("allowed_formats", target.allowedFormats());
        signed.put("folder", target.folder());
        signed.put("timestamp", Long.toString(timestamp));

        String signature = sha1(toSignableString(signed) + properties.getApiSecret());

        log.info(
                "Upload signature issued actorUserId={} target={} folder={}",
                actorUserId,
                target,
                target.folder());

        return new UploadSignature(
                properties.getCloudName(),
                properties.getApiKey(),
                target.resourceType().value(),
                target.folder(),
                timestamp,
                signature,
                properties.getSignatureTtlSeconds(),
                target.allowedFormats(),
                target.maxBytes());
    }

    private String toSignableString(Map<String, String> params) {
        return params.entrySet()
                .stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((left, right) -> left + "&" + right)
                .orElse("");
    }

    private String sha1(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException exception) {
            // SHA-1 is mandated by the JLS; unreachable on any real JVM.
            throw new IllegalStateException("SHA-1 unavailable", exception);
        }
    }

    /**
     * Everything the device needs to upload, and nothing it does not. The API
     * secret is deliberately absent.
     */
    public record UploadSignature(
            String cloudName,
            String apiKey,
            String resourceType,
            String folder,
            long timestamp,
            String signature,
            long expiresInSeconds,
            /** Must be echoed back verbatim with the upload — it is signed. */
            String allowedFormats,
            /** Client-side ceiling; Cloudinary has no per-upload size parameter. */
            long maxBytes) {
    }
}
