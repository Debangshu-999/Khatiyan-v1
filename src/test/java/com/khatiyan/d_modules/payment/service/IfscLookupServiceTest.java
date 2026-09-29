package com.khatiyan.d_modules.payment.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import com.khatiyan.d_modules.payment.api.dto.IfscLookupResponse.IfscLookupStatus;
import com.sun.net.httpserver.HttpServer;

/**
 * Payment setup blocks a bank transfer on NOT_FOUND and lets UNAVAILABLE
 * through (2026-09-28), so the three answers must never blur. A local stand-in
 * for {@code ifsc.razorpay.com}: a known branch answers 200, anything else 404,
 * as the real directory does.
 */
class IfscLookupServiceTest {

    private HttpServer directory;

    @BeforeEach
    void startDirectory() throws IOException {
        directory = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        directory.createContext("/", exchange -> {
            boolean known = exchange.getRequestURI().getPath().equals("/HDFC0001234");
            byte[] body = known
                    ? "{\"BANK\":\"HDFC Bank\",\"BRANCH\":\"PARK STREET\",\"CITY\":\"JAIPUR\",\"STATE\":\"RAJASTHAN\"}"
                            .getBytes(StandardCharsets.UTF_8)
                    : "\"Not Found\"".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(known ? 200 : 404, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        directory.start();
    }

    @AfterEach
    void stopDirectory() {
        directory.stop(0);
    }

    private IfscLookupService service(String baseUrl) {
        return new IfscLookupService(RestClient.builder(), baseUrl, true, 2000);
    }

    @Test
    void aRealBranchIsFoundAndNamed() {
        var response = service("http://127.0.0.1:" + directory.getAddress().getPort()).lookup("hdfc0001234");

        assertThat(response.status()).isEqualTo(IfscLookupStatus.FOUND);
        assertThat(response.bank()).isEqualTo("HDFC Bank");
        assertThat(response.branch()).isEqualTo("PARK STREET");
    }

    @Test
    void aMadeUpCodeIsNotFound() {
        var response = service("http://127.0.0.1:" + directory.getAddress().getPort()).lookup("ABCD0123456");

        assertThat(response.status()).isEqualTo(IfscLookupStatus.NOT_FOUND);
    }

    @Test
    void anUnreachableDirectoryIsUnavailableNotWrong() {
        int port = directory.getAddress().getPort();
        directory.stop(0);

        var response = service("http://127.0.0.1:" + port).lookup("ABCD0123456");

        assertThat(response.status()).isEqualTo(IfscLookupStatus.UNAVAILABLE);
    }
}
