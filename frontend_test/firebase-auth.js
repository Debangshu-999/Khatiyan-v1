import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let app;
let auth;
let recaptchaVerifier;
let confirmationResult;

function requireAuth() {
  if (!auth) {
    throw new Error("Firebase is not initialized. Save Firebase config first.");
  }
  return auth;
}

window.khatiyanFirebase = {
  init(config) {
    app = initializeApp(config);
    auth = getAuth(app);
    return { projectId: config.projectId, appId: config.appId };
  },

  ensureRecaptcha(containerId) {
    const currentAuth = requireAuth();
    if (!recaptchaVerifier) {
      recaptchaVerifier = new RecaptchaVerifier(currentAuth, containerId, {
        size: "normal",
      });
    }
    return recaptchaVerifier;
  },

  async sendOtp(phone, containerId) {
    const currentAuth = requireAuth();
    const verifier = this.ensureRecaptcha(containerId);
    confirmationResult = await signInWithPhoneNumber(currentAuth, phone, verifier);
    return { phone, sent: true };
  },

  async verifyOtp(otp) {
    if (!confirmationResult) {
      throw new Error("Send Firebase OTP first.");
    }

    const credential = await confirmationResult.confirm(otp);
    const idToken = await credential.user.getIdToken();

    return {
      idToken,
      phone: credential.user.phoneNumber,
      uid: credential.user.uid,
    };
  },
};

window.dispatchEvent(new CustomEvent("khatiyan:firebase-ready"));
