package com.khatiyan.d_modules.tenancy.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** One of the property's WiFi routers, by its BSSID, added with Use this WiFi (user, 2026-11-15). */
@Entity
@Table(name = "roll_call_wifi", schema = "tenancy")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RollCallWifi extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    /** Lower case, colon separated. Never sent to tenants. */
    @Column(nullable = false, updatable = false, length = 17)
    private String bssid;

    /** The network's name, for the owner to recognise it. */
    @Column(length = 64)
    private String ssid;

    @Column(name = "added_by_user_id", nullable = false, updatable = false)
    private UUID addedByUserId;

    public static RollCallWifi add(UUID propertyId, String bssid, String ssid, UUID addedByUserId) {
        RollCallWifi wifi = new RollCallWifi();
        wifi.id = UUID.randomUUID();
        wifi.propertyId = propertyId;
        wifi.bssid = bssid;
        wifi.ssid = ssid == null || ssid.isBlank() ? null : ssid.strip();
        wifi.addedByUserId = addedByUserId;
        return wifi;
    }
}
