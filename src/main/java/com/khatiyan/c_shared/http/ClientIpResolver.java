package com.khatiyan.c_shared.http;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The caller's address, as far as it can be trusted.
 *
 * <p>{@code X-Forwarded-For} is a header, and a header is whatever the client
 * typed. Reading its first entry unconditionally — which both call sites used to
 * do — means anyone can dictate what the server records about them. That is
 * merely wrong for rate limiting, where it lets a caller sidestep their own
 * bucket. It is worse for evidence: an address the visitor chose is not a fact
 * about the visit, and a record built on one invites exactly the objection it
 * was written to answer.
 *
 * <p>So the header is honoured only when the immediate peer is a proxy we put
 * there. Configure {@code app.security.trusted-proxies} with the load balancer's
 * address when one is in front of the app, and leave it empty when the app is
 * exposed directly — in which case the socket address is the only truthful
 * answer and the header is ignored entirely.
 *
 * <p>The rightmost untrusted entry is taken, not the leftmost. A forwarding
 * chain is appended to, so the entries a client forged sit at the FRONT; the
 * last one our own proxy added is the last one anybody could have faked.
 */
@Component
public class ClientIpResolver {

    private static final Logger log = LoggerFactory.getLogger(ClientIpResolver.class);

    private final List<String> trustedProxies;

    public ClientIpResolver(
            @Value("${app.security.trusted-proxies:}") List<String> trustedProxies) {
        this.trustedProxies = trustedProxies.stream()
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toList();

        if (this.trustedProxies.isEmpty()) {
            log.info("No trusted proxies configured; X-Forwarded-For will be ignored");
        }
    }

    /**
     * @return the caller's address, never null; "unknown" if the container
     *         cannot supply one
     */
    public String resolve(HttpServletRequest request) {
        String peer = request.getRemoteAddr();
        if (peer == null) {
            return "unknown";
        }
        if (!isTrustedProxy(peer)) {
            return peer;
        }

        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (!StringUtils.hasText(forwardedFor)) {
            return peer;
        }

        // Walk from the right, discarding the hops we put there ourselves. What
        // stops the walk is the first address we did not add, which is the
        // furthest point back that is still ours to vouch for.
        String[] hops = forwardedFor.split(",");
        for (int at = hops.length - 1; at >= 0; at = at - 1) {
            String hop = hops[at].trim();
            if (StringUtils.hasText(hop) && !isTrustedProxy(hop)) {
                return hop;
            }
        }

        return peer;
    }

    /**
     * Whether an address is one of ours.
     *
     * <p>Exact matches only, deliberately. CIDR ranges would be convenient and
     * are the usual thing to reach for, but a range quietly widens who may
     * rewrite the recorded address, and this list has one or two entries in
     * practice. Add the addresses.
     */
    private boolean isTrustedProxy(String address) {
        if (trustedProxies.contains(address)) {
            return true;
        }

        // A proxy on the same host arrives as a loopback address, which has
        // several spellings (127.0.0.1, ::1, 0:0:0:0:0:0:0:1). Comparing the
        // parsed address rather than the string keeps the config from having to
        // list all of them.
        try {
            InetAddress parsed = InetAddress.getByName(address);
            for (String trusted : trustedProxies) {
                if (parsed.equals(InetAddress.getByName(trusted))) {
                    return true;
                }
            }
        } catch (UnknownHostException ignored) {
            // Not an address we can parse, so not one we put there.
        }

        return false;
    }
}
