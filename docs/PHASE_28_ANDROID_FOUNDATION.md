# Phase 28 — Android Foundation (Technical Design Document)

**Status:** Design only. No Android UI, no Flutter/React Native, no client code.
**Goal:** Define the architecture + backend requirements so Android development can begin *safely* on a stable contract.

---

## 0. Executive summary

The backend is **~70% Android-ready**. Core data (auth, cards, decks, FSRS scheduling, idempotent batch reviews, incremental sync, object-storage media, AI quotas, telemetry) already exists and is platform-neutral JSON over HTTPS. **Three gaps must close before Android work starts:**

1. **Refresh tokens + revocation** — today there is only a single 7-day access token; mobile needs rotation + logout-all.
2. **Sync deletion tombstones** — `GET /sync` propagates creates/updates but **not deletions**, so offline clients can resurrect deleted cards.
3. **A frozen, versioned API contract** — documented below as the source of truth for the Android team.

Everything else (offline review queue, media caching) is a *client* concern the current API already supports.

---

## 1. Android architecture

```
┌──────────────────────── Android App ────────────────────────┐
│ UI (Compose)  ─────────────────────────────────────────────  │
│ Repository layer (single source of truth = local DB)          │
│   ├─ Room/SQLite : decks, cards, schedules, review_queue      │
│   ├─ DataStore   : tokens, lastSyncAt, settings               │
│   └─ FSRS engine : LOCAL scheduling (mirror of backend)       │
│ Sync engine (WorkManager)                                     │
│   ├─ pull: GET /sync?since=lastSyncAt                         │
│   ├─ push: POST /reviews/batch  (idempotent)                  │
│   └─ media: download URLs → file cache (LRU)                  │
│ Network (Retrofit/OkHttp + auth interceptor + token refresh)  │
└───────────────────────────────────────────────────────────────┘
                         │ HTTPS / JSON / Bearer
┌───────────────────────▼───────────────────────────────────────┐
│ Backend (Express/Prisma/Postgres) — unchanged contract         │
│ Supabase Storage (public media URLs, CDN)                      │
└────────────────────────────────────────────────────────────────┘
```

**Principles**
- **Offline-first:** the local DB is the source of truth; the network is a sync transport. The UI never blocks on the network.
- **Local FSRS:** scheduling runs offline on-device; the server remains authoritative on sync (idempotent replay reconciles).
- **Stateless media:** images/audio are URLs cached as files; never store blobs in the mobile DB.

---

## 2. API audit

Legend: ✅ ready · ⚠️ usable with caveats · ❌ missing.

| Endpoint | Auth | Android | Offline | Sync | Media | Notes |
|---|---|---|---|---|---|---|
| `POST /api/auth/register` | – | ✅ | – | – | – | Returns access token. |
| `POST /api/auth/login` | – | ⚠️ | – | – | – | **Access token only — no refresh.** |
| `POST /api/auth/refresh` | – | ❌ | – | – | – | **Missing.** Required. |
| `POST /api/auth/logout` | ✅ | ❌ | – | – | – | **Missing** (revocation). |
| `GET /api/users/profile`·`PATCH` | ✅ | ✅ | cache | – | – | Includes `plan` (Phase 26B). |
| `DELETE /api/users/account` | ✅ | ✅ | – | – | – | |
| `GET /api/decks` · `POST` · `PATCH /:id` · `DELETE /:id` | ✅ | ✅ | queue | ⚠️ | – | Deletes lack tombstones. |
| `GET /api/cards/*` · `POST` · `PATCH /:id` · `DELETE /:id` | ✅ | ✅ | queue | ⚠️ | ✅ | `imageUrl`/`audioUrl` are URLs (Phase 27). |
| `POST /api/cards/{grammar,sentence}` | ✅ | ✅ | queue | ✅ | ✅ | |
| `GET /api/cards/{saved,word-status,stats}` | ✅ | ✅ | cache | – | – | |
| `GET /api/reviews/due` | ✅ | ✅ | local | – | – | Mobile computes due locally too. |
| `POST /api/reviews/submit` | ✅ | ✅ | – | – | – | Single; prefer batch on mobile. |
| `POST /api/reviews/batch` | ✅ | ✅ | ✅ | ✅ | – | **Idempotent by `clientReviewId`.** Mobile's push path. |
| `GET /api/sync?since=` | ✅ | ✅ | ✅ | ⚠️ | ✅ | Incremental by `updatedAt`; **no deletions**. |
| `GET /api/dictionary/search` | – | ✅ | bundle | – | – | Public; bundle JMdict on-device for offline. |
| `GET /api/dictionary/{ai,ai-sentence}` | ✅ | ✅ | – | – | – | Online-only; quota'd (Phase 26B). |
| `POST /api/media/upload` | ✅ | ✅ | – | – | ✅ | Mobile capture → URL (Phase 27). |
| `POST /api/integrations/anki/*` | ✅ | ⚠️ | – | – | – | Desktop-oriented; defer on mobile. |
| `POST /api/telemetry` · `GET /metrics` | ✅ | ✅ | buffer | – | – | Reuse the Phase 25I.2 buffer pattern. |
| `POST/GET /api/telemetry/health` | ✅ | n/a | – | – | – | Server/CI only. |

**Verdict:** data plane is ready; **auth plane and sync-deletes are the blockers.**

---

## 3. Missing backend requirements (must-do before Android)

**P0 — blockers**
1. **Refresh tokens** (`RefreshToken` table + `/auth/refresh` + rotation) — §4.
2. **Logout/revocation** (`/auth/logout`, `/auth/logout-all`) — §4.
3. **Sync deletion tombstones** — soft-delete (`deletedAt`) on `Deck`/`Card` (and grammar/sentence), and include deleted ids in `GET /sync` so clients can remove locally. Without this, offline edits resurrect deleted rows.

**P1 — strongly recommended**
4. **API versioning** — mount under `/api/v1` (or `Accept-Version` header) and freeze the contract; Android ships against a pinned version.
5. **Sync pagination + server cursor** — `GET /sync` returns `nextCursor` + `hasMore` and a `serverTime` to use as the next `since` (avoids clock skew; bounds cold-sync payloads).
6. **`updatedAt` index review** on `Card`/`Deck`/`ReviewLog` for `gt: since` scans.

**P2 — later**
7. Push notifications (FCM) for review reminders.
8. Signed/short-lived media read URLs if media becomes private.
9. Account-delete cascade confirmation + media purge.

---

## 4. Refresh-token design

**Model (additive, no change to existing tables):**
```
RefreshToken { id, userId, tokenHash (sha256), familyId, expiresAt,
               revokedAt?, replacedById?, userAgent?, createdAt }
```

**Flow**
- `login`/`register` → `{ accessToken (15 min, JWT), refreshToken (30 d, opaque random) }`. Store only the **hash** server-side.
- `POST /auth/refresh { refreshToken }` → verify hash + not expired/revoked → **rotate**: revoke the presented token, issue a new pair in the same `familyId`.
- **Reuse detection:** if a *revoked* refresh token is presented → revoke the whole `familyId` (theft response) → force re-login.
- `POST /auth/logout` → revoke the presented refresh token. `POST /auth/logout-all` → revoke the family/user.
- Access tokens stay stateless (short TTL); revocation lives on the refresh layer.

**Client:** OkHttp `Authenticator`/interceptor refreshes on `401`, single-flight (one refresh at a time), persists the new pair to encrypted DataStore.

---

## 5. Offline sync design

**Local model:** every row carries `serverUpdatedAt`, `dirty` (locally modified), `pendingDelete`. Reviews go to an append-only `review_queue` with a client-generated `clientReviewId` (UUID).

**Pull (incremental):**
`GET /sync?since=<lastServerTime>` → `{ serverTime, decks[], cards[], schedules[], deletedCardIds[], deletedDeckIds[], nextCursor? }`. Apply non-dirty rows; store `serverTime` as next `since`. (`deleted*` arrays require the §3.3 tombstones.)

**Push (idempotent replay):**
- Reviews → `POST /reviews/batch` with `clientReviewId`; **server already dedupes** (Phase 21B) → safe to retry after crashes/timeouts. On ack, clear the queue.
- Card/deck edits → POST/PATCH/DELETE; tag with `clientMutationId` for at-least-once safety (P1).

**Conflict handling**
- **Reviews:** commutative + idempotent → replay in `reviewedAt` order; server recomputes FSRS; duplicates ignored. No conflict.
- **Card/deck fields:** **last-write-wins** by `updatedAt`; if local `dirty` and server `updatedAt > localBase`, server wins for non-content fields, keep a local "unsynced edits" flag for user-content fields (rare on mobile). 
- **Delete vs edit:** delete wins (tombstone) — surfaced to the user as "card was removed on another device."

**Scheduling:** FSRS runs locally for instant UX; the batch push + next pull reconcile to the server's authoritative schedule.

---

## 6. Media strategy

- **Storage:** URLs only (Phase 27). New cards already carry Supabase public URLs; legacy cards may carry `data:` URLs — the client must handle **both** (render `data:` inline; download `https:` to the file cache).
- **Download:** lazy, on first display; `Cache-Control: 31536000` (already set on upload) → immutable, long-lived caching. Use OkHttp disk cache + a separate LRU file cache for audio.
- **Caching:** key by URL; images via Coil (memory+disk), audio via a file LRU.
- **Storage limits (device):** cap media cache (e.g. **250 MB** default, user-configurable 100–1000 MB); LRU-evict; never let media block sync of card data.
- **Upload (mobile capture, later):** `POST /media/upload` already accepts base64 data URLs with validation/size caps; mobile reuses it.
- **Offline:** cached media plays offline; uncached shows a placeholder + "download when online."

---

## 7. Performance estimates

Assume a card row ≈ **0.5–1 KB JSON** (URLs, not blobs — thanks to Phase 27).

| Scenario | Estimate |
|---|---|
| **Cold sync**, 2,000 cards + 50 decks + 5,000 schedules | ~3–6 MB JSON (gzip ~1–2 MB); 1–3 s on 4G; **paginate** to bound memory (P1). |
| **Incremental sync** (daily, ~50 changed) | ~50–100 KB; <0.5 s. |
| **Review push**, 200 offline reviews | ~40 KB batch; idempotent; <0.5 s. |
| **Media cold load**, 500 cards w/ image+audio | ~75 MB (≈150 KB/card) — **lazy + cached**, never bulk-downloaded. |
| **Offline DB footprint**, 2,000 cards | ~3–5 MB SQLite (text), excl. media cache. |
| **Bandwidth/day** (active user) | <0.5 MB sync + on-demand media. |

**Pre-Phase-27 contrast:** the same cold sync with inline base64 media would have been **50–150 MB** — mobile-prohibitive. Phase 27 is what makes Android viable.

---

## 8. Risk analysis

| Risk | Sev | Likelihood | Mitigation |
|---|---|---|---|
| No refresh token → 7-day forced re-login, poor mobile UX | High | Certain | §4 (P0). |
| Sync lacks deletions → resurrected cards / ghost data | High | High | §3.3 tombstones (P0). |
| Unversioned API → backend change breaks shipped app | High | Med | `/api/v1` freeze (P1). |
| Cold sync OOM on large accounts | Med | Med | Pagination + cursor (P1). |
| Clock skew on `since` (client vs server time) | Med | Med | Server returns `serverTime`; client echoes it, never uses local clock. |
| Local vs server FSRS drift | Med | Low | Server authoritative; reconcile on each sync; share FSRS params/constants. |
| Media cache unbounded → disk pressure | Med | Med | LRU cap (§6). |
| Token theft | Med | Low | Rotation + reuse-detection family revoke (§4). |
| Legacy `data:` media not handled on mobile | Low | Med | Client supports both URL types (§6). |

---

## 9. Android MVP scope

**In (MVP):**
- Login/register + **refresh-token** session; logout.
- Offline-first review loop: local FSRS, `GET /reviews/due` mirror, **batch** push, incremental pull.
- Card/deck browse (read), media display with file cache (handles `data:` + `https:`).
- Offline dictionary (bundled JMdict) + online AI lookup (quota-aware, graceful when offline/over quota).
- Settings, telemetry buffer (reuse 25I.2 pattern).

**Out (post-MVP):**
- Card creation/editing on mobile (browser extension remains primary capture).
- Anki integration (desktop-oriented).
- Subtitle/video mining (extension-only).
- Push notifications, social, premium purchase UI.

**Definition of "safe to start Android":** P0 items (refresh tokens, logout, sync tombstones) merged + `/api/v1` contract frozen. Until then, Android work risks building on a moving, mobile-hostile auth/sync surface.

---

## 10. Recommended backend sequence (pre-Android)

1. **Phase 28.1 — Auth hardening:** `RefreshToken` model + `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, access-token TTL → 15 min, rotation + reuse-detection.
2. **Phase 28.2 — Sync completeness:** soft-delete tombstones on `Deck`/`Card`/grammar/sentence; `GET /sync` returns `deleted*Ids` + `serverTime` + pagination cursor.
3. **Phase 28.3 — Contract freeze:** mount `/api/v1`, publish this contract as the Android source of truth.

Only then begin the Android client (separate repo).

> No code shipped in Phase 28 — this document is the deliverable. Existing review, sync, FSRS, AI, and media systems are unchanged.
