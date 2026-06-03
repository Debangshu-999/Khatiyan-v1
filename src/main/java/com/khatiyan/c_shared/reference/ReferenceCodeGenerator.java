package com.khatiyan.c_shared.reference;

import java.time.Year;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Generates short user-facing reference codes while UUIDs remain internal ids.
 */
@Component
public class ReferenceCodeGenerator {

    private final JdbcTemplate jdbcTemplate;

    public ReferenceCodeGenerator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public String nextCode(String prefix) {
        Long sequenceValue = jdbcTemplate.queryForObject(
                "SELECT nextval('shared.reference_code_seq')",
                Long.class);
        if (sequenceValue == null) {
            throw new IllegalStateException("Reference code sequence did not return a value");
        }

        return "%s-%d-%06d".formatted(
                prefix,
                Year.now().getValue(),
                sequenceValue);
    }
}
