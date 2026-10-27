package com.khatiyan.d_modules.mail.api;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

/**
 * Where a mail's "Open in app" button goes (2026-10-18). Mail apps will not
 * follow an app's own link scheme, so the button opens this page, which hands
 * the route to the Khatiyan app. On Android it opens the app straight away.
 * Anywhere else it says to open the mail on the phone with the app.
 *
 * <p>Public, and it reads nothing: the route is a screen name the app checks
 * itself, never an id that grants anything.
 */
@RestController
@RequestMapping("/api/v1/open")
public class AppOpenController {

    static final String SCHEME = "khatiyan";
    static final String ANDROID_PACKAGE = "com.khatiyan.app";
    /** A screen and a plain query: "my-visits", "my-booking-detail?requestId=...". */
    private static final Pattern ROUTE = Pattern.compile("^[a-z0-9-]{1,60}(\\?[A-Za-z0-9=&_-]{0,200})?$");

    @GetMapping(produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> open(
            @RequestParam(name = "to", required = false) String to,
            @RequestHeader(name = "User-Agent", required = false) String userAgent) {
        String route = to != null && ROUTE.matcher(to).matches() ? to : "";
        String appLink = SCHEME + "://" + route;
        boolean android = userAgent != null && userAgent.toLowerCase(java.util.Locale.ROOT).contains("android");
        String target = android ? "intent://" + route + "#Intent;scheme=" + SCHEME + ";package=" + ANDROID_PACKAGE + ";end"
                : appLink;
        String href = HtmlUtils.htmlEscape(target, StandardCharsets.UTF_8.name());
        String page = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>Open Khatiyan</title>"
                + (android ? "<meta http-equiv=\"refresh\" content=\"0;url=" + href + "\">" : "")
                + "</head><body style=\"margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
                + "background:#F3F5F9;color:#0F172A\"><div style=\"max-width:420px;margin:64px auto;padding:0 20px;"
                + "text-align:center\"><h1 style=\"font-size:20px\">Opening Khatiyan</h1>"
                + "<p style=\"font-size:15px;line-height:22px;color:#64748B\">"
                + (android ? "If the app did not open, tap the button."
                        : "Open this mail on your phone, where the Khatiyan app is installed.")
                + "</p><p><a href=\"" + href + "\" style=\"display:inline-block;padding:12px 22px;border-radius:10px;"
                + "background:#3F6ED8;color:#FFFFFF;font-weight:700;text-decoration:none\">Open in app</a></p>"
                + "</div></body></html>";
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(page);
    }
}
