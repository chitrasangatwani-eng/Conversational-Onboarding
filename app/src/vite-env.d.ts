/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** "server" sends real OTPs through /api/otp; "local" (default) keeps the in-browser demo for static hosting. */
  readonly VITE_OTP_MODE?: "server" | "local";
  /** "server" routes OTP and handoff through the backend; "local" (default) simulates them for static hosting. */
  readonly VITE_BACKEND?: "server" | "local";
}
