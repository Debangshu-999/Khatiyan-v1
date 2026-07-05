package com.khatiyan.d_modules.geo.service;

/** Which upstream service answers geocoding calls. LOG is the keyless dev fallback. */
public enum GeocodingProviderType {
    LOG,
    MAPPLS,
    GEOAPIFY
}
