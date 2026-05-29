package com.khatiyan.b_config;

import java.util.UUID;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;

import com.khatiyan.c_shared.audit.AuditorProvider;

@Configuration
public class JpaConfig {

    @Bean
    public AuditorAware<UUID> auditorProvider() {
        return new AuditorProvider();
    }
}
