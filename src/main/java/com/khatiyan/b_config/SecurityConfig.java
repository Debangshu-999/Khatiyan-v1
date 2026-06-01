package com.khatiyan.b_config;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.khatiyan.a_auth.service.JwtAuthenticationFilter;
import com.khatiyan.c_shared.rate_limit.ApiRateLimitFilter;

/**
 * Application-wide Spring Security configuration.
 *
 * <p>
 * The auth module owns JWT issuing and filtering. This class wires
 * that filter into Spring Security, defines public routes, disables
 * server sessions, and provides shared security beans such as BCrypt.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            ApiRateLimitFilter apiRateLimitFilter) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> {
                })
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/me").authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/auth/me").authenticated()
                        .requestMatchers("/api/v1/notifications/**").authenticated()
                        .requestMatchers("/api/v1/auth/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/discovery/properties",
                                "/api/v1/discovery/properties/**",
                                "/api/v1/discovery/local-place-tags").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/discovery/me/local-places").hasRole("USER")

                        .requestMatchers(HttpMethod.POST, "/api/v1/properties").hasRole("OWNER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/properties").hasRole("OWNER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/properties/{propertyId}").hasRole("OWNER")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/properties/{propertyId}").hasRole("OWNER")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/properties/{propertyId}").hasRole("OWNER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/properties/{propertyId}/managers").hasRole("OWNER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/properties/{propertyId}/managers").hasRole("OWNER")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/properties/{propertyId}/managers/{managerUserId}").hasRole("OWNER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/properties/{propertyId}/rooms", "/api/v1/properties/{propertyId}/rooms/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/properties/{propertyId}/rooms", "/api/v1/properties/{propertyId}/rooms/**").authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/properties/{propertyId}/rooms/**").authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/properties/{propertyId}/rooms/**").authenticated()
                        .requestMatchers("/api/v1/properties/{propertyId}/discovery-profile",
                                "/api/v1/properties/{propertyId}/discovery-profile/**").authenticated()
                        .requestMatchers("/api/v1/properties/{propertyId}/local-places",
                                "/api/v1/properties/{propertyId}/local-places/**").authenticated()
                        .requestMatchers("/api/v1/properties/{propertyId}/property-board/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/properties/{propertyId}/notices").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/properties/{propertyId}/notices/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/properties/{propertyId}/recurring-notices").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/properties/{propertyId}/recurring-notices").authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/recurring-notices/{recurringNoticeId}").authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/recurring-notices/{recurringNoticeId}").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/notices/me/visible").hasRole("USER")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/notices/{noticeId}", "/api/v1/notices/{noticeId}/archive").authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/notices/{noticeId}").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/properties/{propertyId}/concerns/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/concerns").hasRole("USER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/concerns/me/**").hasRole("USER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/concerns/{concernId}/reopen").hasRole("USER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/concerns/undertaken").authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/concerns/{concernId}/assign").authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/concerns/{concernId}/status").authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/concerns/{concernId}/resolve").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/tenancies/me/active").hasRole("USER")
                        .requestMatchers("/api/v1/tenancies/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/billing/me/**").hasRole("USER")
                        .requestMatchers("/api/v1/billing/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/payments/webhooks/razorpay").permitAll()
                        .requestMatchers("/api/v1/payments/**").authenticated()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(apiRateLimitFilter, JwtAuthenticationFilter.class)
                .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") String allowedOrigins) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(parseCsv(allowedOrigins));
        configuration.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
        configuration.setExposedHeaders(List.of("Location"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);

        return source;
    }

    private List<String> parseCsv(String value) {
        return Arrays.stream(value.split(","))
                .map(entry -> entry.trim())
                .filter(entry -> !entry.isBlank())
                .toList();
    }
}
