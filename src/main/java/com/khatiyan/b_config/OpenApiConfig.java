package com.khatiyan.b_config;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.khatiyan.c_shared.concurrency.RequiresVersion;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

/**
 * Swagger UI, set up so the API can actually be called from it.
 *
 * <p>Out of the box the page listed every endpoint and could call none of the
 * protected ones: it had nowhere to put a token. This adds the Authorize button
 * (paste the {@code accessToken} a login returns) and the one header the page
 * could not know about, because an interceptor reads it and no controller
 * method declares it.
 *
 * <p><b>Off in production</b> ({@code application-prod.yml}). The page is a full
 * map of the API, and its paths are open in {@code SecurityConfig} so it works
 * without a token in development.
 */
@Configuration
public class OpenApiConfig {

    private static final String BEARER = "bearer";

    @Bean
    OpenAPI khatiyanOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Khatiyan API")
                        .version("v1")
                        .description("Sign in with POST /api/v1/auth/pin/login, copy accessToken, then press Authorize."))
                .components(new Components().addSecuritySchemes(BEARER, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER));
    }

    /**
     * Example bodies for the two sign-ins, without {@code signOutSessionId}.
     *
     * <p>The page fills every field of an example, optional ones included. Sent
     * with its made-up id, that field names a session that does not exist, and
     * the login is refused after the PIN or code has already been checked.
     *
     * <p>Set here and not with {@code @Schema} on the records: the swagger
     * annotations jar on the classpath is older than springdoc expects, and the
     * first {@code @Schema} it reads fails the whole page
     * ({@code NoSuchMethodError: Schema.$dynamicRef()}, found 2026-10-02).
     */
    @Bean
    OpenApiCustomizer signInExamples() {
        return openApi -> {
            example(openApi, "PinLoginRequest", "phone", "9876543210", "pin", "123456");
            example(openApi, "EmailLoginConfirmRequest", "email", "owner@example.com", "otp", "123456");
        };
    }

    @SuppressWarnings({ "rawtypes", "unchecked" })
    private static void example(OpenAPI openApi, String schemaName, String... keyValues) {
        if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
            return;
        }
        Schema schema = openApi.getComponents().getSchemas().get(schemaName);
        if (schema == null) {
            return;
        }
        Map<String, String> body = new LinkedHashMap<>();
        for (int at = 0; at < keyValues.length; at += 2) {
            body.put(keyValues[at], keyValues[at + 1]);
        }
        schema.setExample(body);
        schema.setExamples(List.of(body));
    }

    /**
     * {@code If-Match} on every endpoint that refuses a stale edit. Without it the
     * page cannot send the header, and those calls all come back 428.
     */
    @Bean
    OperationCustomizer staleEditHeader() {
        return (operation, handlerMethod) -> {
            if (handlerMethod.hasMethodAnnotation(RequiresVersion.class)) {
                operation.addParametersItem(new Parameter()
                        .in("header")
                        .name("If-Match")
                        .required(true)
                        .description("The record's version, as its last read returned it.")
                        .schema(new StringSchema()));
            }
            return operation;
        };
    }
}
