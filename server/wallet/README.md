# Club Bibou Wallet

Candidate based on the live API commit `a3d5a1742d72eb59f7f1f5b898bb8230404c5b52`.
No native application/store change in this candidate.

## Identity and loyalty

The web page `/club` uses the existing `/api/auth/sms/start`, `/check` (registrationVersion 2) and `/register` routes. The verified phone reuses the existing account; unfinished signup creates no extra customer. Existing welcome/referral/loyalty rules remain authoritative. The short-lived full session is exchanged for an HttpOnly, Secure, SameSite=Strict Wallet-only cookie; it cannot access orders or spend rewards. No customer token is stored in a barcode, URL or browser storage.

Memberships are opt-in and persist on the existing customer. Every card reads `customer.points`; no additional balance ledger exists. Database writes update a monotonic card revision, covering order points, cancellations, wheel points, manual adjustments and redemption without modifying these rules. Issued cards are synchronized in a bounded timer outside the order lock, with persisted revisions so an outage/restart does not lose pending work. Provider failures must never block checkout. Card balances can be stale offline; do not describe them as instantaneous.

The QR has the format `BIBOU:1:<random membership ID>`. `/api/dashboard/wallet/identify` requires a restaurant session and returns only first name, card ID and points. It does not log in, credit points, redeem gifts or assign a customer to an order. A kiosk/counter scan interface and its order linkage still need implementation and device testing before claiming in-store scanning works.

Account deletion removes the membership/customer association, immediately invalidates QR lookup and queues an anonymous provider revocation. Apple installation metadata expires after 30 days. Unsynced Google revocation IDs survive without customer identity until Google confirms the update. Offline cards can retain old visuals. Private backups follow the existing backup rotation.

## Deployment gates

All providers are disabled by default. Serve the candidate only after the HTTP, signing, balance update and deletion tests pass. Do not enable public issuance until real-device acceptance, installation/update/removal and scanner behavior are verified.

For private on-device acceptance, set `WALLET_PREVIEW_ONLY=true` and `WALLET_PREVIEW_PHONE_HASHES` to comma-separated SHA-256 digests of the allowed verified phone numbers, normalized as `33` plus the nine national digits (no plus sign). An empty/invalid list denies every account. The restriction applies to both full customer sessions and Wallet cookies, before membership creation or any Apple/Google issuance. It does not modify ordinary app authentication or loyalty. Never remove this restriction while device/scanner acceptance or Google publishing approval remains incomplete.

Environment variables (values/keys must never enter Git):

- `WALLET_ENABLED=true`, `WALLET_PUBLIC_ORIGIN=https://<exact-api-host>` (origin only, no path).
- `WALLET_APPLE_ENABLED=true`, `WALLET_APPLE_PASS_TYPE=pass.com.bibousburgers.club`, `WALLET_APPLE_TEAM_ID=RXT78KZ7A7`.
- `WALLET_APPLE_CERT_FILE`, `WALLET_APPLE_KEY_FILE`, `WALLET_APPLE_WWDR_FILE`: private mounted PEM files. The key must match the authorized Pass Type certificate; WWDR G4 is its actual issuer. Never use an app-distribution certificate. The configuration verifies the purpose, team, key match, validity and intermediate signature.
- `WALLET_GOOGLE_ENABLED=true`, `WALLET_GOOGLE_ISSUER_ID`, `WALLET_GOOGLE_CLASS_ID`, `WALLET_GOOGLE_CREDENTIAL_FILE`: a dedicated RSA service account authorized only for the Wallet issuer, no general project/owner role. Google demo issuance is restricted to authorized test accounts. Public access requires Google's publishing approval; setting a flag does not grant that approval.

For a host that exposes secret environment variables rather than secret files, the equivalent `WALLET_APPLE_CERT_PEM`, `WALLET_APPLE_KEY_PEM`, `WALLET_APPLE_WWDR_PEM` and `WALLET_GOOGLE_CREDENTIALS_JSON` are supported. Use exactly one mechanism per credential. These values remain server-only, never enter build arguments or public responses, and are not logged. Merge the new Wallet keys without replacing unrelated existing variables.

The Apple web service lives at `/api/wallet/apple/v1/...`; only the pass-specific `ApplePass` credential authorizes registration, removal and updates. Device discovery returns only the installation's serial numbers and update tag. Device logs are discarded. Google Save JWTs contain a single object referencing an existing approved/demo class, never create a class implicitly, and do not include phone/order data. The points worker uses the Wallet-only OAuth scope, does not silently create objects, and never sends SMS. Do not log signed Save links or credentials.

Location relevance is configured at the restaurant's publicly verified BAN point (153 Quai George V, Le Havre; 49.490809, 0.118444). Apple passes include one `locations` entry; Google uses the class-level `merchantLocations`, not deprecated `locations`. No client GPS is requested by the Bibou page or received by this backend for proximity. The provider/device decides radius, timing and presentation; Apple offers a passive lock-screen suggestion, never a forced full-screen opening. Google requires the user's own notification and precise always-on location permissions. Do not promise a fixed radius, instant appearance or operation on all devices. User reported successful Apple installation and double-click access on 2026-11-02; proximity remains to be tested physically after this update. Presentation revision changes refresh existing cards without changing points or QR/serial; voided Apple cards omit venue relevance.

No NFC or direct payment is implemented. Double-click access was confirmed by the owner on his iPhone, but must not be guaranteed on every device. Existing physical cards have 10 stamps = 1 free burger; migration is only discussed, with no conversion ratio chosen and no credits granted. Validate the physical card and mark it transferred before any future one-time migration; do not duplicate rewards or invent a new stamps programme.

Assets are exact resizes/compositions of the repository's real Bibou wordmark, on its cream/green palette. Local self-signed fixtures test the CMS/ZIP format only and are never represented as Apple-trusted passes.
