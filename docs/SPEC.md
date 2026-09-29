# Creator Campaign Intelligence Agent (CCIA) Specification

## 1. Architecture Rules
1. **Secrets Isolation**: Secrets (`GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `CLOUD_NL_API_KEY`) are read strictly on the server from environment variables. They are NEVER sent to the client, logged, or returned in any API payload.
2. **Layered Directory Separation**:
   - `server/services/`: `gemini.ts` and `youtube.ts` are the ONLY files making calls to external 3rd-party APIs.
   - `server/repositories/`: The ONLY layer that reads and writes persistence, accessed strictly via typed interfaces (`CampaignRepository`, `UserRepository`, `JobRepository`, `ActivityRepository`).
   - `server/engines/`: Business logic, one folder per engine (pure functions wherever possible).
   - `server/routes/`: Thin HTTP handlers: authenticate, authorize, validate with Zod, invoke repository/engine, respond.
   - `server/jobs/`: Background job runner with concurrency control, cancellation checks, and heartbeat monitoring.
   - `shared/`: Types, Zod validation schemas, configuration constants, formatting utilities used across frontend and backend.
   - `src/`: Client-side UI only (React, React Router, TanStack Query).
3. **No Magic Numbers**: All tunable values reside in `shared/config.ts` (models, weights, timeouts, cache TTLs, rate limits, page sizes).
4. **Strict Zod Validation**: Validate every request body, query parameter, route param, and external API response with Zod.
5. **No Business Logic in React**: Components invoke typed hooks; hooks use a typed API client.
6. **Prompt-Injection Safety**: All third-party / user content is wrapped with `<untrusted_data source="..."> ... </untrusted_data>` delimiters, and system instructions command models never to interpret enclosed content as instructions.

## 2. Data Model
- `users/{uid}`: `uid`, `email`, `displayName`, `photoURL`, `createdAt`, `lastLoginAt`
- `campaigns/{campaignId}`: `id`, `ownerId`, `ownerEmail`, `memberEmails`, `name`, `status` (`draft` | `active` | `completed` | `archived`), `brief`, `settings`, `approvedLineup`, `deletedAt`, `createdAt`, `updatedAt`, `version`
- Subcollections under `campaigns/{campaignId}`:
  - `activity/{activityId}`: Activity log (`actorEmail`, `action`, `entityType`, `entityId`, `summary`, `at`)
  - `creators/{creatorId}`: Creator profiles, scored metrics, channel statistics, and plannedPublishDate (Phase 3)
  - `premortemRuns/{runId}`: Risk simulation reports, overlap matrices, penalties, and approved status (Phase 4)
  - `briefs/{creatorId}`: Tailored creator collaboration brief documents with `versions/{versionId}` subcollection (Phase 5)
  - Subcollections for upcoming phases: `submissions`, `searchPack`, `trackedVideos`, `alerts`, `pulseSummaries`
- `jobs/{jobId}`: `id`, `campaignId`, `ownerId`, `type`, `status`, `progress`, `result`, `error`, `cancelRequested`, `createdAt`, `updatedAt`
- `cache/{key}`: Server-side cache with `value`, `expiresAt`, `createdAt`

## 3. API Conventions & Error Codes
Base URL: `/api/v1`

### Status Codes & Error Codes:
- `400 VALIDATION_ERROR`: Invalid request body, query parameter, or format.
- `401 UNAUTHENTICATED`: Missing or invalid Bearer token.
- `403 FORBIDDEN`: Action requires owner role (e.g. trash, restore, delete permanently, manage members).
- `404 NOT_FOUND`: Resource does not exist, or caller lacks read permissions (never reveals private campaign existence).
- `409 CONFLICT`: Optimistic concurrency version mismatch.
- `422 UNPROCESSABLE`: Invalid state transition or business logic violation.
- `429 RATE_LIMITED`: Exceeded 60 requests/minute per user.
- `500 INTERNAL`: Unhandled server exception.
- `502 / 503 UPSTREAM_ERROR`: External service failure.
- `AI_INVALID_OUTPUT`: Gemini returned JSON not conforming to Zod schema after retry.
- `AI_RATE_LIMITED` / `AI_UNAVAILABLE`: Gemini rate limit or service outage after exponential backoff.
- `JOB_TIMEOUT`: Running job exceeded timeout window.

## 4. Route Map
### API Routes (`/api/v1`):
| Method | Path | Description | Access |
|---|---|---|---|
| GET | `/health` | Server, DB, Secrets health | Public |
| GET | `/campaigns` | List campaigns with filters, sort, cursor | Auth |
| GET | `/campaigns/trash` | List trashed campaigns | Owner Auth |
| POST | `/campaigns` | Create new campaign (`draft`) | Auth |
| GET | `/campaigns/:id` | Get campaign by ID | Owner/Member |
| PATCH | `/campaigns/:id` | Update name/status with version check | Owner/Member |
| DELETE | `/campaigns/:id` | Move to trash (soft delete) | Owner |
| POST | `/campaigns/:id/restore` | Restore from trash | Owner |
| DELETE | `/campaigns/:id/permanent` | Hard delete campaign & subcollections | Owner |
| POST | `/campaigns/:id/duplicate` | Duplicate campaign settings & inputs | Auth |
| GET | `/campaigns/:id/export` | JSON export of campaign | Owner/Member |
| POST | `/campaigns/import` | Validate & import campaign JSON | Auth |
| GET | `/campaigns/:id/activity` | Paginated activity history | Owner/Member |
| GET | `/campaigns/:id/jobs` | Get active jobs for campaign | Owner/Member |
| GET | `/jobs/:jobId` | Get job status & progress | Owner/Member |
| POST | `/jobs/:jobId/cancel` | Request job cancellation | Owner/Member |
| POST | `/campaigns/:id/briefs/generate` | Batch generate briefs for approved lineup | Owner/Member |
| POST | `/campaigns/:id/briefs/:creatorId/regenerate` | Regenerate single brief with preserveEdits | Owner/Member |
| GET | `/campaigns/:id/briefs` | List all briefs for campaign | Owner/Member |
| GET | `/campaigns/:id/briefs/:creatorId` | Get single creator brief | Owner/Member |
| PATCH | `/campaigns/:id/briefs/:creatorId` | Update content, track editedFields, create version snapshot | Owner/Member |
| PATCH | `/campaigns/:id/briefs/:creatorId/status` | Update review status (draft, needsReview, final) | Owner/Member |
| DELETE | `/campaigns/:id/briefs/:creatorId` | Delete creator brief | Owner/Member |
| GET | `/campaigns/:id/briefs/:creatorId/versions` | List version history snapshots | Owner/Member |
| GET | `/campaigns/:id/briefs/:creatorId/versions/:n` | Get specific historical version snapshot | Owner/Member |
| POST | `/campaigns/:id/briefs/:creatorId/versions/:n/restore` | Restore historical version as new version snapshot | Owner/Member |
| GET | `/campaigns/:id/briefs/:creatorId/export?format=md` | Download brief as Markdown deliverable | Owner/Member |
| GET | `/campaigns/:id/briefs/export.zip` | Export all lineup briefs as Zip archive | Owner/Member |

### Frontend UI Routes:
- `/login`: Google sign-in & demo access
- `/campaigns`: Campaign dashboard list
- `/campaigns/trash`: Trashed campaigns
- `/campaigns/:campaignId/overview`: Campaign cockpit & stepper overview
- `/campaigns/:campaignId/brief`: Phase 2
- `/campaigns/:campaignId/guidelines`: Phase 2
- `/campaigns/:campaignId/creators` & `/:creatorId`: Phase 3
- `/campaigns/:campaignId/premortem` & `/runs/:runId`: Phase 4
- `/campaigns/:campaignId/briefs` & `/:creatorId`: Phase 5
- `/campaigns/:campaignId/compliance`, `/new`, `/:submissionId`: Phase 6
- `/campaigns/:campaignId/search-capture`: Phase 7
- `/campaigns/:campaignId/live`: Phase 8
- `/campaigns/:campaignId/report`: Phase 9
- `/campaigns/:campaignId/settings`: Phase 1 & 2
- `/demo`: Direct demo mode without login

## 5. Decision Log
- **Dual Repositories**: Implemented `InMemoryRepository` for tests and instant local zero-credential preview/demo, and `FirestoreRepository` backed by Google Cloud Firestore with Firebase Admin SDK / Client REST.
- **Optimistic Concurrency**: Mandatory `version` integer check on all `PATCH`, `PUT`, and `DELETE` requests to prevent race conditions during collaborative marketing reviews.
- **Central Job Engine**: In-memory async job manager with heartbeat timeout checks, cancellation checks, and persistence in Firestore/InMemory.
- **Engine 2 Creator Briefs (Phase 5)**:
  - Strict lineup restriction: Briefs are exclusively generated for creators present in the campaign's `approvedLineup`.
  - Invariant enforcement: Mandatory disclosures, encoded UTM affiliate links (`utm_source=youtube`, `utm_medium=creator`, `utm_campaign`, `utm_content`), timeline milestones (launch − 14d, 3d feedback, launch − 3d), and success metrics (90% median views, median engagement) are computed strictly by code and never delegated to LLM hallucination.
  - Verification & Self-Repair: Cited video titles are validated against authentic YouTube channel uploads with 1 automatic repair attempt; unapproved prices, numerical specifications, and health/miracle claims in key messages are flagged with `needsReview` status.
  - Non-destructive Versioning & Preserve Edits: Every content edit or version restore creates an immutable historical version snapshot (history is never overwritten); regenerate with `preserveEdits: true` tracks dot-path field changes and cleanly merges fresh creative angles without wiping user customization.
- **Phase 9 Hardening, Demo & Deployment**:
  - Requirements Audit: 100% of requirements across Phases 1–8 audited and verified done (243 unit & integration tests passing across 7 test suites).
  - Navigation & Route Audit: Complete 9-step workflow navigation implemented with direct URL loading, breadcrumbs, scroll restoration to top, locked-step state support, friendly 404/Not Found screens, and `returnTo` auth redirects.
  - Failure Drills & Resilience: Verified exponential backoff for Gemini 429 rate limits, JSON self-repair, YouTube quota safety checks, zero-downtime database fallback to `InMemoryRepository`, 409 optimistic concurrency conflict dialogs, and request input truncation.
  - Complete Demo Mode (`/demo`): Pre-recorded demo campaign (`cmp_demo_cci` for "Aura Smart Home — Q4 Global Launch") automatically seeded with 8 ranked creators, Pre-Mortem overlap simulation (health score 58 -> 84), draft compliance audit (FTC #ad missing -> fixed), search capture pack, and live pulse performance with outperforming alert.
  - Documentation & Script: Created `/docs/TESTING.md` and `/docs/DEMO_SCRIPT.md` (7-minute click-by-click presenter script following the story arc).
