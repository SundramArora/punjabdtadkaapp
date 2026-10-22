# Punjab Tadka — Repository Audit

**Audit date:** 2026-10-23  
**Mode:** Read-only source and test review before remediation  
**Scope:** First-party JavaScript, Express routes, Mongoose schemas, configuration, tests, browser files, package metadata, and the documented architecture. `node_modules/` and live services were excluded.  
**Working-tree note:** The repository already contained substantial uncommitted application changes and new files when this audit began. Those changes were treated as the code under review. No application source was changed during the audit; this report replaces an outdated, contradictory draft.

## Executive summary

Punjab Tadka is a legacy CommonJS application split across two Express processes. `pdt.js` is the restaurant API and handles account registration/login, OTP, menu/catalog reads and writes, wallet records, addresses, carts, orders, and Razorpay integration. `server.js` is a separate branding/GridFS API with a second login and refresh-token flow. Mongoose models map both systems to MongoDB collections. A small AngularJS login client exists under `public/`.

The current working tree includes meaningful security and checkout improvements: environment-based secrets, PBKDF2 password hashing, JWT middleware, admin role checks, OTP limits, current-menu server pricing in integer paise, idempotent checkout keys, wallet transactions, Razorpay signature verification, and order/refund routes. The requested cart-to-order flow is therefore present in source; the prior draft's assertion that it was missing is obsolete.

The highest remaining risks are registration's multi-document write consistency, refund/provider reconciliation, database-dependent migration checks, and the lack of MongoDB/provider integration tests. Unit tests and syntax checks do not exercise persistence, transaction support, retries, or payment races. Production readiness is not established.

## Security review

A dedicated security reviewer examined authentication/session, OTP, cart-to-order, wallet, order-access, and Razorpay payment/refund paths and reported **no new reportable vulnerabilities** in those reviewed areas.

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| — | — | — | — | No reportable vulnerabilities found by the dedicated review in its stated scope. | — |

This is not a claim that the application is secure in production: live configuration, deployment controls, and external integrations were not tested. Separately, a Slack webhook was identified in an earlier GitHub push-protection rejection. Treat it as compromised and revoke/rotate it; removing it from current source/history does not revoke it at the provider.

## Architecture and business flow

- `pdt.js` connects to the configured restaurant MongoDB database, mounts API routes under `/api`, and implements account, menu, wallet, address, cart, checkout, order, and payment behavior.
- `server.js` separately connects to the shared database and exposes branding/GridFS operations plus its own login, short-lived JWT, and refresh-token endpoints. Both processes default to port 8091 unless configured otherwise.
- `app/services/pricing.js` prices menu variants from database data and returns integer INR paise. Coupons are explicitly rejected; taxes and delivery fees are zero under the current implementation.
- `POST /api/addToCart` persists a priced cart. `/api/checkout` creates an `itemOrder`, optionally debits wallet funds, and/or initializes Razorpay; order items are embedded in the order. Order reads, cancellation, status changes, webhook/payment verification, and refund operations are implemented in `pdt.js`.
- Wallet and order data are spread across MongoDB collections. Wallet checkout/refund paths use MongoDB transactions, which require a replica-set or sharded deployment.
- `public/` contains only a small, legacy AngularJS login client; it is not a complete client for the newer quote/checkout/order APIs.

## Findings — correctness, consistency, and operability

### P1 — Generated account and wallet identifiers are not safe under concurrency

Before remediation, registration allocated `UserId` and wallet IDs by reading the maximum and adding one. This was race-prone. Registration now uses MongoDB-backed atomic counters in the `idSequences` collection, seeded to at least the current maximum on each allocation. Existing duplicate IDs still need to be checked and reconciled before deployment; no uniqueness constraint was added without a production-data review.

### P1 — A failed Razorpay attempt can leave an order in an in-process state

`markRazorpayFailure` updates payment status but does not move the order out of `gateway_initializing` or another pending lifecycle state (`pdt.js:1644-1668`). The history endpoints filter by order status, so the failed checkout can remain in the in-process list rather than becoming a terminal failed order. Make the failure transition explicit and conditional, and test provider failure/retry behavior.

### P1 — Admin completion can mark an unsettled online payment as paid

The admin order-status handler sets `paymentStatus` to `paid` whenever the next order status is `completed` (`pdt.js:2021-2030`). For a Razorpay order, this can mark the order paid without confirming that the corresponding provider payment was captured. Completion must require every non-COD payment component to be settled; COD collection should update only the COD payment entry.

### P1 — External refund retries need durable reconciliation

Online refunds reserve a local refund entry before calling Razorpay (`pdt.js:2120-2217`). A provider timeout or ambiguous response can leave the entry in `requested`, and a retry with the same key currently returns the existing entry instead of safely reconciling/retrying the provider request. Cancellation also calls the provider before persisting its refund record (`pdt.js:1870-1940`), so a timeout can make a repeated cancellation issue another provider request. Persist a durable provider-operation state, use the provider's supported idempotency/reconciliation mechanism, and test lost-response and duplicate-webhook cases before enabling live refunds.

### P2 — Legacy item reads assume optional data exists and one query uses the wrong field

`GET /api/GetItemById` queries `likes.userId`, while the item schema defines `likes.username` (`pdt.js:2441`; `app/models/itemSchema.js:55-64`). A missing result is then dereferenced, as are optional ratings and the first image (`pdt.js:2455-2480`). `GET /api/GetItemsCategoryById` also assumes ratings, likes, and images are populated and accumulates its like counter across items (`pdt.js:2380-2412`). Use the authenticated account identity consistently, handle absent items and empty arrays, and calculate per-item counts independently.

### P2 — Favorite identity types are inconsistent

Registration accepts arbitrary string usernames, and `AddToFavourite` uses that string (`pdt.js:2502-2525`), while `itemSchema.likes.username` is numeric (`app/models/itemSchema.js:55-64`). Non-numeric usernames can fail Mongoose casting or fail to match, making favorites unreliable. Standardize identity fields and migrate/validate existing documents before changing the persisted schema.

### P2 — Branding offer reads can fail on stale references

The restaurant-offer aggregation assumes each offer has a matching item at `Item_Detaill[0]` (`pdt.js:1224-1230`). A deleted or invalid item reference can make the public offer endpoint throw. Treat missing joins as absent offers or return a controlled response.

### P2 — The browser login client does not match the current API contract

`mainController.js` calls `Auth.isLogged()`, which is not implemented in `authService.js`, and expects `data.success`, which the API does not return (`public/controller/mainController.js:7-31`, `public/services/authService.js:1-25`). The visible login page is not wired to a complete checkout client. Either repair the client contract or remove/replace this legacy surface.

### P2 — Registration spans multiple documents without a transaction

Registration writes the user, wallet, and wallet-ledger entry separately and relies on compensating deletes when a later write fails. A process interruption or failed cleanup can still leave a partially registered account or orphaned wallet data. Use a MongoDB transaction where supported, or an explicit idempotent registration state/reconciliation path.

### P2 — Public dashboard read has filesystem side effects

`GET /api/saveDashboard` converts stored base64 images into local files while servicing a read request (`pdt.js:1022-1059`). Repeated reads can perform unnecessary disk writes and image conversions. Make image generation an explicit admin/background operation and serve stable cached outputs.

### P2 — Runtime and dependency metadata need maintenance

`package.json` points `main` to `pdsBranding.js`, which is absent, and lists `"start": "nodemon pdt.js"` as a dependency rather than a package script. The declared Express/Mongoose stack is legacy, and no dependency vulnerability scan was run. Clean up unused dependencies, provide intentional scripts/entry points, and plan a tested framework/driver upgrade.

## Database, integration, and scale risks

- Wallet operations require MongoDB transactions. The configured production topology and transaction/index behavior have not been verified against a safe copy of real data.
- New unique indexes on order idempotency and Razorpay order IDs may conflict with existing data or cause deployment-time index builds; inspect and reconcile duplicates before rollout.
- `pdt.js` and `server.js` begin listening without waiting for their MongoDB connections to become ready. Startup health/readiness behavior should gate traffic on successful database initialization.
- Provider operations, webhook retries, concurrent checkout, cancellation/capture races, refund reconciliation, database failover, and production index creation lack integration coverage.
- No benchmark or load test was run. The current code includes large legacy handlers and file conversion inside request paths; capacity under concurrent customer traffic is unknown.
- Tax, delivery fees, coupon eligibility/stacking, and active-offer application are not configured. Quotes currently disable these charges/discounts by design; confirm business policy before representing quotes as final production prices.

## Verification performed

- `npm test`: **15 passed, 0 failed**. Coverage is limited to pure pricing, payment-split, and Razorpay signature tests.
- `node --check`: passed for the main API, branding API, authentication/configuration, checkout services, and directly related schemas.
- `git diff --check`: reports pre-existing trailing whitespace in `pdt.js`; no formatting changes were made as part of the read-only review.
- MongoDB, Razorpay sandbox, HTTP route, and browser integration tests were not run. No production-readiness conclusion is possible without them.

## Recommended remediation order

1. Add guarded order/payment state transitions and durable refund/cancellation reconciliation, with route-level tests.
2. Check existing `UserId`/`walletId` duplicates and sequence-counter state, then add appropriate uniqueness constraints only after safely reconciling legacy data.
3. Correct legacy item/favorite identity handling and make reads robust to missing optional fields.
4. Gate startup/readiness on MongoDB, test transactions/indexes against a replica-set test deployment, and add database integration tests.
5. Fix or retire the AngularJS login surface and provide coherent client flows for quote, checkout, payment, and order status.
6. Revoke the previously exposed webhook, review other historical credentials, then run secret scanning and dependency auditing on the refs intended for publication.
7. Confirm pricing policy and test the complete Razorpay/wallet/COD flow in a sandbox before production rollout.

## Remediation performed after the read-only audit

The user requested all reported issues be addressed. The following source fixes were applied after the report was written:

- Added shared order-state rules and tests. Admin fulfillment now rejects orders with unsettled Razorpay amounts; a verified capture restores a retryable failed order to `pending`; a failed payment update is conditional and cannot overwrite a concurrent capture or cancellation.
- Authentication now rejects accounts without a positive, safe-integer `UserId`, which the account-specific database filters require.
- Hardened item/category reads for missing items, empty ratings/likes/images, invalid IDs, and per-item like counts. `GetItemById` no longer filters on the nonexistent `likes.userId` path.
- Added a stable `userId` field for new favorite records, validated favorite inputs, handled missing menu items, and removed error-path throws after sending responses.
- Protected the dashboard image-generation endpoint with authenticated admin authorization and handled missing restaurant-offer item references.
- Repaired the existing AngularJS login wiring and response handling; corrected local script paths, token header use, login-state checks, and sign-out behavior.
- Corrected the package entry point and moved runtime commands to `scripts`.
- Replaced registration's read-then-increment user and wallet ID allocation with MongoDB-backed atomic counters that seed from existing maximum IDs. The allocator does not create new unique indexes; legacy duplicates and production counter state must be reviewed before rollout.

**Remaining blockers:** Existing user/wallet IDs and sequence-counter state need review against a safe database copy before deployment. Existing favorite records need a database-aware backfill to populate the new stable `userId`. Refund timeouts and provider retries still require a durable reconciliation design validated with Razorpay sandbox behavior. Registration still spans multiple writes without a transaction. These changes were not attempted without a safe MongoDB deployment and provider test environment.

**Post-change verification:** The expanded suite passed 22 tests, including authentication and order-state tests. Syntax checks passed for all 44 first-party JavaScript files. MongoDB transaction, existing-data migration, HTTP route, browser, and Razorpay sandbox tests remain outstanding.
