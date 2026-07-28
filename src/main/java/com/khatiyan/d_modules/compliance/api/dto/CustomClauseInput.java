package com.khatiyan.d_modules.compliance.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** One owner-authored prose clause: a heading and its body text. */
public record CustomClauseInput(

    @NotBlank
    @Size(max = 120)
    String heading,

    @NotBlank
    @Size(max = 4000)
    String body
) {
}
