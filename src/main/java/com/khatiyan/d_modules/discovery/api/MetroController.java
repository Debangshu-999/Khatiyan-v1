package com.khatiyan.d_modules.discovery.api;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.d_modules.discovery.api.dto.MetroSystemResponse;
import com.khatiyan.d_modules.discovery.metro.MetroService;

@RestController
@RequestMapping("/api/v1/discovery/metro")
public class MetroController {

    private final MetroService metroService;

    public MetroController(MetroService metroService) {
        this.metroService = metroService;
    }

    @GetMapping
    public List<MetroSystemResponse> systems() {
        return metroService.systems();
    }
}
