package com.khatiyan.d_modules.discovery.api.dto;

import java.util.List;

/** The station tree of one metro system: its lines, each with its stations in order. */
public record MetroSystemResponse(
        String code,
        String name,
        double centreLatitude,
        double centreLongitude,
        List<LineResponse> lines) {

    public record LineResponse(
            String code,
            String name,
            String colour,
            String fromStation,
            String toStation,
            List<StationResponse> stations) {
    }

    /** An interchange appears under each of its lines, with the same code, and lists the other lines' colours. */
    public record StationResponse(String code, String name, List<String> otherLineColours) {
    }
}
