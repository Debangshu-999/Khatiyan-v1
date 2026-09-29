package com.khatiyan.b_config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.khatiyan.c_shared.concurrency.ExpectedVersionInterceptor;

/**
 * MVC additions on top of Boot's defaults. Not {@code @EnableWebMvc}, which
 * would switch those defaults off.
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    /** If-Match → the version an action's screen loaded (2026-09-29). */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new ExpectedVersionInterceptor());
    }
}
