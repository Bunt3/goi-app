/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
/** True in the Android (Capacitor) build, false on the website. Fixed at build time. */
declare const __NATIVE__: boolean;
/** package.json's version, e.g. "1.3.0" (also the APK's versionName). */
declare const __APP_SEMVER__: string;
