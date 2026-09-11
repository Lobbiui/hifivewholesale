# Hi-Five Supply Wholesale

## Clover + Seven Spaces Stock Implementation Plan

**Version:** 1.2

**Prepared:** September 10, 2026

**Status:** Phase 1 in progress; Clover sandbox connectivity and inventory reads verified
**Canonical document:** This Markdown file is the living technical plan. The PDF is a client-facing snapshot of the same plan.

---

## 1. Purpose

Build a secure and recoverable inventory integration for Hi-Five Supply that supports:

- An approved-buyer online wholesale website.
- A central warehouse that receives inventory and fulfills wholesale orders.
- Multiple retail locations, each with its own Clover merchant ID.
- Seven Spaces Stock for purchasing, on-hand stock, adjustments, min/max planning, and transfers.
- Seven Spaces Multi Store for connected-location reporting and stock transfers.
- Authorize.net for online wholesale payments.
- A production database, secure administrator access, operational visibility, and audit history.

The work must be delivered in gated phases. No phase advances until its acceptance tests pass.

## 2. Confirmed operating model

Peter confirmed that each retail kiosk and the warehouse has its own Clover merchant account. Seven Spaces connects those locations so they can request and transfer stock. Inventory is received into the warehouse and moved to retail stores on a weekly min/max replenishment cycle.

Seven Spaces support subsequently confirmed the external-commerce behavior:

- Stock has no separate public API; the website integrates through Clover.
- Changes made in Stock are reflected in Clover Inventory counts.
- A Clover order that references the correct Clover inventory item ID is the supported online-order signal.
- Stock deducts when the inventory item is added to the Clover order.
- Production order polling is approximately every 30 seconds and normally completes within one minute, subject to load.
- Deleting an order or line item can restore inventory when Stock's `auto restock` option is enabled.
- Test-flagged Clover orders are ignored by Stock, so production-mode behavior needs a controlled pilot before launch.

Seven Spaces documentation confirms that its Stock app:

- Reads Clover product information.
- Manages stock quantity and cost through purchase orders.
- Decrements stock when a product is added to a Clover order.
- Can disable Clover's normal per-sale item-count update to avoid duplicate deductions.
- Supports stock reconciliation, min/max levels, purchase orders, transfers, and receiving.
- Decreases the source location when a transfer is completed.
- Creates an on-order purchase order at the destination.
- Increases destination availability when the destination receives the transfer.

## 3. Non-negotiable architecture decisions

### 3.1 Warehouse-only online availability

The wholesale storefront will sell from the warehouse inventory pool unless the client later authorizes retail-store fulfillment.

```text
onlineAvailable = warehouseOnHand
                - activeWebsiteReservations
                - transferAllocationsNotAlreadyReflected
                - safetyStock
```

The implementation must prove whether Seven Spaces has already reduced warehouse on-hand before applying any additional transfer allocation. Never subtract the same inventory twice.

### 3.2 Seven Spaces is the operational inventory authority

For this client, Seven Spaces Stock is the operational on-hand ledger. Clover remains the supported integration surface for merchant identity, item data, orders, and mirrored inventory counts. The website reads warehouse availability through Clover and must reconcile it against observed Stock behavior during the controlled pilot.

### 3.3 One connection per Clover merchant

Every warehouse or retail merchant must have its own merchant-specific authorization and connection state. A single access token cannot represent all locations.

### 3.4 One inventory mapping per product, variant, and location

The same commercial product may have different Clover item IDs in the warehouse and stores. Product names are not stable identifiers. SKU and UPC can assist matching, but ambiguous records require administrator review.

### 3.5 No double inventory decrement

The website must use exactly one verified stock-decrement path. It must not both adjust Clover stock and create an order that causes Seven Spaces to adjust the same stock.

### 3.6 Cases and retail units are different concepts

Wholesale case quantities must be explicitly converted to Seven Spaces/Clover inventory units.

```text
inventoryUnitsToDeduct = orderedCases * unitsPerCase
```

Every sellable wholesale variant requires a validated `unitsPerCase` value.

### 3.7 Website orders remain canonical

The website database owns the e-commerce order, customer, payment, fulfillment, and recovery state. A Clover order is an operational mirror used only when the approved inventory workflow requires it.

---

## 4. Target system-of-record matrix

| Data | System of record | Notes |
|---|---|---|
| Warehouse on-hand quantity | Seven Spaces Stock | Confirm how it is exposed through Clover or vendor-supported interfaces. |
| Retail on-hand quantity | Seven Spaces Stock per merchant | Operational visibility only for initial website release. |
| Item identity per merchant | Clover | Persist merchant ID and Clover item ID. |
| Wholesale product content | Website database | Images, descriptions, SEO, case price, tiers, case size, publish state. |
| Wholesale price | Website database | Do not let retail price synchronization overwrite wholesale pricing. |
| Purchase orders and receiving | Seven Spaces Stock | Warehouse operating workflow. |
| Store transfers | Seven Spaces Stock + Multi Store | Website observes results; it does not originate transfers in the first release. |
| Website order | Website database | Canonical order and order-item snapshots. |
| Payment | Authorize.net | Tokenized/hosted flow; never store raw card data. |
| Optional operational order mirror | Warehouse Clover merchant | Only after the decrement behavior is proven. |
| Buyer approval | Website database | Secure admin workflow, not browser storage. |
| Notifications | Resend | Order and operational alerts after implementation approval. |

## 5. Target architecture

```text
Approved Wholesale Buyer
          |
          v
Next.js Wholesale Website
          |
          v
Server API and Domain Services ---------------- PostgreSQL
          |                                         |
          |                                         +-- products and location mappings
          |                                         +-- orders and order items
          |                                         +-- reservations and locks
          |                                         +-- integration events and audit
          |
          +---------------- Authorize.net
          |
          +---------------- Warehouse Clover Merchant
                                      |
                                      v
                            Seven Spaces Stock
                                      |
                                      v
                            Seven Spaces Multi Store
                              /        |         \
                        Retail A   Retail B   Retail C
```

### Application components

1. **Storefront service** - approved wholesale browsing, cart, checkout, and order history.
2. **Admin service/UI** - products, mappings, inventory health, order exceptions, users, and audit history.
3. **Integration service** - Clover OAuth, typed API client, Seven Spaces workflow adapter, and Authorize.net adapter.
4. **Webhook receiver** - verifies, persists, and acknowledges Clover events.
5. **Durable job processor** - processes webhook events, reconciliation, retries, token refresh, and alerts.
6. **PostgreSQL** - persistent source for application state, locks, idempotency, and recovery.

---

## 6. Delivery phases

## Phase 0 - Business and vendor discovery

### Build

No integration code. Document the exact operating rules and obtain Seven Spaces guidance.

### Actions

1. Obtain the complete location list, marking the warehouse and each retail store.
2. Record each location's 13-character Clover `merchantId`; do not confuse it with a processor MID.
3. Confirm whether all locations use Seven Spaces Stock and Multi Store.
4. Confirm whether online wholesale ships only from the warehouse.
5. Confirm units per case for every initial wholesale product.
6. Confirm whether SKUs and UPCs are consistent across locations.
7. Send the vendor questions in Section 14 to Seven Spaces support.
8. Select one harmless test item that exists in the warehouse and one store.

### Acceptance gate

- Written location and merchant-ID inventory exists.
- Warehouse fulfillment responsibility is documented.
- Case-to-unit conversion is known for test products.
- Seven Spaces support has confirmed the recommended external e-commerce integration path.
- No unresolved assumption can cause a double inventory deduction.

## Phase 1 - Production backend foundation

### Build

Replace browser-only demo state with a secure server foundation while preserving the approved visual design.

### Actions

1. Add managed PostgreSQL for staging and production.
2. Select and configure an ORM/migration system compatible with the installed Next.js version.
3. Add secure admin and super-admin authentication.
4. Add password reset, expiring sessions, role permissions, CSRF protection, and rate limiting.
5. Persist products, variants, customers, buyer applications, carts, orders, and audit events.
6. Add environment validation and a secret-free `.env.example`.
7. Add structured server logging with correlation IDs.
8. Add automated database backups and a tested restore procedure.

### Acceptance gate

- Demo browser storage is no longer authoritative.
- Admin roles are enforced server-side.
- Database migration, backup, and restore tests pass.
- No secrets appear in GitHub, browser bundles, or logs.

## Phase 2 - Location and catalog model

### Build

Create the multi-merchant product and inventory schema.

### Core entities

- `organizations`
- `locations`
- `clover_connections`
- `products`
- `product_variants`
- `location_item_mappings`
- `inventory_snapshots`
- `inventory_reservations`
- `inventory_events`
- `integration_jobs`
- `orders`
- `order_items`
- `order_exceptions`
- `audit_events`

### Required mapping fields

| Field | Purpose |
|---|---|
| organizationId | Groups all Hi-Five locations. |
| locationId | Warehouse or a specific retail store. |
| cloverMerchantId | Stable Clover merchant context. |
| cloverItemId | Stable item identifier within that merchant. |
| websiteVariantId | Website sellable variant. |
| sku | Matching and operational reference. |
| upc | Barcode matching aid. |
| unitsPerCase | Wholesale case conversion. |
| mappingStatus | Mapped, ambiguous, missing, disabled, or review. |

### Acceptance gate

- The same website variant can map to different Clover item IDs by location.
- Duplicate/missing SKUs never merge silently.
- Warehouse mappings are distinguishable from retail mappings.
- Case conversion is required before a variant can be sold.

## Phase 3 - Clover sandbox connection

### Build

Create a private Clover web app in sandbox and implement merchant-specific v2 OAuth.

### Actions

1. Create the sandbox private web app.
2. Configure the staging Site URL and Alternate Launch Path.
3. Request only required permissions, starting with merchant, inventory, and order permissions needed by the proven workflow.
4. Implement connect, callback, state validation, token exchange, and token refresh.
5. Encrypt access and refresh tokens at rest.
6. Connect the sandbox warehouse merchant.
7. Connect at least one sandbox retail merchant separately.
8. Add connection states: `CONNECTED`, `REAUTH_REQUIRED`, `ERROR`, and `DISCONNECTED`.

### Acceptance gate

- Warehouse and retail merchants have distinct encrypted token records.
- Token refresh survives rotation and application restart.
- A rejected refresh stops destructive actions and shows `REAUTH_REQUIRED`.
- Tokens never reach the browser or logs.

## Phase 4 - Seven Spaces behavior proof

### Goal

Prove the exact quantity and order behavior before choosing the stock-write strategy.

### Test matrix

1. Receive a purchase order in warehouse Seven Spaces Stock.
2. Compare Seven Spaces on-hand with Clover Inventory API output.
3. Make a physical Clover sale and observe both systems.
4. Create an unpaid Clover API order with the test item.
5. Create a paid/completed Clover API order with the test item.
6. Cancel one API-created order.
7. Refund/void one API-created order.
8. Change standard Clover item stock directly in sandbox.
9. Complete a warehouse-to-store transfer.
10. Receive the destination purchase order partially and then fully.
11. Record all quantities and timestamps before and after every operation.

### Decision gate

| Proven result | Integration strategy |
|---|---|
| API-created Clover order decrements Seven Spaces exactly once | Mirror confirmed website orders to warehouse Clover; do not make a separate stock adjustment. |
| API order does not decrement, but supported Clover stock write updates Seven Spaces | Use the documented stock operation and verify it. |
| Seven Spaces exposes a supported direct API/webhook | Prefer the vendor-supported interface, using Clover for identity/order mirroring as required. |
| No reliable supported write path | Stop. Escalate to Seven Spaces support before checkout integration. |

### Acceptance gate

- One and only one inventory-decrement strategy is selected.
- Cancellation and refund restock behavior is documented.
- Transfer timing is documented.
- The authoritative read path for warehouse on-hand is proven.

## Phase 5 - Initial catalog and inventory import

### Build

Import Clover items per merchant using pagination and create an administrator mapping queue.

### Actions

1. Fetch all warehouse Clover items and required item metadata.
2. Fetch each retail merchant independently for operational visibility.
3. Match existing website variants by confirmed Clover item ID first.
4. Suggest SKU/UPC matches only when unambiguous.
5. Require manual review for duplicates, missing values, and name-only candidates.
6. Preserve website-only descriptions, images, SEO, case prices, and publish settings.
7. Generate an import report with mapped, new, ambiguous, zero-stock, negative-stock, and failed counts.

### Acceptance gate

- All pilot products have approved warehouse mappings.
- Imported inventory matches the proven authoritative quantity.
- No website merchandising content is overwritten.
- Unmatched products cannot accidentally become sellable.

## Phase 6 - Webhooks and reconciliation

### Build

Implement fast event intake plus scheduled correctness checks.

### Webhook requirements

1. Public HTTPS endpoint.
2. Verify the `X-Clover-Auth` value.
3. Validate app and merchant context.
4. Persist each event before responding.
5. Generate deterministic idempotency keys.
6. Return `200 OK` quickly.
7. Process events from a durable database-backed job queue.
8. Fetch authoritative state after receiving the signal.
9. Retry transient failures with capped exponential backoff.

### Reconciliation requirements

- Reconcile warehouse pilot items frequently during testing.
- Begin production around every 5 to 15 minutes, then tune for API limits and volume.
- Compare authoritative on-hand with the website cache.
- Repair drift and record before/after values.
- Alert on repeated drift, missing mappings, authorization errors, and negative stock.

### Acceptance gate

- Duplicate webhooks cause no duplicate action.
- A missed webhook is repaired by reconciliation.
- An intentional cache mismatch is repaired and audited.
- Events from different merchants are routed to the correct location.

## Phase 7 - Authorize.net checkout and inventory control

### Order state machine

```text
DRAFT
  -> STOCK_CHECKED
  -> RESERVED
  -> PAYMENT_AUTHORIZED
  -> ORDER_CONFIRMED
  -> INVENTORY_SYNC_PENDING
  -> INVENTORY_SYNCED
  -> FULFILLMENT_PENDING
  -> COMPLETED
```

Exception states include:

- `PAYMENT_FAILED`
- `OUT_OF_STOCK`
- `INVENTORY_SYNC_PENDING`
- `CLOVER_ORDER_PENDING`
- `CANCEL_PENDING_RESTOCK`
- `REFUND_PENDING_RESTOCK`
- `NEEDS_REVIEW`

### Checkout sequence

1. Validate buyer approval and server-side pricing.
2. Convert ordered cases to inventory units.
3. Acquire database locks for all mapped warehouse variants.
4. Fetch fresh warehouse on-hand through the proven read path.
5. Apply reservations and safety stock.
6. Fail cleanly when any item is unavailable.
7. Create short-lived durable reservations.
8. Submit an idempotent Authorize.net payment request.
9. Create the canonical website order and immutable item snapshots.
10. Execute the single proven inventory-decrement strategy.
11. Verify resulting Seven Spaces/warehouse inventory.
12. Mark the reservation consumed and inventory synchronized.
13. Send confirmation only after the order reaches its confirmed state.
14. Release locks.

### Failure principle

If payment succeeds but inventory synchronization fails, retain the paid order in `INVENTORY_SYNC_PENDING`, retry safely, and alert operations. Never lose a paid order and never repeat a non-idempotent inventory action.

### Acceptance gate

- A wholesale case deducts the correct number of retail units.
- Two simultaneous near-out-of-stock orders do not oversell.
- Payment retry does not double-charge.
- Clover/order retry does not double-decrement Seven Spaces.
- A simulated outage leaves a recoverable paid order.

## Phase 8 - Admin operational controls

### Build

Add a Clover and Seven Spaces operations area to both authorized admin roles, with destructive connection controls restricted as approved.

### Required views

- Warehouse and retail connection status.
- Merchant ID and environment without tokens.
- Last successful webhook and reconciliation.
- Warehouse available, reserved, safety, and sellable quantities.
- Location-by-location inventory matrix.
- Product mapping review queue.
- Manual `Sync now` with permission and audit logging.
- Recent sync failures and retry status.
- Drift and correction history.
- Paid-but-inventory-pending orders.
- Cancellation/refund restock exceptions.
- Reauthorize and disconnect controls with confirmation.

### Acceptance gate

- An operator can diagnose inventory health without database access.
- Every manual action has an actor, timestamp, reason, and result.
- Super-admin-only controls are enforced server-side.

## Phase 9 - Full staging pilot

### Pilot scope

- One warehouse merchant.
- One retail merchant.
- Five to ten products covering single units, cases, variants, and a low-stock item.
- One full transfer and one partial receiving test.
- Authorize.net sandbox payments only.

### Acceptance gate

- All tests in Section 12 pass repeatedly.
- No unresolved quantity drift exists.
- Operations staff can recover every simulated failure through the admin workflow.
- The client signs off on inventory timing and order visibility.

## Phase 10 - Production cutover

### Actions

1. Create/configure the production Clover private app.
2. Complete Clover approval requirements.
3. Configure production HTTPS URLs and secrets.
4. Authorize the warehouse merchant first.
5. Import and manually approve a small pilot catalog.
6. Run a one-product receiving, sale, cancellation, and transfer pilot.
7. Enable a small group of approved wholesale buyers.
8. Monitor every order and reconciliation during the controlled launch.
9. Connect retail merchants for visibility only after warehouse behavior is stable.
10. Expand catalog and buyer access gradually.

### Go-live acceptance gate

- No double deductions.
- No oversells.
- No secrets or tokens exposed.
- Reconciliation remains clean through the pilot window.
- Backup, restore, alerting, and rollback procedures are verified.

---

## 7. Security and secret management

- All Clover and Authorize.net calls are server-side.
- Use expiring Clover v2 OAuth tokens.
- Encrypt Clover token pairs at rest with a separately managed application key.
- Store runtime secrets in DigitalOcean secret environment variables.
- Never commit real `.env` files, tokens, keys, webhook auth codes, or debug responses.
- Use hosted/tokenized Authorize.net payment fields; never store raw card data.
- Enforce admin and super-admin permissions at the server/API layer.
- Rate-limit authentication, OAuth, webhook, sync, and checkout endpoints appropriately.
- Redact tokens, payment values, and sensitive customer data from logs.
- Maintain immutable audit records for connection, mapping, inventory, refund, and manual sync actions.

## 8. Deployment model

| Environment | Website | Database | Clover | Authorize.net | Seven Spaces |
|---|---|---|---|---|---|
| Local | UI and unit testing | Local isolated DB | Sandbox only through safe callback | Sandbox | Test data only |
| Staging | Stable HTTPS app | Managed staging PostgreSQL | Sandbox merchants | Sandbox | Sandbox/test merchants |
| Production | Customer-facing app | Managed production PostgreSQL | Production merchants | Production | Live client locations |

DigitalOcean should ultimately include:

- Storefront/API application service.
- Managed PostgreSQL.
- Durable scheduled-job/worker strategy.
- Managed secrets.
- Centralized logs and alerts.
- Automated database backups.
- Health checks for web, database connectivity, and job freshness.

## 9. GitHub delivery workflow

1. Create a dedicated feature branch for each phase.
2. Keep integration services separate from presentation components.
3. Add schema migrations and tests in the same change as each model.
4. Never put production credentials in preview deployments.
5. Require lint, type checking, unit tests, integration tests, and production build before merge.
6. Use pull requests with explicit acceptance-gate evidence.
7. Tag production releases and retain a rollback target.

## 10. Current repository gap assessment

The current Hi-Five build is transitioning from a client preview to a production backend. As of September 9, 2026:

- Products are hard-coded.
- Buyer carts are persisted in the database and restored across signed-in sessions.
- Buyer approval, account activation, password login, expiring sessions, and protected-route access are server-enforced.
- Checkout persists a retry-safe pre-payment wholesale order request; payment, inventory reservation, and Clover order creation remain intentionally disabled until mappings are verified.
- A PostgreSQL-compatible schema, migrations, local persistent database, and database health check are implemented; a managed production database is not connected yet.
- New wholesale buyer applications and administrator approval decisions are validated and persisted server-side.
- Admin and super-admin passwords, lockout controls, expiring database sessions, HTTP-only cookies, role checks, application decisions, buyer-organization creation, and decision audit events are now server-backed.
- Approved buyers receive a time-limited activation link, create a secure password, and gain access through an HTTP-only session cookie.
- Protected catalog routes are intercepted before rendering when no valid approved-buyer session exists.
- Persistent carts and idempotent wholesale order-request history are implemented without prematurely decrementing Clover or Seven Spaces inventory.
- A server-only Clover client is implemented and verified against the sandbox merchant for merchant and inventory reads.
- Clover order writes, production OAuth, Authorize.net, and Resend are not implemented yet.
- There is no durable webhook receiver, queue, reconciliation job, or inventory lock.
- The current DigitalOcean app has a storefront service but no managed database or worker.

The visual storefront and admin concepts should be preserved while their data and security foundations are replaced phase by phase.

## 11. Inventory invariants

These rules must be enforced in code and tests:

1. Every sellable website variant has exactly one approved warehouse mapping.
2. Every mapped variant has a positive `unitsPerCase`.
3. Website sellable quantity is never greater than verified warehouse availability.
4. Cached quantity is never trusted as the only checkout check.
5. A website order has at most one successful inventory decrement operation.
6. Duplicate webhooks and retries are safe no-ops after idempotency checks.
7. Inventory cannot become sellable at a destination until Seven Spaces receiving makes it available.
8. Negative authoritative stock is unsellable and creates an operational alert.
9. Retail inventory is not included in online availability unless explicitly enabled.
10. Payment success can never be discarded because an integration is temporarily unavailable.

## 12. Minimum end-to-end acceptance matrix

- Warehouse Seven Spaces receiving increases website availability.
- Physical warehouse Clover sale reduces website availability.
- Physical retail sale affects only its retail location.
- Completed warehouse-to-store transfer decreases warehouse availability once.
- Destination transfer remains unavailable while on order.
- Destination receiving increases destination stock without changing warehouse stock again.
- Website sale reduces warehouse stock exactly once.
- One wholesale case deducts the configured number of inventory units.
- Two simultaneous orders cannot oversell.
- Duplicate Clover webhook causes no duplicate action.
- Expired Clover access token refreshes without user impact.
- Rejected refresh token changes the connection to `REAUTH_REQUIRED` and blocks writes.
- Authorize.net retry does not double-charge.
- Payment success followed by Clover/Seven Spaces outage remains recoverable.
- Cancellation and refund follow the approved restock rule exactly once.
- Reconciliation repairs an intentionally introduced mismatch.
- A product missing in one location enters mapping review without being deleted globally.

## 13. Operational ownership

| Responsibility | Owner |
|---|---|
| Seven Spaces workflow and store operations | Hi-Five operations / Peter |
| Merchant IDs and Clover authorization | Hi-Five merchant administrator |
| Case sizes, SKUs, UPCs, and wholesale pricing | Hi-Five catalog owner |
| Website implementation and testing | Development team |
| Clover app and OAuth configuration | Development team with merchant administrator |
| Authorize.net merchant configuration | Hi-Five finance/merchant administrator |
| Production deployment and secrets | Development/operations team |
| Final pilot approval | Hi-Five client owner |

## 14. Questions for Seven Spaces support

Questions 1–7 have enough vendor guidance to begin the Clover-based implementation. The remaining mapping, transfer visibility, rate-limit, and pilot details still require operational confirmation.

1. Is Seven Spaces Stock on-hand quantity exposed through Clover's standard Inventory API?
2. Does Stock update Clover's standard item stock after receiving, adjustment, sale, reconciliation, and transfer?
3. Does a Clover order created through REST or Atomic Orders decrement Seven Spaces Stock?
4. If so, at which lifecycle stage does it decrement: item added, order created, paid, or completed?
5. How does Stock handle cancellation, void, return, partial refund, and full refund for API-created orders?
6. Does Seven Spaces provide a supported API or webhook for Stock quantity, purchase orders, or transfers?
7. What is the recommended integration for an external e-commerce site using Authorize.net?
8. Can authoritative availability be queried independently for each connected merchant?
9. How are products matched across stores: Clover item ID, SKU/product code, UPC, or name?
10. Can transfers or pending transfer requests be queried programmatically?
11. Are there rate limits or event-delivery guarantees relevant to external integrations?
12. Can Seven Spaces provide a sandbox or test procedure covering API-created Clover orders?

## 15. Information required from Hi-Five

- Complete warehouse and retail location list.
- Actual Clover merchant ID for each location.
- Confirmation of which merchant fulfills online wholesale.
- Initial pilot product list.
- SKU, UPC, variant, strength, units per case, wholesale price, and safety stock for each pilot item.
- Cancellation, refund, and return-to-stock rules.
- Transfer scheduling and responsibility.
- Whether retail stores may ever fulfill online wholesale orders.
- Named administrators authorized to connect/disconnect Clover merchants.
- Seven Spaces support response to Section 14.

## 16. Rollback and incident plan

### Trigger conditions

- Evidence of double deduction.
- Website availability exceeds warehouse availability.
- Repeated reconciliation drift.
- Unauthorized merchant or token use.
- Paid orders cannot synchronize inventory within the approved threshold.

### Immediate response

1. Disable new checkout while preserving browsing and existing orders.
2. Stop destructive integration jobs.
3. Preserve all event, order, payment, and inventory logs.
4. Compare website orders, Clover orders, and Seven Spaces adjustments.
5. Restore inventory only through the approved operational workflow.
6. Reconcile every pilot item before reopening checkout.

### Rollback principle

Application rollback must not replay completed inventory or payment operations. Deployments may roll back code, but recovery must use persisted idempotency records and explicit operator review.

## 17. Definition of seamless completion

The integration is ready only when:

- Warehouse staff continue using Seven Spaces without a parallel manual website ledger.
- Retail transfers continue through the existing Seven Spaces workflow.
- Approved online buyers see accurate warehouse availability.
- Website checkout deducts the correct inventory exactly once.
- Operations can see and recover integration exceptions.
- Every merchant connection, mapping, payment, and inventory action is secure and auditable.
- Reconciliation consistently reports no unexplained drift.

---

## 18. Official references

- Seven Spaces products and Stock overview: https://www.7-spaces.com/#stock
- Seven Spaces Stock tutorial: https://7spaces.uservoice.com/knowledgebase/articles/561219-stock-app-tutorial
- Seven Spaces Stock Transfer: https://7spaces.uservoice.com/knowledgebase/articles/759075-stock-transfer
- Clover private apps: https://docs.clover.com/dev/docs/gdp-work-with-private-apps
- Clover v2 OAuth: https://docs.clover.com/dev/docs/use-oauth
- Clover OAuth multi-merchant guidance: https://docs.clover.com/dev/docs/oauth-and-tokens-faqs
- Clover merchant ID guidance: https://docs.clover.com/dev/docs/locating-merchant-id
- Clover webhooks: https://docs.clover.com/dev/docs/webhooks
- Clover inventory FAQs: https://docs.clover.com/dev/docs/inventory-faqs

## 19. Change log

| Version | Date | Change |
|---|---|---|
| 1.2 | September 10, 2026 | Added database-backed administrator and buyer authentication, approval activation links, protected wholesale routes, persistent carts, and idempotent pre-payment order requests. |
| 1.1 | September 9, 2026 | Recorded Seven Spaces vendor guidance, verified Clover sandbox inventory reads, and began the PostgreSQL-backed production foundation. |
| 1.0 | August 20, 2026 | Initial phased implementation plan based on the current website, Peter's operating description, official Seven Spaces documentation, and current Clover documentation. |
