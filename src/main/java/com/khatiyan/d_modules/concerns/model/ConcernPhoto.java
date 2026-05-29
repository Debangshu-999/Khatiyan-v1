package com.khatiyan.d_modules.concerns.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Image reference attached to a concern.
 *
 * <p>
 * The frontend uploads images to Cloudinary and sends the resulting URL and
 * public id. The backend stores references only, not image bytes.
 */
@Entity
@Table(name = "concern_photos", schema = "concern")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ConcernPhoto {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "concern_id", nullable = false)
    private Concern concern;

    @Column(name = "photo_url", nullable = false, length = 500)
    private String photoUrl;

    @Column(name = "photo_public_id", length = 200)
    private String photoPublicId;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    private ConcernPhoto(Concern concern, String photoUrl, String photoPublicId, int displayOrder) {
        this.id = UUID.randomUUID();
        this.concern = concern;
        this.photoUrl = photoUrl;
        this.photoPublicId = photoPublicId;
        this.displayOrder = displayOrder;
        this.createdAt = Instant.now();
    }

    public static ConcernPhoto create(
            Concern concern,
            String photoUrl,
            String photoPublicId,
            int displayOrder) {
        return new ConcernPhoto(concern, photoUrl, photoPublicId, displayOrder);
    }
}
