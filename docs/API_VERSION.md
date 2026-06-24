# API Versioning & Contract Policy

_Phase 28.3 — effective from the v1 freeze._

## Base URLs

| Prefix | Status | Use |
|---|---|---|
| `/api/v1/*` | **Frozen (stable)** | All new clients — **Android targets this.** |
| `/api/*` | Legacy alias | Existing web app + browser extension. Identical routing to v1; retained for backward compatibility. |
| `/api/v2/*` | Reserved | Not implemented. Routing structure is ready (a second router mount). |

Both prefixes are served by the **same router instance**, so behavior is identical today. The distinction is the *contract guarantee*: `/api/v1` will not change in breaking ways (see below); `/api` is an unversioned convenience that may eventually be deprecated in favor of `/api/v1`.

## Versioning policy (what "frozen" means for v1)

Allowed without a version bump (non-breaking):
- ✅ Adding a **new endpoint**.
- ✅ Adding an **optional field** to a request.
- ✅ Adding a **field to a response** (clients must ignore unknown fields).
- ✅ Adding a new **error `code`** value.
- ✅ Relaxing a validation rule.

Requires a new version (`/api/v2`):
- ❌ Removing or renaming a response field.
- ❌ Changing a field's type or meaning.
- ❌ Removing an endpoint or changing its path/method.
- ❌ Making an optional request field required, or tightening validation in a way that rejects previously valid input.
- ❌ Changing the error envelope shape.

## Error contract (v1)

All v1 errors use a single envelope:

```json
{ "error": { "code": "STRING_CODE", "message": "human readable", "details": <optional> } }
```

- `code` — stable, machine-readable (e.g. `NO_TOKEN`, `INVALID_TOKEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `DECK_NOT_FOUND`, `CARD_NOT_FOUND`, `EMAIL_EXISTS`, `INVALID_CREDENTIALS`, `REFRESH_REUSE`, `REFRESH_EXPIRED`, `MEDIA_NOT_CONFIGURED`, `INTERNAL_ERROR`). Clients branch on `code`, never on `message`.
- `message` — display/debug text; may change without a version bump.
- `details` — optional structured context (e.g. Zod validation issues array). Present for `VALIDATION_ERROR`.

**Legacy `/api/*`** keeps the historical shape `{ "error": "<message>", "code": "..." }` (string `error`) so existing clients that read `error` as a string do not break. New clients must use `/api/v1`.

### Auth errors
- Missing token → `401 NO_TOKEN`. Invalid/expired access token → `401 INVALID_TOKEN`.
- Refresh: `401 INVALID_REFRESH | REFRESH_EXPIRED | REFRESH_REUSE`. On `REFRESH_REUSE` the whole token family is revoked → client must re-login.

### Validation errors
- `400 VALIDATION_ERROR` with `details` = Zod issues. Same code across all validated endpoints.

## Pagination conventions (v1)

Two shapes are in use; both are stable:
- **Cursor (sync):** `GET /sync?since=<ISO|epochMs>` → `{ ..., serverTime, nextCursor }`. Clients pass the previous `serverTime` as the next `since`; `nextCursor` is reserved for future multi-page responses (currently `null` = single page).
- **Offset (lists, e.g. review history):** `?skip=&take=` with the payload including the page items and a total count.

New list endpoints should prefer the cursor shape (`serverTime`/`nextCursor`) for mobile-friendly incremental sync.

## Deprecation policy

1. A deprecated endpoint/field is **documented here** with a deprecation date and replacement.
2. It keeps working for **≥ 1 major version / ≥ 6 months** after the announcement.
3. Deprecations are announced in release notes and (where feasible) via a `Deprecation` response header.
4. Nothing is removed from `/api/v1` — removals only happen by introducing `/api/v2`.

_Currently deprecated:_ none. (The legacy `/api/*` prefix is **not** deprecated yet; it remains a supported alias.)

## Android compatibility policy

- Android **must** call `/api/v1` exclusively and parse the **error envelope** (`error.code`).
- Android must **ignore unknown response fields** (forward compatibility) and tolerate new `error.code` values (treat unknown codes as a generic failure).
- Breaking changes for Android only ever arrive as `/api/v2`; the app pins to `v1` until it explicitly migrates.
- Access tokens are short-lived (15 min); clients must implement refresh-token rotation against `/api/v1/auth/refresh` (see Phase 28.1).
- Deletions arrive as tombstone id arrays from `/api/v1/sync` (see Phase 28.2); clients must apply them (remove record + schedule + cached media).

## Adding /api/v2 later (structure)

`createApp()` builds one `apiRouter()` and mounts it at `/api` and `/api/v1`. To introduce v2: build a second router (`apiRouterV2()`), mount it at `/api/v2`, and leave the v1 mount untouched. Shared, unchanged modules can be reused across both routers; only changed endpoints are re-implemented for v2.
