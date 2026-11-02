# Club Bibou Wallet

Candidate based on the live API commit `a3d5a1742d72eb59f7f1f5b898bb8230404c5b52`.
Not activated in production. No native application/store change in this candidate.

## Identity and loyalty

The web page `/club` uses the existing `/api/auth/sms/start`, `/check` (registrationVersion 2) and `/register` routes. The verified phone reuses the existing account; unfinished signup creates no extra customer. Existing welcome/referral/loyalty rules remain authoritative. The short-lived full session is exchanged for an HttpOnly, Secure, SameSite=Strict Wallet-only cookie; it cannot access orders or spend rewards. No customer token is stored in a barcode, URL or browser storage.

Memberships are opt-in and persist on the existing customer. Every card reads `customer.points`; no additional balance ledger exists. Database writes update a monotonic card revision, covering order points, cancellations, wheel points, manual adjustments and redemption without modifying these rules. Issued cards are synchronized in a bounded timer outside the order lock, with persisted revisions so an outage/restart does not lose pending work. Provider failures must never block checkout. Card balances can be stale offline; do not describe them as instantaneous.

The QR has the format `BIBOU:1:<random membership ID>`. `/api/dashboard/wallet/identify` requires a restaurant session and returns only first name, card ID and points. It does not log in, credit points, redeem gifts or assign a customer to an order. A kiosk/counter scan interface and its order linkage still need implementation and device testing before claiming in-store scanning works.

Account deletion removes the membership/customer association, immediately invalidates QR lookup and queues an anonymous provider revocation. Apple installation metadata expires after 30 days. Unsynced Google revocation IDs survive without customer identity until Google confirms the update. Offline cards can retain old visuals. Private backups follow the existing backup rotation.

## Deployment gates

All providers are disabled by default. Serve the candidate only after the HTTP, signing, balance update and deletion tests pass. Do not enable public issuance until real-device acceptance, installation/update/removal and scanner behavior are verified.

Environment variables (values/keys must never enter Git):

- `WALLET_ENABLED=true`, `WALLET_PUBLIC_ORIGIN=https://<exact-api-host>` (origin only, no path).
- `WALLET_APPLE_ENABLED=true`, `WALLET_APPLE_PASS_TYPE=pass.com.bibousburgers.club`, `WALLET_APPLE_TEAM_ID=RXT78KZ7A7`.
- `WALLET_APPLE_CERT_FILE`, `WALLET_APPLE_KEY_FILE`, `WALLET_APPLE_WWDR_FILE`: private mounted PEM files. The key must match the authorized Pass Type certificate; WWDR G4 is its actual issuer. Never use an app-distribution certificate. The configuration verifies the purpose, team, key match, validity and intermediate signature.
- `WALLET_GOOGLE_ENABLED=true`, `WALLET_GOOGLE_ISSUER_ID`, `WALLET_GOOGLE_CLASS_ID`, `WALLET_GOOGLE_CREDENTIAL_FILE`: a dedicated RSA service account authorized only for the Wallet issuer, no general project/owner role. Google demo issuance is restricted to authorized test accounts. Public access requires Google's publishing approval; setting a flag does not grant that approval.

For a host that exposes secret environment variables rather than secret files, the equivalent `WALLET_APPLE_CERT_PEM`, `WALLET_APPLE_KEY_PEM`, `WALLET_APPLE_WWDR_PEM` and `WALLET_GOOGLE_CREDENTIALS_JSON` are supported. Use exactly one mechanism per credential. These values remain server-only, never enter build arguments or public responses, and are not logged. Merge the new Wallet keys without replacing unrelated existing variables.

The Apple web service lives at `/api/wallet/apple/v1/...`; only the pass-specific `ApplePass` credential authorizes registration, removal and updates. Device discovery returns only the installation's serial numbers and update tag. Device logs are discarded. Google Save JWTs contain a single object referencing an existing approved/demo class, never create a class implicitly, and do not include phone/order data. The points worker uses the Wallet-only OAuth scope, does not silently create objects, and never sends SMS. Do not log signed Save links or credentials.

No NFC, direct payment, GPS proximity reminder, or guaranteed double-click opening is implemented. Existing physical cards have 10 stamps = 1 free burger; migration is only discussed, with no conversion ratio chosen and no credits granted. Validate the physical card and mark it transferred before any future one-time migration; do not duplicate rewards or invent a new stamps programme.

Assets are exact resizes/compositions of the repository's real Bibou wordmark, on its cream/green palette. Local self-signed fixtures test the CMS/ZIP format only and are never represented as Apple-trusted passes.
