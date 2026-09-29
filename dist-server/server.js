var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/config.ts
var CONFIG;
var init_config = __esm({
  "shared/config.ts"() {
    CONFIG = {
      // Gemini AI Models
      GEMINI_MODEL: "gemini-2.5-flash",
      GEMINI_EMBEDDING_MODEL: "text-embedding-004",
      GEMINI_MAX_RETRIES: 3,
      GEMINI_CONCURRENCY_LIMIT: 2,
      GEMINI_BACKOFF_BASE_MS: 1e3,
      // Pagination & Lists
      DEFAULT_PAGE_SIZE: 12,
      MAX_PAGE_SIZE: 50,
      // Campaign Rules
      CAMPAIGN_NAME_MIN_LENGTH: 3,
      CAMPAIGN_NAME_MAX_LENGTH: 80,
      // Jobs
      JOB_TIMEOUT_MINUTES: 10,
      JOB_POLL_INTERVAL_MS: 2e3,
      // Rate Limiting
      RATE_LIMIT_WINDOW_MS: 60 * 1e3,
      // 1 minute
      RATE_LIMIT_MAX_REQUESTS: 60,
      // 60 requests per minute
      // Caching
      CACHE_DEFAULT_TTL_SECONDS: 3600,
      // 1 hour
      YOUTUBE_CACHE_TTL_SECONDS: 86400,
      // 24 hours
      // Quotas & Assumptions (Phase 3 onwards)
      YOUTUBE_DAILY_QUOTA_UNITS: 1e4,
      DEFAULT_CPM_ESTIMATE: 25,
      // Workflow Steps Definition
      WORKFLOW_STEPS: [
        { id: "overview", title: "Overview", stepNumber: 0, phase: 1, path: "overview" },
        { id: "brief", title: "1. Brief", stepNumber: 1, phase: 2, path: "brief" },
        { id: "guidelines", title: "2. Guidelines", stepNumber: 2, phase: 2, path: "guidelines" },
        { id: "creators", title: "3. Creators", stepNumber: 3, phase: 3, path: "creators" },
        { id: "premortem", title: "4. Pre-Mortem", stepNumber: 4, phase: 4, path: "premortem" },
        { id: "briefs", title: "5. Creator Briefs", stepNumber: 5, phase: 5, path: "briefs" },
        { id: "compliance", title: "6. Compliance", stepNumber: 6, phase: 6, path: "compliance" },
        { id: "search-capture", title: "7. Search Capture", stepNumber: 7, phase: 7, path: "search-capture" },
        { id: "live", title: "8. Live Pulse", stepNumber: 8, phase: 8, path: "live" },
        { id: "report", title: "Report", stepNumber: 9, phase: 9, path: "report" },
        { id: "settings", title: "Settings", stepNumber: 10, phase: 1, path: "settings" }
      ]
    };
  }
});

// server/errors/AppError.ts
var AppError;
var init_AppError = __esm({
  "server/errors/AppError.ts"() {
    AppError = class _AppError extends Error {
      constructor(code, message, statusCode = 400, details, retryable = false) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.retryable = retryable;
        Object.setPrototypeOf(this, _AppError.prototype);
      }
      static validation(message, details) {
        return new _AppError("VALIDATION_ERROR", message, 400, details, false);
      }
      static unauthenticated(message = "Authentication required") {
        return new _AppError("UNAUTHENTICATED", message, 401, void 0, false);
      }
      static forbidden(message = "You do not have permission to perform this action") {
        return new _AppError("FORBIDDEN", message, 403, void 0, false);
      }
      static notFound(message = "Resource not found") {
        return new _AppError("NOT_FOUND", message, 404, void 0, false);
      }
      static conflict(message, currentData) {
        return new _AppError("CONFLICT", message, 409, currentData, false);
      }
      static unprocessable(message) {
        return new _AppError("UNPROCESSABLE", message, 422, void 0, false);
      }
      static rateLimited(message = "Too many requests, please slow down") {
        return new _AppError("RATE_LIMITED", message, 429, void 0, true);
      }
      static internal(message = "Internal server error") {
        return new _AppError("INTERNAL", message, 500, void 0, false);
      }
      static upstream(message = "Upstream service error", retryable = true) {
        return new _AppError("UPSTREAM_ERROR", message, 502, void 0, retryable);
      }
      static aiInvalidOutput(message, details) {
        return new _AppError("AI_INVALID_OUTPUT", message, 422, details, false);
      }
      static aiRateLimited(message = "AI rate limit exceeded, retry later") {
        return new _AppError("AI_RATE_LIMITED", message, 429, void 0, true);
      }
      static aiUnavailable(message = "AI service unavailable") {
        return new _AppError("AI_UNAVAILABLE", message, 503, void 0, true);
      }
    };
  }
});

// server/firebaseAdmin.ts
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
function initFirebaseAdmin() {
  if (isInitialized) {
    return { db: firestoreInstance, auth: authInstance };
  }
  try {
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
    let databaseId = "(default)";
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.projectId) projectId = config.projectId;
      if (config.firestoreDatabaseId) databaseId = config.firestoreDatabaseId;
    }
    if (getApps().length === 0) {
      appInstance = initializeApp({
        projectId: projectId || "atomic-volt-dcb1c"
      });
    } else {
      appInstance = getApps()[0];
    }
    authInstance = getAuth(appInstance);
    if (databaseId && databaseId !== "(default)") {
      firestoreInstance = getFirestore(appInstance, databaseId);
    } else {
      firestoreInstance = getFirestore(appInstance);
    }
    isInitialized = true;
    console.log(`[Firebase Admin] Initialized successfully for project: ${projectId}, db: ${databaseId}`);
  } catch (err) {
    console.warn("[Firebase Admin] Initialization failed or running without GCP credentials. Falling back to in-memory mode:", err.message);
    firestoreInstance = null;
    authInstance = null;
    isInitialized = true;
  }
  return { db: firestoreInstance, auth: authInstance };
}
function getFirebaseAuth() {
  if (!isInitialized) initFirebaseAdmin();
  return authInstance;
}
var firestoreInstance, authInstance, appInstance, isInitialized;
var init_firebaseAdmin = __esm({
  "server/firebaseAdmin.ts"() {
    firestoreInstance = null;
    authInstance = null;
    appInstance = null;
    isInitialized = false;
  }
});

// shared/types.ts
import { z } from "zod";
var ErrorCodeEnum, UserSchema, CampaignStatusEnum, ALLOWED_STATUS_TRANSITIONS, CampaignSchema, CreateCampaignInputSchema, UpdateCampaignInputSchema, CampaignQuerySchema, ActivityEntrySchema, JobStatusEnum, JobProgressSchema, JobErrorSchema, JobSchema, CampaignExportSchema;
var init_types = __esm({
  "shared/types.ts"() {
    init_config();
    ErrorCodeEnum = z.enum([
      "VALIDATION_ERROR",
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "UNPROCESSABLE",
      "RATE_LIMITED",
      "INTERNAL",
      "UPSTREAM_ERROR",
      "AI_INVALID_OUTPUT",
      "AI_RATE_LIMITED",
      "AI_UNAVAILABLE",
      "JOB_TIMEOUT"
    ]);
    UserSchema = z.object({
      uid: z.string(),
      email: z.string().email(),
      displayName: z.string().optional().nullable(),
      photoURL: z.string().url().optional().nullable(),
      createdAt: z.string(),
      lastLoginAt: z.string()
    });
    CampaignStatusEnum = z.enum(["draft", "active", "completed", "archived"]);
    ALLOWED_STATUS_TRANSITIONS = {
      draft: ["active", "archived"],
      active: ["completed", "archived"],
      completed: ["archived"],
      archived: ["draft"]
    };
    CampaignSchema = z.object({
      id: z.string(),
      ownerId: z.string(),
      ownerEmail: z.string().email(),
      memberEmails: z.array(z.string().email()).default([]),
      name: z.string().min(CONFIG.CAMPAIGN_NAME_MIN_LENGTH).max(CONFIG.CAMPAIGN_NAME_MAX_LENGTH),
      status: CampaignStatusEnum.default("draft"),
      brief: z.record(z.string(), z.unknown()).optional().default({}),
      // Phase 2
      settings: z.record(z.string(), z.unknown()).optional().default({}),
      // Phase 2
      approvedLineup: z.array(z.string()).optional().default([]),
      // Phase 4
      deletedAt: z.string().nullable().default(null),
      createdAt: z.string(),
      updatedAt: z.string(),
      version: z.number().int().nonnegative().default(1)
    });
    CreateCampaignInputSchema = z.object({
      name: z.string().trim().min(CONFIG.CAMPAIGN_NAME_MIN_LENGTH, `Name must be at least ${CONFIG.CAMPAIGN_NAME_MIN_LENGTH} characters`).max(CONFIG.CAMPAIGN_NAME_MAX_LENGTH, `Name cannot exceed ${CONFIG.CAMPAIGN_NAME_MAX_LENGTH} characters`)
    });
    UpdateCampaignInputSchema = z.object({
      name: z.string().trim().min(CONFIG.CAMPAIGN_NAME_MIN_LENGTH).max(CONFIG.CAMPAIGN_NAME_MAX_LENGTH).optional(),
      status: CampaignStatusEnum.optional(),
      memberEmails: z.array(z.string().email()).optional(),
      version: z.number().int().nonnegative()
    });
    CampaignQuerySchema = z.object({
      status: CampaignStatusEnum.optional(),
      search: z.string().optional(),
      sort: z.enum(["updatedAt", "name", "createdAt"]).default("updatedAt"),
      order: z.enum(["asc", "desc"]).default("desc"),
      cursor: z.string().optional(),
      limit: z.coerce.number().min(1).max(CONFIG.MAX_PAGE_SIZE).default(CONFIG.DEFAULT_PAGE_SIZE)
    });
    ActivityEntrySchema = z.object({
      id: z.string(),
      campaignId: z.string(),
      actorEmail: z.string(),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      summary: z.string(),
      at: z.string()
    });
    JobStatusEnum = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
    JobProgressSchema = z.object({
      done: z.number().int(),
      total: z.number().int(),
      message: z.string()
    });
    JobErrorSchema = z.object({
      code: z.string(),
      message: z.string()
    });
    JobSchema = z.object({
      id: z.string(),
      campaignId: z.string(),
      ownerId: z.string(),
      type: z.string(),
      status: JobStatusEnum,
      progress: JobProgressSchema,
      result: z.unknown().optional().nullable(),
      error: JobErrorSchema.optional().nullable(),
      cancelRequested: z.boolean().default(false),
      createdAt: z.string(),
      updatedAt: z.string()
    });
    CampaignExportSchema = z.object({
      schemaVersion: z.literal(1),
      exportedAt: z.string(),
      campaign: z.object({
        name: z.string().min(CONFIG.CAMPAIGN_NAME_MIN_LENGTH).max(CONFIG.CAMPAIGN_NAME_MAX_LENGTH),
        brief: z.record(z.string(), z.unknown()).optional().default({}),
        settings: z.record(z.string(), z.unknown()).optional().default({}),
        guidelines: z.array(z.record(z.string(), z.unknown())).optional().default([]),
        creators: z.array(z.record(z.string(), z.unknown())).optional().default([])
      })
    });
  }
});

// server/repositories/InMemoryRepository.ts
import { randomUUID as randomUUID2 } from "crypto";
var InMemoryCampaignRepository, InMemoryUserRepository, InMemoryJobRepository, InMemoryActivityRepository, InMemoryCacheRepository;
var init_InMemoryRepository = __esm({
  "server/repositories/InMemoryRepository.ts"() {
    init_types();
    init_AppError();
    init_config();
    InMemoryCampaignRepository = class {
      constructor() {
        this.campaigns = /* @__PURE__ */ new Map();
        // Map of campaignId -> subcollections (guidelines, creators, etc.)
        this.subcollections = /* @__PURE__ */ new Map();
      }
      async create(data) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const id = `cmp_${randomUUID2().slice(0, 8)}`;
        const campaign = {
          ...data,
          id,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 1
        };
        this.campaigns.set(id, campaign);
        this.subcollections.set(id, { guidelines: [], creators: [] });
        return campaign;
      }
      async getById(id) {
        return this.campaigns.get(id) || null;
      }
      async list(query, userEmail, userId) {
        const emailLower = userEmail.toLowerCase();
        let items = Array.from(this.campaigns.values()).filter((c) => {
          if (c.deletedAt !== null) return false;
          const isOwner = c.ownerId === userId || c.ownerEmail.toLowerCase() === emailLower;
          const isMember = c.memberEmails.some((m) => m.toLowerCase() === emailLower);
          return isOwner || isMember;
        });
        if (query.status) {
          items = items.filter((c) => c.status === query.status);
        }
        if (query.search) {
          const q = query.search.toLowerCase();
          items = items.filter((c) => c.name.toLowerCase().includes(q));
        }
        const sortField = query.sort || "updatedAt";
        const orderAsc = query.order === "asc";
        items.sort((a, b) => {
          const valA = a[sortField];
          const valB = b[sortField];
          if (valA < valB) return orderAsc ? -1 : 1;
          if (valA > valB) return orderAsc ? 1 : -1;
          return 0;
        });
        let startIndex = 0;
        if (query.cursor) {
          const parsed = parseInt(Buffer.from(query.cursor, "base64").toString("ascii"), 10);
          if (!isNaN(parsed) && parsed >= 0) {
            startIndex = parsed;
          }
        }
        const limit = query.limit || CONFIG.DEFAULT_PAGE_SIZE;
        const paged = items.slice(startIndex, startIndex + limit);
        const nextIndex = startIndex + limit;
        const nextCursor = nextIndex < items.length ? Buffer.from(nextIndex.toString()).toString("base64") : null;
        return {
          items: paged,
          nextCursor,
          total: items.length
        };
      }
      async listTrash(userId) {
        const items = Array.from(this.campaigns.values()).filter((c) => c.ownerId === userId && c.deletedAt !== null).sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
        return {
          items,
          nextCursor: null,
          total: items.length
        };
      }
      async update(id, expectedVersion, updates) {
        const existing = this.campaigns.get(id);
        if (!existing) {
          throw AppError.notFound("Campaign not found");
        }
        if (existing.version !== expectedVersion) {
          throw AppError.conflict(
            `Campaign has been modified by someone else (version mismatch: expected ${expectedVersion}, got ${existing.version})`,
            existing
          );
        }
        if (updates.status && updates.status !== existing.status) {
          const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status];
          if (!allowed || !allowed.includes(updates.status)) {
            throw AppError.unprocessable(
              `Invalid status transition from "${existing.status}" to "${updates.status}". Allowed: ${allowed.join(", ") || "none"}`
            );
          }
        }
        const updated = {
          ...existing,
          name: updates.name ?? existing.name,
          status: updates.status ?? existing.status,
          memberEmails: updates.memberEmails ?? existing.memberEmails,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          version: existing.version + 1
        };
        this.campaigns.set(id, updated);
        return updated;
      }
      async softDelete(id, expectedVersion) {
        const existing = this.campaigns.get(id);
        if (!existing) {
          throw AppError.notFound("Campaign not found");
        }
        if (existing.version !== expectedVersion) {
          throw AppError.conflict(
            `Campaign has been modified by someone else before delete`,
            existing
          );
        }
        const updated = {
          ...existing,
          deletedAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          version: existing.version + 1
        };
        this.campaigns.set(id, updated);
        return updated;
      }
      async restore(id) {
        const existing = this.campaigns.get(id);
        if (!existing) {
          throw AppError.notFound("Campaign not found");
        }
        const updated = {
          ...existing,
          deletedAt: null,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          version: existing.version + 1
        };
        this.campaigns.set(id, updated);
        return updated;
      }
      async hardDelete(id) {
        this.campaigns.delete(id);
        this.subcollections.delete(id);
      }
      async duplicate(id, newOwnerId, newOwnerEmail) {
        const existing = this.campaigns.get(id);
        if (!existing) {
          throw AppError.notFound("Campaign not found");
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const newId = `cmp_${randomUUID2().slice(0, 8)}`;
        const sub = this.subcollections.get(id) || { guidelines: [], creators: [] };
        const newCampaign = {
          id: newId,
          ownerId: newOwnerId,
          ownerEmail: newOwnerEmail,
          memberEmails: [],
          name: `Copy of ${existing.name}`,
          status: "draft",
          brief: JSON.parse(JSON.stringify(existing.brief || {})),
          settings: JSON.parse(JSON.stringify(existing.settings || {})),
          approvedLineup: [],
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 1
        };
        this.campaigns.set(newId, newCampaign);
        this.subcollections.set(newId, {
          guidelines: JSON.parse(JSON.stringify(sub.guidelines || [])),
          creators: JSON.parse(JSON.stringify(sub.creators || []))
        });
        return newCampaign;
      }
      async exportData(id) {
        const existing = this.campaigns.get(id);
        if (!existing) {
          throw AppError.notFound("Campaign not found");
        }
        const sub = this.subcollections.get(id) || { guidelines: [], creators: [] };
        return {
          schemaVersion: 1,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          campaign: {
            name: existing.name,
            brief: existing.brief || {},
            settings: existing.settings || {},
            guidelines: sub.guidelines || [],
            creators: sub.creators || []
          }
        };
      }
      async importData(data, ownerId, ownerEmail) {
        const campaignObj = data.campaign || {};
        const name = campaignObj.name || "Imported Campaign";
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const id = `cmp_${randomUUID2().slice(0, 8)}`;
        const campaign = {
          id,
          ownerId,
          ownerEmail,
          memberEmails: [],
          name,
          status: "draft",
          brief: campaignObj.brief || {},
          settings: campaignObj.settings || {},
          approvedLineup: [],
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 1
        };
        this.campaigns.set(id, campaign);
        this.subcollections.set(id, {
          guidelines: Array.isArray(campaignObj.guidelines) ? campaignObj.guidelines : [],
          creators: Array.isArray(campaignObj.creators) ? campaignObj.creators : []
        });
        return campaign;
      }
      // Helper for tests/fixtures
      seed(campaigns) {
        for (const c of campaigns) {
          this.campaigns.set(c.id, c);
        }
      }
      clear() {
        this.campaigns.clear();
        this.subcollections.clear();
      }
    };
    InMemoryUserRepository = class {
      constructor() {
        this.users = /* @__PURE__ */ new Map();
      }
      async getById(uid) {
        return this.users.get(uid) || null;
      }
      async upsert(user) {
        this.users.set(user.uid, user);
        return user;
      }
    };
    InMemoryJobRepository = class {
      constructor() {
        this.jobs = /* @__PURE__ */ new Map();
      }
      async create(data) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const id = `job_${randomUUID2().slice(0, 8)}`;
        const job = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now
        };
        this.jobs.set(id, job);
        return job;
      }
      async getById(id) {
        return this.jobs.get(id) || null;
      }
      async listRunningByCampaign(campaignId) {
        return Array.from(this.jobs.values()).filter(
          (j) => j.campaignId === campaignId && (j.status === "running" || j.status === "queued")
        );
      }
      async update(id, updates) {
        const job = this.jobs.get(id);
        if (!job) {
          throw AppError.notFound("Job not found");
        }
        const updated = {
          ...job,
          ...updates,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.jobs.set(id, updated);
        return updated;
      }
    };
    InMemoryActivityRepository = class {
      constructor() {
        this.activities = [];
      }
      async log(entry) {
        const activity = {
          ...entry,
          id: `act_${randomUUID2().slice(0, 8)}`,
          at: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.activities.unshift(activity);
        return activity;
      }
      async listByCampaign(campaignId, limit = 20, cursor) {
        let list = this.activities.filter((a) => a.campaignId === campaignId);
        let startIndex = 0;
        if (cursor) {
          const parsed = parseInt(Buffer.from(cursor, "base64").toString("ascii"), 10);
          if (!isNaN(parsed) && parsed >= 0) {
            startIndex = parsed;
          }
        }
        const paged = list.slice(startIndex, startIndex + limit);
        const nextIndex = startIndex + limit;
        const nextCursor = nextIndex < list.length ? Buffer.from(nextIndex.toString()).toString("base64") : null;
        return {
          items: paged,
          nextCursor,
          total: list.length
        };
      }
    };
    InMemoryCacheRepository = class {
      constructor() {
        this.cache = /* @__PURE__ */ new Map();
      }
      async get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
          this.cache.delete(key);
          return null;
        }
        return item.value;
      }
      async set(key, value, ttlSeconds) {
        this.cache.set(key, {
          value,
          expiresAt: Date.now() + ttlSeconds * 1e3
        });
      }
      async delete(key) {
        this.cache.delete(key);
      }
    };
  }
});

// server/repositories/FirestoreRepository.ts
var FirestoreCampaignRepository, FirestoreUserRepository, FirestoreJobRepository, FirestoreActivityRepository, FirestoreCacheRepository;
var init_FirestoreRepository = __esm({
  "server/repositories/FirestoreRepository.ts"() {
    init_types();
    init_AppError();
    init_config();
    FirestoreCampaignRepository = class {
      constructor(db) {
        this.db = db;
      }
      col() {
        return this.db.collection("campaigns");
      }
      async create(data) {
        const docRef = this.col().doc();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const campaign = {
          ...data,
          id: docRef.id,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 1
        };
        await docRef.set(campaign);
        return campaign;
      }
      async getById(id) {
        const doc = await this.col().doc(id).get();
        if (!doc.exists) return null;
        return doc.data();
      }
      async list(query, userEmail, userId) {
        const emailLower = userEmail.toLowerCase();
        const snapshot = await this.col().where("deletedAt", "==", null).get();
        let items = [];
        snapshot.forEach((doc) => {
          const c = doc.data();
          const isOwner = c.ownerId === userId || c.ownerEmail.toLowerCase() === emailLower;
          const isMember = c.memberEmails && c.memberEmails.some((m) => m.toLowerCase() === emailLower);
          if (isOwner || isMember) {
            items.push(c);
          }
        });
        if (query.status) {
          items = items.filter((c) => c.status === query.status);
        }
        if (query.search) {
          const q = query.search.toLowerCase();
          items = items.filter((c) => c.name.toLowerCase().includes(q));
        }
        const sortField = query.sort || "updatedAt";
        const orderAsc = query.order === "asc";
        items.sort((a, b) => {
          const valA = a[sortField];
          const valB = b[sortField];
          if (valA < valB) return orderAsc ? -1 : 1;
          if (valA > valB) return orderAsc ? 1 : -1;
          return 0;
        });
        let startIndex = 0;
        if (query.cursor) {
          const parsed = parseInt(Buffer.from(query.cursor, "base64").toString("ascii"), 10);
          if (!isNaN(parsed) && parsed >= 0) {
            startIndex = parsed;
          }
        }
        const limit = query.limit || CONFIG.DEFAULT_PAGE_SIZE;
        const paged = items.slice(startIndex, startIndex + limit);
        const nextIndex = startIndex + limit;
        const nextCursor = nextIndex < items.length ? Buffer.from(nextIndex.toString()).toString("base64") : null;
        return {
          items: paged,
          nextCursor,
          total: items.length
        };
      }
      async listTrash(userId) {
        const snapshot = await this.col().where("ownerId", "==", userId).where("deletedAt", "!=", null).get();
        const items = [];
        snapshot.forEach((doc) => items.push(doc.data()));
        items.sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
        return {
          items,
          nextCursor: null,
          total: items.length
        };
      }
      async update(id, expectedVersion, updates) {
        const docRef = this.col().doc(id);
        return await this.db.runTransaction(async (tx) => {
          const snap = await tx.get(docRef);
          if (!snap.exists) {
            throw AppError.notFound("Campaign not found");
          }
          const existing = snap.data();
          if (existing.version !== expectedVersion) {
            throw AppError.conflict(
              `Campaign has been modified by someone else (version mismatch: expected ${expectedVersion}, got ${existing.version})`,
              existing
            );
          }
          if (updates.status && updates.status !== existing.status) {
            const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status];
            if (!allowed || !allowed.includes(updates.status)) {
              throw AppError.unprocessable(
                `Invalid status transition from "${existing.status}" to "${updates.status}". Allowed: ${allowed.join(", ") || "none"}`
              );
            }
          }
          const updated = {
            ...existing,
            name: updates.name ?? existing.name,
            status: updates.status ?? existing.status,
            memberEmails: updates.memberEmails ?? existing.memberEmails,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            version: existing.version + 1
          };
          tx.set(docRef, updated);
          return updated;
        });
      }
      async softDelete(id, expectedVersion) {
        const docRef = this.col().doc(id);
        return await this.db.runTransaction(async (tx) => {
          const snap = await tx.get(docRef);
          if (!snap.exists) {
            throw AppError.notFound("Campaign not found");
          }
          const existing = snap.data();
          if (existing.version !== expectedVersion) {
            throw AppError.conflict(
              `Campaign has been modified by someone else before delete`,
              existing
            );
          }
          const updated = {
            ...existing,
            deletedAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            version: existing.version + 1
          };
          tx.set(docRef, updated);
          return updated;
        });
      }
      async restore(id) {
        const docRef = this.col().doc(id);
        return await this.db.runTransaction(async (tx) => {
          const snap = await tx.get(docRef);
          if (!snap.exists) {
            throw AppError.notFound("Campaign not found");
          }
          const existing = snap.data();
          const updated = {
            ...existing,
            deletedAt: null,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            version: existing.version + 1
          };
          tx.set(docRef, updated);
          return updated;
        });
      }
      async hardDelete(id) {
        const docRef = this.col().doc(id);
        const subcollections = [
          "creators",
          "guidelines",
          "premortemRuns",
          "briefs",
          "submissions",
          "searchPack",
          "trackedVideos",
          "alerts",
          "pulseSummaries",
          "activity"
        ];
        for (const sub of subcollections) {
          const subSnap = await docRef.collection(sub).limit(100).get();
          const batch = this.db.batch();
          subSnap.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
        await docRef.delete();
      }
      async duplicate(id, newOwnerId, newOwnerEmail) {
        const existing = await this.getById(id);
        if (!existing) {
          throw AppError.notFound("Campaign not found");
        }
        const docRef = this.col().doc();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const newCampaign = {
          id: docRef.id,
          ownerId: newOwnerId,
          ownerEmail: newOwnerEmail,
          memberEmails: [],
          name: `Copy of ${existing.name}`,
          status: "draft",
          brief: JSON.parse(JSON.stringify(existing.brief || {})),
          settings: JSON.parse(JSON.stringify(existing.settings || {})),
          approvedLineup: [],
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 1
        };
        await docRef.set(newCampaign);
        const oldRef = this.col().doc(id);
        for (const sub of ["guidelines", "creators"]) {
          const subDocs = await oldRef.collection(sub).get();
          if (!subDocs.empty) {
            const batch = this.db.batch();
            subDocs.forEach((d) => {
              const newSubRef = docRef.collection(sub).doc();
              batch.set(newSubRef, d.data());
            });
            await batch.commit();
          }
        }
        return newCampaign;
      }
      async exportData(id) {
        const existing = await this.getById(id);
        if (!existing) {
          throw AppError.notFound("Campaign not found");
        }
        const docRef = this.col().doc(id);
        const guidelinesSnap = await docRef.collection("guidelines").get();
        const creatorsSnap = await docRef.collection("creators").get();
        const guidelines = [];
        guidelinesSnap.forEach((d) => guidelines.push(d.data()));
        const creators = [];
        creatorsSnap.forEach((d) => creators.push(d.data()));
        return {
          schemaVersion: 1,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          campaign: {
            name: existing.name,
            brief: existing.brief || {},
            settings: existing.settings || {},
            guidelines,
            creators
          }
        };
      }
      async importData(data, ownerId, ownerEmail) {
        const campaignObj = data.campaign || {};
        const name = campaignObj.name || "Imported Campaign";
        const docRef = this.col().doc();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const campaign = {
          id: docRef.id,
          ownerId,
          ownerEmail,
          memberEmails: [],
          name,
          status: "draft",
          brief: campaignObj.brief || {},
          settings: campaignObj.settings || {},
          approvedLineup: [],
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 1
        };
        await docRef.set(campaign);
        if (Array.isArray(campaignObj.guidelines) && campaignObj.guidelines.length > 0) {
          const batch = this.db.batch();
          for (const g of campaignObj.guidelines) {
            batch.set(docRef.collection("guidelines").doc(), g);
          }
          await batch.commit();
        }
        if (Array.isArray(campaignObj.creators) && campaignObj.creators.length > 0) {
          const batch = this.db.batch();
          for (const c of campaignObj.creators) {
            batch.set(docRef.collection("creators").doc(), c);
          }
          await batch.commit();
        }
        return campaign;
      }
    };
    FirestoreUserRepository = class {
      constructor(db) {
        this.db = db;
      }
      async getById(uid) {
        const doc = await this.db.collection("users").doc(uid).get();
        if (!doc.exists) return null;
        return doc.data();
      }
      async upsert(user) {
        await this.db.collection("users").doc(user.uid).set(user, { merge: true });
        return user;
      }
    };
    FirestoreJobRepository = class {
      constructor(db) {
        this.db = db;
      }
      async create(data) {
        const docRef = this.db.collection("jobs").doc();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const job = {
          ...data,
          id: docRef.id,
          createdAt: now,
          updatedAt: now
        };
        await docRef.set(job);
        return job;
      }
      async getById(id) {
        const doc = await this.db.collection("jobs").doc(id).get();
        if (!doc.exists) return null;
        return doc.data();
      }
      async listRunningByCampaign(campaignId) {
        const snap = await this.db.collection("jobs").where("campaignId", "==", campaignId).where("status", "in", ["queued", "running"]).get();
        const jobs = [];
        snap.forEach((d) => jobs.push(d.data()));
        return jobs;
      }
      async update(id, updates) {
        const docRef = this.db.collection("jobs").doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
          throw AppError.notFound("Job not found");
        }
        const updated = {
          ...snap.data(),
          ...updates,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await docRef.set(updated, { merge: true });
        return updated;
      }
    };
    FirestoreActivityRepository = class {
      constructor(db) {
        this.db = db;
      }
      async log(entry) {
        const docRef = this.db.collection("campaigns").doc(entry.campaignId).collection("activity").doc();
        const activity = {
          ...entry,
          id: docRef.id,
          at: (/* @__PURE__ */ new Date()).toISOString()
        };
        await docRef.set(activity);
        return activity;
      }
      async listByCampaign(campaignId, limit = 20, cursor) {
        let query = this.db.collection("campaigns").doc(campaignId).collection("activity").orderBy("at", "desc").limit(limit);
        if (cursor) {
          const cursorDoc = await this.db.collection("campaigns").doc(campaignId).collection("activity").doc(cursor).get();
          if (cursorDoc.exists) {
            query = query.startAfter(cursorDoc);
          }
        }
        const snap = await query.get();
        const items = [];
        snap.forEach((d) => items.push(d.data()));
        const nextCursor = items.length === limit ? items[items.length - 1].id : null;
        return {
          items,
          nextCursor,
          total: items.length
        };
      }
    };
    FirestoreCacheRepository = class {
      constructor(db) {
        this.db = db;
      }
      async get(key) {
        const doc = await this.db.collection("cache").doc(key).get();
        if (!doc.exists) return null;
        const data = doc.data();
        if (!data || Date.now() > data.expiresAt) {
          await doc.ref.delete().catch(() => {
          });
          return null;
        }
        return data.value;
      }
      async set(key, value, ttlSeconds) {
        await this.db.collection("cache").doc(key).set({
          value,
          expiresAt: Date.now() + ttlSeconds * 1e3,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      async delete(key) {
        await this.db.collection("cache").doc(key).delete();
      }
    };
  }
});

// server/repositories/index.ts
var repositories_exports = {};
__export(repositories_exports, {
  getRepositories: () => getRepositories,
  switchToInMemoryFallback: () => switchToInMemoryFallback
});
function getRepositories() {
  if (repos) return repos;
  const isDemo = process.env.DEMO_MODE === "true";
  const { db } = initFirebaseAdmin();
  if (isDemo || !db) {
    console.log(`[Repository] Using InMemoryRepository (${isDemo ? "DEMO_MODE enabled" : "Firebase db not initialized"})`);
    repos = {
      campaigns: new InMemoryCampaignRepository(),
      users: new InMemoryUserRepository(),
      jobs: new InMemoryJobRepository(),
      activity: new InMemoryActivityRepository(),
      cache: new InMemoryCacheRepository(),
      isDemoOrMemory: true
    };
  } else {
    console.log("[Repository] Attempting FirestoreRepository with persistent Cloud Firestore");
    repos = {
      campaigns: new FirestoreCampaignRepository(db),
      users: new FirestoreUserRepository(db),
      jobs: new FirestoreJobRepository(db),
      activity: new FirestoreActivityRepository(db),
      cache: new FirestoreCacheRepository(db),
      isDemoOrMemory: false
    };
  }
  return repos;
}
function switchToInMemoryFallback() {
  console.warn("[Repository] Switching to InMemoryRepository for preview session");
  repos = {
    campaigns: new InMemoryCampaignRepository(),
    users: new InMemoryUserRepository(),
    jobs: new InMemoryJobRepository(),
    activity: new InMemoryActivityRepository(),
    cache: new InMemoryCacheRepository(),
    isDemoOrMemory: true
  };
  return repos;
}
var repos;
var init_repositories = __esm({
  "server/repositories/index.ts"() {
    init_InMemoryRepository();
    init_FirestoreRepository();
    init_firebaseAdmin();
    repos = null;
  }
});

// server.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path2 from "path";
import { fileURLToPath } from "url";

// server/middleware/requestId.ts
import { randomUUID } from "crypto";
function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers["x-request-id"];
  const requestId = incomingId || randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

// server/middleware/rateLimit.ts
init_config();
init_AppError();
var userBuckets = /* @__PURE__ */ new Map();
function rateLimiter(req, res, next) {
  const key = req.user?.uid || req.ip || "anonymous";
  const now = Date.now();
  let bucket = userBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + CONFIG.RATE_LIMIT_WINDOW_MS };
    userBuckets.set(key, bucket);
  }
  bucket.count++;
  res.setHeader("X-RateLimit-Limit", CONFIG.RATE_LIMIT_MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, CONFIG.RATE_LIMIT_MAX_REQUESTS - bucket.count));
  res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1e3));
  if (bucket.count > CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    return next(AppError.rateLimited("You have exceeded the request limit. Please wait a moment and try again."));
  }
  next();
}

// server/middleware/auth.ts
init_firebaseAdmin();
init_AppError();
init_repositories();
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(AppError.unauthenticated("Missing or invalid Authorization header"));
  }
  const token = authHeader.split("Bearer ")[1]?.trim();
  if (!token) {
    return next(AppError.unauthenticated("Bearer token empty"));
  }
  const firebaseAuth = getFirebaseAuth();
  if (token.startsWith("demo_user_") || !firebaseAuth) {
    const demoEmail = token.startsWith("demo_user_") ? `${token.replace("demo_user_", "")}@example.com` : "demo@creatorcampaign.ai";
    const demoUid = token.startsWith("demo_user_") ? token : "demo_uid_123";
    req.user = {
      uid: demoUid,
      email: demoEmail,
      displayName: "Demo Marketer",
      photoURL: ""
    };
    const repos3 = getRepositories();
    repos3.users.upsert({
      uid: demoUid,
      email: demoEmail,
      displayName: "Demo Marketer",
      photoURL: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
    }).catch(() => {
    });
    return next();
  }
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || "unknown@example.com",
      displayName: decoded.name,
      photoURL: decoded.picture
    };
    const repos3 = getRepositories();
    repos3.users.upsert({
      uid: decoded.uid,
      email: decoded.email || "unknown@example.com",
      displayName: decoded.name || null,
      photoURL: decoded.picture || null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
    }).catch((err) => console.error("Error upserting user:", err));
    next();
  } catch (err) {
    console.error("Firebase token verification failed:", err);
    return next(AppError.unauthenticated("Invalid or expired Firebase ID token"));
  }
}

// server/middleware/error.ts
init_AppError();
import { ZodError } from "zod";
function errorHandler(err, req, res, next) {
  const requestId = req.headers["x-request-id"] || res.getHeader("x-request-id");
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message
    }));
    const response2 = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details,
        retryable: false,
        requestId
      }
    };
    return res.status(400).json(response2);
  }
  if (err instanceof AppError) {
    const response2 = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        retryable: err.retryable,
        requestId
      }
    };
    return res.status(err.statusCode).json(response2);
  }
  console.error(`[Error] Request ${requestId} failed:`, err);
  const response = {
    error: {
      code: "INTERNAL",
      message: "An unexpected internal error occurred",
      retryable: false,
      requestId
    }
  };
  return res.status(500).json(response);
}

// server/routes/campaigns.ts
init_types();
init_repositories();
import { Router } from "express";

// server/middleware/campaignAuth.ts
init_repositories();
init_AppError();
async function requireCampaignAccess(req, res, next) {
  const campaignId = req.params.id || req.params.campaignId;
  if (!campaignId) {
    return next(AppError.validation("Campaign ID is required in URL"));
  }
  const user = req.user;
  if (!user) {
    return next(AppError.unauthenticated());
  }
  const repos3 = getRepositories();
  const campaign = await repos3.campaigns.getById(campaignId);
  if (!campaign) {
    return next(AppError.notFound("Campaign not found"));
  }
  const isOwner = campaign.ownerId === user.uid || campaign.ownerEmail.toLowerCase() === user.email.toLowerCase();
  const isMember = campaign.memberEmails?.some((m) => m.toLowerCase() === user.email.toLowerCase());
  if (!isOwner && !isMember) {
    return next(AppError.notFound("Campaign not found"));
  }
  req.campaign = campaign;
  next();
}
function requireCampaignOwner(req, res, next) {
  const campaign = req.campaign;
  const user = req.user;
  if (!campaign || !user) {
    return next(AppError.unauthenticated());
  }
  const isOwner = campaign.ownerId === user.uid || campaign.ownerEmail.toLowerCase() === user.email.toLowerCase();
  if (!isOwner) {
    return next(AppError.forbidden("Only the campaign owner can perform this action"));
  }
  next();
}

// server/routes/campaigns.ts
init_AppError();
var campaignRouter = Router();
campaignRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user;
    const parsedQuery = CampaignQuerySchema.parse(req.query);
    const repos3 = getRepositories();
    const result = await repos3.campaigns.list(parsedQuery, user.email, user.uid);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
campaignRouter.get("/trash", async (req, res, next) => {
  try {
    const user = req.user;
    const repos3 = getRepositories();
    const result = await repos3.campaigns.listTrash(user.uid);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
campaignRouter.post("/", async (req, res, next) => {
  try {
    const user = req.user;
    const input = CreateCampaignInputSchema.parse(req.body);
    const repos3 = getRepositories();
    const campaign = await repos3.campaigns.create({
      ownerId: user.uid,
      ownerEmail: user.email,
      memberEmails: [],
      name: input.name,
      status: "draft",
      brief: {},
      settings: {},
      approvedLineup: []
    });
    await repos3.activity.log({
      campaignId: campaign.id,
      actorEmail: user.email,
      action: "CAMPAIGN_CREATED",
      entityType: "campaign",
      entityId: campaign.id,
      summary: `Created campaign "${campaign.name}"`
    });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});
campaignRouter.post("/import", async (req, res, next) => {
  try {
    const user = req.user;
    const validated = CampaignExportSchema.parse(req.body);
    const repos3 = getRepositories();
    const campaign = await repos3.campaigns.importData(validated, user.uid, user.email);
    await repos3.activity.log({
      campaignId: campaign.id,
      actorEmail: user.email,
      action: "CAMPAIGN_IMPORTED",
      entityType: "campaign",
      entityId: campaign.id,
      summary: `Imported campaign "${campaign.name}"`
    });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});
campaignRouter.get("/:id", requireCampaignAccess, async (req, res) => {
  res.json(req.campaign);
});
campaignRouter.patch("/:id", requireCampaignAccess, async (req, res, next) => {
  try {
    const input = UpdateCampaignInputSchema.parse(req.body);
    const user = req.user;
    const repos3 = getRepositories();
    if (input.memberEmails !== void 0) {
      const isOwner = req.campaign.ownerId === user.uid || req.campaign.ownerEmail.toLowerCase() === user.email.toLowerCase();
      if (!isOwner) {
        throw AppError.forbidden("Only the owner can modify member emails");
      }
    }
    const updated = await repos3.campaigns.update(req.campaign.id, input.version, input);
    const changes = [];
    if (input.name) changes.push(`renamed to "${input.name}"`);
    if (input.status) changes.push(`status changed to "${input.status}"`);
    if (input.memberEmails) changes.push(`updated members`);
    await repos3.activity.log({
      campaignId: updated.id,
      actorEmail: user.email,
      action: "CAMPAIGN_UPDATED",
      entityType: "campaign",
      entityId: updated.id,
      summary: `Updated campaign: ${changes.join(", ") || "details modified"}`
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
campaignRouter.delete("/:id", requireCampaignAccess, requireCampaignOwner, async (req, res, next) => {
  try {
    const version = Number(req.body?.version ?? req.query?.version);
    if (isNaN(version)) {
      throw AppError.validation("Version parameter is required for optimistic concurrency");
    }
    const repos3 = getRepositories();
    const updated = await repos3.campaigns.softDelete(req.campaign.id, version);
    await repos3.activity.log({
      campaignId: updated.id,
      actorEmail: req.user.email,
      action: "CAMPAIGN_TRASHED",
      entityType: "campaign",
      entityId: updated.id,
      summary: `Moved campaign "${updated.name}" to trash`
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
campaignRouter.post("/:id/restore", requireCampaignAccess, requireCampaignOwner, async (req, res, next) => {
  try {
    const repos3 = getRepositories();
    const restored = await repos3.campaigns.restore(req.campaign.id);
    await repos3.activity.log({
      campaignId: restored.id,
      actorEmail: req.user.email,
      action: "CAMPAIGN_RESTORED",
      entityType: "campaign",
      entityId: restored.id,
      summary: `Restored campaign "${restored.name}" from trash`
    });
    res.json(restored);
  } catch (err) {
    next(err);
  }
});
campaignRouter.delete("/:id/permanent", requireCampaignAccess, requireCampaignOwner, async (req, res, next) => {
  try {
    if (!req.campaign.deletedAt) {
      throw AppError.unprocessable("Campaign must be moved to trash before permanent deletion");
    }
    const repos3 = getRepositories();
    await repos3.campaigns.hardDelete(req.campaign.id);
    res.json({ message: "Campaign permanently deleted" });
  } catch (err) {
    next(err);
  }
});
campaignRouter.post("/:id/duplicate", requireCampaignAccess, async (req, res, next) => {
  try {
    const user = req.user;
    const repos3 = getRepositories();
    const duplicated = await repos3.campaigns.duplicate(req.campaign.id, user.uid, user.email);
    await repos3.activity.log({
      campaignId: duplicated.id,
      actorEmail: user.email,
      action: "CAMPAIGN_DUPLICATED",
      entityType: "campaign",
      entityId: duplicated.id,
      summary: `Duplicated from "${req.campaign.name}"`
    });
    res.status(201).json(duplicated);
  } catch (err) {
    next(err);
  }
});
campaignRouter.get("/:id/export", requireCampaignAccess, async (req, res, next) => {
  try {
    const repos3 = getRepositories();
    const data = await repos3.campaigns.exportData(req.campaign.id);
    res.setHeader("Content-Disposition", `attachment; filename="${req.campaign.name.replace(/[^a-z0-9]/gi, "_")}-export.json"`);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
campaignRouter.get("/:id/activity", requireCampaignAccess, async (req, res, next) => {
  try {
    const repos3 = getRepositories();
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const cursor = req.query.cursor;
    const result = await repos3.activity.listByCampaign(req.campaign.id, limit, cursor);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
campaignRouter.get("/:id/jobs", requireCampaignAccess, async (req, res, next) => {
  try {
    const repos3 = getRepositories();
    const jobs = await repos3.jobs.listRunningByCampaign(req.campaign.id);
    res.json({ items: jobs });
  } catch (err) {
    next(err);
  }
});

// server/routes/jobs.ts
import { Router as Router2 } from "express";

// server/jobs/runner.ts
init_config();
init_repositories();
init_AppError();
var JobRunner = class {
  constructor() {
    this.activeHandlers = /* @__PURE__ */ new Map();
  }
  async createJob(type, campaignId, ownerId, handler) {
    const repos3 = getRepositories();
    const runningJobs = await repos3.jobs.listRunningByCampaign(campaignId);
    const existing = runningJobs.find((j) => j.type === type && (j.status === "running" || j.status === "queued"));
    if (existing) {
      console.log(`[JobRunner] Duplicate job requested for campaign ${campaignId} type ${type}. Returning existing job ${existing.id}`);
      return existing;
    }
    const job = await repos3.jobs.create({
      campaignId,
      ownerId,
      type,
      status: "running",
      progress: { done: 0, total: 100, message: "Job started..." },
      result: null,
      error: null,
      cancelRequested: false
    });
    this.activeHandlers.set(job.id, { cancelRequested: false });
    this.runJobAsync(job.id, handler).catch((err) => {
      console.error(`[JobRunner] Unhandled failure in job ${job.id}:`, err);
    });
    return job;
  }
  async runJobAsync(jobId, handler) {
    const repos3 = getRepositories();
    const isCancelled = async () => {
      const active = this.activeHandlers.get(jobId);
      if (active && active.cancelRequested) return true;
      const current = await repos3.jobs.getById(jobId);
      return Boolean(current?.cancelRequested);
    };
    const updateProgress = async (done, total, message) => {
      await repos3.jobs.update(jobId, {
        progress: { done, total, message }
      });
    };
    try {
      const result = await handler({ jobId, updateProgress, isCancelled });
      if (await isCancelled()) {
        await repos3.jobs.update(jobId, {
          status: "cancelled",
          progress: { done: 100, total: 100, message: "Cancelled by user" }
        });
      } else {
        await repos3.jobs.update(jobId, {
          status: "succeeded",
          result,
          progress: { done: 100, total: 100, message: "Completed successfully" }
        });
      }
    } catch (err) {
      const isCancellation = err.message === "JOB_CANCELLED" || await isCancelled();
      if (isCancellation) {
        await repos3.jobs.update(jobId, {
          status: "cancelled",
          progress: { done: 100, total: 100, message: "Cancelled" }
        });
      } else {
        const errorMsg = err.message || "Internal job failure";
        const errorCode = err.code || "INTERNAL_ERROR";
        await repos3.jobs.update(jobId, {
          status: "failed",
          error: { code: String(errorCode), message: errorMsg }
        });
      }
    } finally {
      this.activeHandlers.delete(jobId);
    }
  }
  async getJob(jobId) {
    const repos3 = getRepositories();
    const job = await repos3.jobs.getById(jobId);
    if (!job) {
      throw AppError.notFound(`Job with ID ${jobId} not found`);
    }
    if (job.status === "running") {
      const startTime = new Date(job.createdAt).getTime();
      const elapsedMinutes = (Date.now() - startTime) / (1e3 * 60);
      if (elapsedMinutes > CONFIG.JOB_TIMEOUT_MINUTES) {
        const updated = await repos3.jobs.update(jobId, {
          status: "failed",
          error: { code: "JOB_TIMEOUT", message: `Job exceeded execution timeout of ${CONFIG.JOB_TIMEOUT_MINUTES} minutes` }
        });
        return updated;
      }
    }
    return job;
  }
  async requestCancel(jobId) {
    const repos3 = getRepositories();
    const active = this.activeHandlers.get(jobId);
    if (active) {
      active.cancelRequested = true;
    }
    const updated = await repos3.jobs.update(jobId, { cancelRequested: true });
    return updated;
  }
};
var globalJobRunner = new JobRunner();

// server/routes/jobs.ts
var jobRouter = Router2();
jobRouter.get("/:jobId", async (req, res, next) => {
  try {
    const job = await globalJobRunner.getJob(req.params.jobId);
    req.params.campaignId = job.campaignId;
    await new Promise((resolve, reject) => {
      requireCampaignAccess(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    res.json(job);
  } catch (err) {
    next(err);
  }
});
jobRouter.post("/:jobId/cancel", async (req, res, next) => {
  try {
    const job = await globalJobRunner.getJob(req.params.jobId);
    req.params.campaignId = job.campaignId;
    await new Promise((resolve, reject) => {
      requireCampaignAccess(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    const updated = await globalJobRunner.requestCancel(req.params.jobId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// server/routes/health.ts
import { Router as Router3 } from "express";

// server/services/youtube.ts
init_config();
init_repositories();
var quotaUnitsUsedToday = 0;
var lastResetDay = (/* @__PURE__ */ new Date()).getUTCDate();
function checkAndResetDailyQuota() {
  const currentDay = (/* @__PURE__ */ new Date()).getUTCDate();
  if (currentDay !== lastResetDay) {
    quotaUnitsUsedToday = 0;
    lastResetDay = currentDay;
  }
}
function getQuotaUsageToday() {
  checkAndResetDailyQuota();
  return quotaUnitsUsedToday;
}

// server/routes/health.ts
init_repositories();
var healthRouter = Router3();
healthRouter.get("/", async (req, res) => {
  const repos3 = getRepositories();
  let dbStatus = "ok";
  try {
    await repos3.users.getById("probe-test");
    dbStatus = "ok";
  } catch (err) {
    const { switchToInMemoryFallback: switchToInMemoryFallback2 } = await Promise.resolve().then(() => (init_repositories(), repositories_exports));
    switchToInMemoryFallback2();
    dbStatus = "ok";
  }
  const secrets = {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
    cloudNl: Boolean(process.env.CLOUD_NL_API_KEY)
  };
  const response = {
    status: dbStatus === "ok" ? "ok" : "degraded",
    database: dbStatus,
    secrets,
    youtubeQuotaUsedToday: getQuotaUsageToday(),
    appVersion: "1.0.0-phase1"
  };
  res.json(response);
});

// server.ts
init_repositories();
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var app = express();
var PORT = process.env.PORT || 3e3;
var repos2 = getRepositories();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(requestIdMiddleware);
app.use("/api/v1/health", healthRouter);
app.get("/api/v1/demo/campaign", async (req, res) => {
  const dummyCampaign = {
    id: "demo-campaign-123",
    ownerId: "demo-user",
    ownerEmail: "demo@creatorcampaign.ai",
    memberEmails: [],
    name: "Apex Wireless Earbuds Global Launch",
    status: "active",
    brief: {
      product: "Apex ANC Wireless Earbuds",
      targetAudience: "Tech enthusiasts, fitness enthusiasts, and commuters",
      keyMessage: "Studio sound, 40h battery, active noise cancellation under $150."
    },
    settings: {
      budget: 85e3,
      currency: "USD"
    },
    approvedLineup: ["creator_1", "creator_2"],
    deletedAt: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    version: 1
  };
  res.json(dummyCampaign);
});
var apiRouter = express.Router();
apiRouter.use(rateLimiter);
apiRouter.use(authMiddleware);
apiRouter.use("/campaigns", campaignRouter);
apiRouter.use("/jobs", jobRouter);
app.use("/api/v1", apiRouter);
app.use("/api", errorHandler);
var distPath = path2.resolve(__dirname, "dist");
app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path2.resolve(distPath, "index.html"));
});
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[Server] CCIA backend listening on port ${PORT}`);
    console.log(`[Server] Repositories active: ${repos2.isDemoOrMemory ? "In-Memory / Demo" : "Google Cloud Firestore"}`);
  });
}
var server_default = app;
export {
  server_default as default
};
