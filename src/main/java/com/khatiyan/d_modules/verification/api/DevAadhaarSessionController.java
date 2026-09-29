package com.khatiyan.d_modules.verification.api;

import java.util.Optional;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

import com.khatiyan.d_modules.verification.provider.AadhaarAppProvider;
import com.khatiyan.d_modules.verification.provider.DevAadhaarAppProvider;
import com.khatiyan.d_modules.verification.provider.DevAadhaarAppProvider.DevOutcome;
import com.khatiyan.d_modules.verification.provider.DevAadhaarAppProvider.DevSession;
import com.khatiyan.d_modules.verification.service.VerificationService;

/**
 * The development stand-in for the Aadhaar App: a page on this server.
 *
 * <p>The app opens the session's link as it would open the real one, and this
 * page offers each outcome worth testing. Editing the name or the date of birth
 * is how a mismatch or an under-18 result is produced. The result is shaped
 * like Decentro's and goes through the same callback handling as a real one.
 *
 * <p>Answers 404 unless the DEV provider is the one running, so it is inert
 * anywhere a real provider is configured.
 */
@RestController
@RequestMapping("/api/v1/verification/dev-sessions")
public class DevAadhaarSessionController {

    private final AadhaarAppProvider appProvider;
    private final VerificationService verificationService;

    public DevAadhaarSessionController(AadhaarAppProvider appProvider, VerificationService verificationService) {
        this.appProvider = appProvider;
        this.verificationService = verificationService;
    }

    @GetMapping(value = "/{sessionId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> page(@PathVariable String sessionId) {
        Optional<DevSession> session = sessionOf(sessionId);
        if (session.isEmpty()) {
            return ResponseEntity.status(404).contentType(MediaType.TEXT_HTML)
                    .body(shell("Session closed", "<p>This session has expired or was already answered.</p>"));
        }
        String name = HtmlUtils.htmlEscape(session.get().requestedName() == null ? "" : session.get().requestedName());
        String form = """
                <p class="muted">Development stand-in for the Aadhaar App. Nothing here is a real Aadhaar.</p>
                <form method="post">
                  <label>Name on Aadhaar<input name="name" value="%s"></label>
                  <label>Date of birth (dd/MM/yyyy)<input name="dob" value="15/06/1995"></label>
                  <label>Gender
                    <select name="gender">
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="T">Transgender</option>
                    </select>
                  </label>
                  <label>Aadhaar-linked mobile, last digits (blank = not shared)<input name="mobile" placeholder="XXXXX-X1234"></label>
                  <button name="outcome" value="SHARE" class="primary">Share details</button>
                  <button name="outcome" value="FACE_FAILS">Face check fails</button>
                  <button name="outcome" value="DECLINE">Decline</button>
                </form>
                """.formatted(name);
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(shell("Aadhaar App (dev)", form));
    }

    @PostMapping(value = "/{sessionId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> answer(
            @PathVariable String sessionId,
            @RequestParam DevOutcome outcome,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String dob,
            @RequestParam(required = false) String gender,
            @RequestParam(required = false) String mobile) {
        Optional<DevSession> session = sessionOf(sessionId);
        if (session.isEmpty()) {
            return ResponseEntity.status(404).contentType(MediaType.TEXT_HTML)
                    .body(shell("Session closed", "<p>This session has expired or was already answered.</p>"));
        }
        DevAadhaarAppProvider dev = (DevAadhaarAppProvider) appProvider;
        String callbackUrl = session.get().callbackUrl();
        String token = callbackUrl.substring(callbackUrl.lastIndexOf('/') + 1);
        verificationService.handleCallback(token, DevAadhaarAppProvider.resultBody(
                session.get().referenceId(), outcome, name, dob, gender, mobile));
        dev.close(sessionId);

        String back = HtmlUtils.htmlEscape(session.get().returnUrl());
        String body = """
                <p>Result sent. Return to Khatiyan to see it.</p>
                <a class="primary" href="%s">Back to Khatiyan</a>
                <script>setTimeout(function () { location.href = "%s"; }, 400);</script>
                """.formatted(back, back);
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(shell("Done", body));
    }

    private Optional<DevSession> sessionOf(String sessionId) {
        return appProvider instanceof DevAadhaarAppProvider dev ? dev.session(sessionId) : Optional.empty();
    }

    private static String shell(String title, String content) {
        return """
                <!doctype html>
                <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
                <title>%s</title>
                <style>
                  body { font-family: system-ui, sans-serif; margin: 0; padding: 20px 16px; background: #f6f7f9; color: #111; }
                  h1 { font-size: 20px; margin: 0 0 8px; }
                  .muted { color: #555; font-size: 14px; }
                  form { display: flex; flex-direction: column; gap: 12px; }
                  label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
                  input, select { font-size: 16px; padding: 10px; border: 1px solid #bbb; border-radius: 8px; background: #fff; }
                  button, a.primary { font-size: 16px; padding: 12px; border-radius: 8px; border: 1px solid #111; background: #fff; text-align: center; text-decoration: none; color: #111; display: block; }
                  .primary { background: #111 !important; color: #fff !important; }
                </style></head>
                <body><h1>%s</h1>%s</body></html>
                """.formatted(HtmlUtils.htmlEscape(title), HtmlUtils.htmlEscape(title), content);
    }
}
