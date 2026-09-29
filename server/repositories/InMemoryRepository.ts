import { randomUUID } from 'crypto';
import {
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignQuery,
  PaginatedResponse,
  User,
  Job,
  ActivityEntry,
  ALLOWED_STATUS_TRANSITIONS,
  CampaignStatus,
  Creator,
  CreatorQuery,
  PremortemRun,
  CreatorBrief,
  CreatorBriefVersion,
  SearchPack,
  TrackedVideo,
  VideoSnapshot,
  Alert,
  AlertType,
  PulseSummary,
} from '../../shared/types.ts';
import {
  CampaignRepository,
  UserRepository,
  JobRepository,
  ActivityRepository,
  CacheRepository,
  CreatorRepository,
  PremortemRepository,
  BriefRepository,
  SearchPackRepository,
  TrackedVideoRepository,
  AlertRepository,
  PulseSummaryRepository,
} from './interfaces.ts';
import { AppError } from '../errors/AppError.ts';
import { CONFIG } from '../../shared/config.ts';
import {
  DEMO_CAMPAIGN_ID,
  DEMO_CREATORS,
  DEMO_PREMORTEM_INITIAL,
  DEMO_PREMORTEM_SWAPPED,
} from '../fixtures/demoData.ts';

export class InMemoryCampaignRepository implements CampaignRepository {
  private campaigns: Map<string, Campaign> = new Map();
  // Map of campaignId -> subcollections (guidelines, creators, etc.)
  private subcollections: Map<string, { guidelines: unknown[]; creators: unknown[] }> = new Map();

  async create(data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deletedAt'> & { id?: string; createdAt?: string; updatedAt?: string; version?: number }): Promise<Campaign> {
    const now = new Date().toISOString();
    const id = data.id || `cmp_${randomUUID().slice(0, 8)}`;
    const campaign: Campaign = {
      ...data,
      id,
      deletedAt: null,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      version: data.version || 1,
    };
    this.campaigns.set(id, campaign);
    if (!this.subcollections.has(id)) {
      this.subcollections.set(id, { guidelines: [], creators: [] });
    }
    return campaign;
  }

  async getById(id: string): Promise<Campaign | null> {
    return this.campaigns.get(id) || null;
  }

  async list(query: Partial<CampaignQuery>, userEmail: string, userId: string): Promise<PaginatedResponse<Campaign>> {
    const emailLower = userEmail.toLowerCase();
    let items = Array.from(this.campaigns.values()).filter((c) => {
      // Must not be in trash
      if (c.deletedAt !== null) return false;
      // Must be owner or member
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

    // Sort
    const sortField = query.sort || 'updatedAt';
    const orderAsc = query.order === 'asc';
    items.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (valA < valB) return orderAsc ? -1 : 1;
      if (valA > valB) return orderAsc ? 1 : -1;
      return 0;
    });

    // Cursor pagination (offset-based encoded cursor for in-memory)
    let startIndex = 0;
    if (query.cursor) {
      const parsed = parseInt(Buffer.from(query.cursor, 'base64').toString('ascii'), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        startIndex = parsed;
      }
    }

    const limit = query.limit || CONFIG.DEFAULT_PAGE_SIZE;
    const paged = items.slice(startIndex, startIndex + limit);
    const nextIndex = startIndex + limit;
    const nextCursor = nextIndex < items.length ? Buffer.from(nextIndex.toString()).toString('base64') : null;

    return {
      items: paged,
      nextCursor,
      total: items.length,
    };
  }

  async listTrash(userId: string): Promise<PaginatedResponse<Campaign>> {
    const items = Array.from(this.campaigns.values())
      .filter((c) => c.ownerId === userId && c.deletedAt !== null)
      .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));

    return {
      items,
      nextCursor: null,
      total: items.length,
    };
  }

  async update(id: string, expectedVersion: number, updates: Partial<UpdateCampaignInput>): Promise<Campaign> {
    const existing = this.campaigns.get(id);
    if (!existing) {
      throw AppError.notFound('Campaign not found');
    }

    // Optimistic Concurrency Check
    if (existing.version !== expectedVersion) {
      throw AppError.conflict(
        `Campaign has been modified by someone else (version mismatch: expected ${expectedVersion}, got ${existing.version})`,
        existing as unknown as Record<string, unknown>
      );
    }

    // Validate status transition if status is being updated
    if (updates.status && updates.status !== existing.status) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes(updates.status)) {
        throw AppError.unprocessable(
          `Invalid status transition from "${existing.status}" to "${updates.status}". Allowed: ${allowed.join(', ') || 'none'}`
        );
      }
    }

    const updated: Campaign = {
      ...existing,
      name: updates.name ?? existing.name,
      status: updates.status ?? existing.status,
      memberEmails: updates.memberEmails ?? existing.memberEmails,
      brief: updates.brief !== undefined ? (updates.brief as Record<string, unknown>) : existing.brief,
      settings: updates.settings !== undefined ? (updates.settings as Record<string, unknown>) : existing.settings,
      approvedLineup: updates.approvedLineup !== undefined ? updates.approvedLineup : existing.approvedLineup,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };

    this.campaigns.set(id, updated);
    return updated;
  }

  async softDelete(id: string, expectedVersion: number): Promise<Campaign> {
    const existing = this.campaigns.get(id);
    if (!existing) {
      throw AppError.notFound('Campaign not found');
    }

    if (existing.version !== expectedVersion) {
      throw AppError.conflict(
        `Campaign has been modified by someone else before delete`,
        existing as unknown as Record<string, unknown>
      );
    }

    const updated: Campaign = {
      ...existing,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };
    this.campaigns.set(id, updated);
    return updated;
  }

  async restore(id: string): Promise<Campaign> {
    const existing = this.campaigns.get(id);
    if (!existing) {
      throw AppError.notFound('Campaign not found');
    }

    const updated: Campaign = {
      ...existing,
      deletedAt: null,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };
    this.campaigns.set(id, updated);
    return updated;
  }

  async hardDelete(id: string): Promise<void> {
    this.campaigns.delete(id);
    this.subcollections.delete(id);
  }

  async duplicate(id: string, newOwnerId: string, newOwnerEmail: string): Promise<Campaign> {
    const existing = this.campaigns.get(id);
    if (!existing) {
      throw AppError.notFound('Campaign not found');
    }

    const now = new Date().toISOString();
    const newId = `cmp_${randomUUID().slice(0, 8)}`;
    const sub = this.subcollections.get(id) || { guidelines: [], creators: [] };

    const newCampaign: Campaign = {
      id: newId,
      ownerId: newOwnerId,
      ownerEmail: newOwnerEmail,
      memberEmails: [],
      name: `Copy of ${existing.name}`,
      status: 'draft',
      brief: JSON.parse(JSON.stringify(existing.brief || {})),
      settings: JSON.parse(JSON.stringify(existing.settings || {})),
      approvedLineup: [],
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.campaigns.set(newId, newCampaign);
    // Duplicate guidelines & creators (inputs only, not analysis results)
    this.subcollections.set(newId, {
      guidelines: JSON.parse(JSON.stringify(sub.guidelines || [])),
      creators: JSON.parse(JSON.stringify(sub.creators || [])),
    });

    return newCampaign;
  }

  async exportData(id: string): Promise<Record<string, unknown>> {
    const existing = this.campaigns.get(id);
    if (!existing) {
      throw AppError.notFound('Campaign not found');
    }
    const sub = this.subcollections.get(id) || { guidelines: [], creators: [] };

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      campaign: {
        name: existing.name,
        brief: existing.brief || {},
        settings: existing.settings || {},
        guidelines: sub.guidelines || [],
        creators: sub.creators || [],
      },
    };
  }

  async importData(data: Record<string, unknown>, ownerId: string, ownerEmail: string): Promise<Campaign> {
    const campaignObj = (data.campaign as Record<string, unknown>) || {};
    const name = (campaignObj.name as string) || 'Imported Campaign';

    const now = new Date().toISOString();
    const id = `cmp_${randomUUID().slice(0, 8)}`;

    const campaign: Campaign = {
      id,
      ownerId,
      ownerEmail,
      memberEmails: [],
      name,
      status: 'draft',
      brief: (campaignObj.brief as Record<string, unknown>) || {},
      settings: (campaignObj.settings as Record<string, unknown>) || {},
      approvedLineup: [],
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.campaigns.set(id, campaign);
    this.subcollections.set(id, {
      guidelines: Array.isArray(campaignObj.guidelines) ? campaignObj.guidelines : [],
      creators: Array.isArray(campaignObj.creators) ? campaignObj.creators : [],
    });

    return campaign;
  }

  // Helper for tests/fixtures
  seed(campaigns: Campaign[]) {
    for (const c of campaigns) {
      this.campaigns.set(c.id, c);
    }
  }

  clear() {
    this.campaigns.clear();
    this.subcollections.clear();
  }
}

export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  async getById(uid: string): Promise<User | null> {
    return this.users.get(uid) || null;
  }

  async upsert(user: User): Promise<User> {
    this.users.set(user.uid, user);
    return user;
  }
}

export class InMemoryJobRepository implements JobRepository {
  private jobs: Map<string, Job> = new Map();

  async create(data: Omit<Job, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string; updatedAt?: string }): Promise<Job> {
    const now = new Date().toISOString();
    const id = data.id || `job_${randomUUID().slice(0, 8)}`;
    const job: Job = {
      ...data,
      id,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };
    this.jobs.set(id, job);
    return job;
  }

  async getById(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  async listRunningByCampaign(campaignId: string): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter(
      (j) => j.campaignId === campaignId && (j.status === 'running' || j.status === 'queued')
    );
  }

  async update(id: string, updates: Partial<Job>): Promise<Job> {
    const job = this.jobs.get(id);
    if (!job) {
      throw AppError.notFound('Job not found');
    }
    const updated: Job = {
      ...job,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }
}

export class InMemoryActivityRepository implements ActivityRepository {
  private activities: ActivityEntry[] = [];

  async log(entry: Omit<ActivityEntry, 'id' | 'at'> & { id?: string; at?: string }): Promise<ActivityEntry> {
    const activity: ActivityEntry = {
      ...entry,
      id: entry.id || `act_${randomUUID().slice(0, 8)}`,
      at: entry.at || new Date().toISOString(),
    };
    this.activities.unshift(activity);
    return activity;
  }

  async listByCampaign(campaignId: string, limit = 20, cursor?: string): Promise<PaginatedResponse<ActivityEntry>> {
    let list = this.activities.filter((a) => a.campaignId === campaignId);

    let startIndex = 0;
    if (cursor) {
      const parsed = parseInt(Buffer.from(cursor, 'base64').toString('ascii'), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        startIndex = parsed;
      }
    }

    const paged = list.slice(startIndex, startIndex + limit);
    const nextIndex = startIndex + limit;
    const nextCursor = nextIndex < list.length ? Buffer.from(nextIndex.toString()).toString('base64') : null;

    return {
      items: paged,
      nextCursor,
      total: list.length,
    };
  }
}

export class InMemoryCacheRepository implements CacheRepository {
  private cache: Map<string, { value: unknown; expiresAt: number }> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }
}

export class InMemoryCreatorRepository implements CreatorRepository {
  // Map of campaignId -> Map of creatorId -> Creator
  private store: Map<string, Map<string, Creator>> = new Map();

  private getCampaignStore(campaignId: string): Map<string, Creator> {
    let map = this.store.get(campaignId);
    if (!map) {
      map = new Map();
      this.store.set(campaignId, map);
    }
    return map;
  }

  async create(campaignId: string, data: Omit<Creator, 'id' | 'createdAt' | 'updatedAt' | 'version'> & { id?: string; createdAt?: string; updatedAt?: string; version?: number }): Promise<Creator> {
    const store = this.getCampaignStore(campaignId);
    const now = new Date().toISOString();
    const id = data.id || `crt_${randomUUID().slice(0, 8)}`;

    const creator: Creator = {
      ...data,
      id,
      campaignId,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      version: data.version || 1,
    };

    store.set(id, creator);
    return creator;
  }

  async getById(campaignId: string, creatorId: string): Promise<Creator | null> {
    const store = this.getCampaignStore(campaignId);
    const c = store.get(creatorId);
    if (c) return c;
    if (campaignId === DEMO_CAMPAIGN_ID) {
      return DEMO_CREATORS.find((d) => d.id === creatorId) || null;
    }
    // Cross-campaign fallback lookup
    for (const otherStore of this.store.values()) {
      if (otherStore.has(creatorId)) {
        return otherStore.get(creatorId)!;
      }
    }
    return DEMO_CREATORS.find((d) => d.id === creatorId) || null;
  }

  async list(campaignId: string, query?: Partial<CreatorQuery>): Promise<Creator[]> {
    const store = this.getCampaignStore(campaignId);
    let list = Array.from(store.values());

    if (query?.status) {
      list = list.filter((c) => c.status === query.status);
    }

    if (query?.selected !== undefined) {
      const isSelected = query.selected === 'true';
      list = list.filter((c) => c.selected === isSelected);
    }

    if (query?.tier && query.tier !== 'all') {
      list = list.filter((c) => c.scores?.tier === query.tier);
    }

    const sortField = query?.sort || 'fitScore';
    const sortOrder = query?.order || 'desc';

    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      if (sortField === 'fitScore') {
        valA = a.scores?.fitScore ?? -1;
        valB = b.scores?.fitScore ?? -1;
      } else if (sortField === 'subscribers') {
        valA = a.channel?.subscriberCount ?? -1;
        valB = b.channel?.subscriberCount ?? -1;
      } else if (sortField === 'medianViews') {
        valA = a.metrics?.longForm?.medianViews || a.metrics?.shorts?.medianViews || -1;
        valB = b.metrics?.longForm?.medianViews || b.metrics?.shorts?.medianViews || -1;
      } else if (sortField === 'engagementRate') {
        valA = a.metrics?.longForm?.medianEngagementRate || a.metrics?.shorts?.medianEngagementRate || -1;
        valB = b.metrics?.longForm?.medianEngagementRate || b.metrics?.shorts?.medianEngagementRate || -1;
      } else if (sortField === 'name') {
        valA = (a.channel?.title || a.input).toLowerCase();
        valB = (b.channel?.title || b.input).toLowerCase();
      } else {
        valA = a.createdAt;
        valB = b.createdAt;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }

  async update(campaignId: string, creatorId: string, expectedVersion: number, updates: Partial<Creator>): Promise<Creator> {
    const store = this.getCampaignStore(campaignId);
    let existing = store.get(creatorId);
    let targetStore = store;

    if (!existing) {
      if (campaignId === DEMO_CAMPAIGN_ID) {
        const demo = DEMO_CREATORS.find((d) => d.id === creatorId);
        if (demo) {
          existing = { ...demo, campaignId };
          store.set(creatorId, existing);
        }
      } else {
        for (const otherStore of this.store.values()) {
          if (otherStore.has(creatorId)) {
            existing = otherStore.get(creatorId);
            targetStore = otherStore;
            break;
          }
        }
      }
    }

    if (!existing) {
      throw AppError.notFound(`Creator ${creatorId} not found`);
    }

    if (existing.version !== expectedVersion) {
      throw AppError.conflict(
        `Version conflict: current creator version is ${existing.version}, expected ${expectedVersion}`
      );
    }

    const updated: Creator = {
      ...existing,
      ...updates,
      id: existing.id,
      campaignId: existing.campaignId,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    targetStore.set(creatorId, updated);
    return updated;
  }

  async delete(campaignId: string, creatorId: string): Promise<void> {
    const store = this.getCampaignStore(campaignId);
    store.delete(creatorId);
  }

  async count(campaignId: string): Promise<number> {
    const store = this.getCampaignStore(campaignId);
    return store.size;
  }

  async findByNormalizedKey(campaignId: string, normalizedKey: string): Promise<Creator | null> {
    const store = this.getCampaignStore(campaignId);
    const normalizedLower = normalizedKey.toLowerCase();
    for (const creator of store.values()) {
      if (
        creator.normalizedKey.toLowerCase() === normalizedLower ||
        (creator.channel?.channelId && creator.channel.channelId === normalizedKey)
      ) {
        return creator;
      }
    }
    return null;
  }

  async bulkUpsert(campaignId: string, creators: Creator[]): Promise<void> {
    const store = this.getCampaignStore(campaignId);
    for (const c of creators) {
      store.set(c.id, c);
    }
  }
}

export class InMemoryPremortemRepository implements PremortemRepository {
  // Map of campaignId -> Map of runId -> PremortemRun
  private store: Map<string, Map<string, PremortemRun>> = new Map();

  private getCampaignStore(campaignId: string): Map<string, PremortemRun> {
    let map = this.store.get(campaignId);
    if (!map) {
      map = new Map();
      this.store.set(campaignId, map);
    }
    return map;
  }

  async create(campaignId: string, data: Omit<PremortemRun, 'id' | 'createdAt' | 'updatedAt' | 'version'> & { id?: string; createdAt?: string; updatedAt?: string; version?: number }): Promise<PremortemRun> {
    const store = this.getCampaignStore(campaignId);
    const now = new Date().toISOString();
    const id = data.id || `run_${randomUUID().slice(0, 8)}`;

    const run: PremortemRun = {
      ...data,
      id,
      campaignId,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      version: data.version || 1,
    };

    store.set(id, run);
    return run;
  }

  async getById(campaignId: string, runId: string): Promise<PremortemRun | null> {
    const store = this.getCampaignStore(campaignId);
    const found = store.get(runId);
    if (found) return found;
    if (campaignId === DEMO_CAMPAIGN_ID) {
      if (runId === DEMO_PREMORTEM_SWAPPED.id) return DEMO_PREMORTEM_SWAPPED;
      if (runId === DEMO_PREMORTEM_INITIAL.id) return DEMO_PREMORTEM_INITIAL;
    }
    return null;
  }

  async list(campaignId: string): Promise<PremortemRun[]> {
    const store = this.getCampaignStore(campaignId);
    let list = Array.from(store.values());
    if (list.length === 0 && campaignId === DEMO_CAMPAIGN_ID) {
      list = [DEMO_PREMORTEM_SWAPPED, DEMO_PREMORTEM_INITIAL];
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  async update(campaignId: string, runId: string, expectedVersion: number, updates: Partial<PremortemRun>): Promise<PremortemRun> {
    const store = this.getCampaignStore(campaignId);
    const existing = store.get(runId);
    if (!existing) {
      throw AppError.notFound(`Pre-Mortem run ${runId} not found`);
    }

    if (existing.version !== expectedVersion) {
      throw AppError.conflict(
        `Version conflict: current run version is ${existing.version}, expected ${expectedVersion}`
      );
    }

    const updated: PremortemRun = {
      ...existing,
      ...updates,
      id: existing.id,
      campaignId: existing.campaignId,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    store.set(runId, updated);
    return updated;
  }

  async delete(campaignId: string, runId: string): Promise<void> {
    const store = this.getCampaignStore(campaignId);
    const existing = store.get(runId);
    if (!existing) {
      throw AppError.notFound(`Pre-Mortem run ${runId} not found`);
    }
    if (existing.approved) {
      throw AppError.validation('Cannot delete an approved Pre-Mortem run. Approve a different run or keep it as historical reference.');
    }
    store.delete(runId);
  }

  async setApprovedRun(campaignId: string, runId: string): Promise<void> {
    const store = this.getCampaignStore(campaignId);
    for (const [id, run] of store.entries()) {
      if (id === runId) {
        store.set(id, { ...run, approved: true, updatedAt: new Date().toISOString() });
      } else if (run.approved) {
        store.set(id, { ...run, approved: false, updatedAt: new Date().toISOString() });
      }
    }
  }
}

export class InMemoryBriefRepository implements BriefRepository {
  // campaignId -> Map<creatorId, CreatorBrief>
  private briefs: Map<string, Map<string, CreatorBrief>> = new Map();
  // `${campaignId}:${creatorId}` -> CreatorBriefVersion[]
  private versions: Map<string, CreatorBriefVersion[]> = new Map();

  private getCampaignBriefs(campaignId: string): Map<string, CreatorBrief> {
    let store = this.briefs.get(campaignId);
    if (!store) {
      store = new Map();
      this.briefs.set(campaignId, store);
    }
    return store;
  }

  async list(campaignId: string): Promise<CreatorBrief[]> {
    const store = this.getCampaignBriefs(campaignId);
    return Array.from(store.values());
  }

  async getById(campaignId: string, creatorId: string): Promise<CreatorBrief | null> {
    const store = this.getCampaignBriefs(campaignId);
    return store.get(creatorId) || null;
  }

  async upsert(campaignId: string, brief: CreatorBrief): Promise<CreatorBrief> {
    const store = this.getCampaignBriefs(campaignId);
    const now = new Date().toISOString();
    const existing = store.get(brief.creatorId);

    const updated: CreatorBrief = {
      ...brief,
      campaignId,
      creatorId: brief.creatorId,
      id: brief.id || brief.creatorId,
      updatedAt: now,
      generatedAt: existing?.generatedAt || brief.generatedAt || now,
      version: (existing?.version || 0) + 1,
    };

    store.set(brief.creatorId, updated);
    return updated;
  }

  async update(
    campaignId: string,
    creatorId: string,
    expectedVersion: number,
    updates: Partial<CreatorBrief>
  ): Promise<CreatorBrief> {
    const store = this.getCampaignBriefs(campaignId);
    const existing = store.get(creatorId);
    if (!existing) {
      throw AppError.notFound(`Brief for creator ${creatorId} not found`);
    }

    if (existing.version !== expectedVersion) {
      throw AppError.conflict(
        `Version conflict: current brief version is ${existing.version}, expected ${expectedVersion}`
      );
    }

    const updated: CreatorBrief = {
      ...existing,
      ...updates,
      campaignId,
      creatorId,
      id: existing.id,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    store.set(creatorId, updated);
    return updated;
  }

  async delete(campaignId: string, creatorId: string): Promise<void> {
    const store = this.getCampaignBriefs(campaignId);
    if (!store.has(creatorId)) {
      throw AppError.notFound(`Brief for creator ${creatorId} not found`);
    }
    store.delete(creatorId);
    this.versions.delete(`${campaignId}:${creatorId}`);
  }

  async listVersions(campaignId: string, creatorId: string): Promise<CreatorBriefVersion[]> {
    const key = `${campaignId}:${creatorId}`;
    const list = this.versions.get(key) || [];
    // Return newest first
    return [...list].sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async getVersion(
    campaignId: string,
    creatorId: string,
    versionNumber: number
  ): Promise<CreatorBriefVersion | null> {
    const key = `${campaignId}:${creatorId}`;
    const list = this.versions.get(key) || [];
    return list.find((v) => v.versionNumber === versionNumber) || null;
  }

  async createVersion(
    campaignId: string,
    creatorId: string,
    version: CreatorBriefVersion
  ): Promise<CreatorBriefVersion> {
    const key = `${campaignId}:${creatorId}`;
    let list = this.versions.get(key);
    if (!list) {
      list = [];
      this.versions.set(key, list);
    }
    list.push(version);
    return version;
  }
}

export class InMemorySearchPackRepository implements SearchPackRepository {
  private store: Map<string, SearchPack> = new Map();

  async get(campaignId: string): Promise<SearchPack | null> {
    return this.store.get(campaignId) || null;
  }

  async upsert(campaignId: string, searchPack: SearchPack): Promise<SearchPack> {
    const existing = this.store.get(campaignId);
    const now = new Date().toISOString();
    const updated: SearchPack = {
      ...searchPack,
      campaignId,
      id: existing?.id || searchPack.id || `sp_${randomUUID().slice(0, 8)}`,
      generatedAt: existing?.generatedAt || searchPack.generatedAt || now,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };
    this.store.set(campaignId, updated);
    return updated;
  }

  async update(campaignId: string, expectedVersion: number, updates: Partial<SearchPack>): Promise<SearchPack> {
    const existing = this.store.get(campaignId);
    if (!existing) {
      throw AppError.notFound(`Search pack for campaign ${campaignId} not found`);
    }

    if (existing.version !== expectedVersion) {
      throw AppError.conflict(
        `Version conflict: current search pack version is ${existing.version}, expected ${expectedVersion}`
      );
    }

    const updated: SearchPack = {
      ...existing,
      ...updates,
      campaignId,
      id: existing.id,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.store.set(campaignId, updated);
    return updated;
  }

  async delete(campaignId: string): Promise<void> {
    if (!this.store.has(campaignId)) {
      throw AppError.notFound(`Search pack for campaign ${campaignId} not found`);
    }
    this.store.delete(campaignId);
  }
}

export class InMemoryTrackedVideoRepository implements TrackedVideoRepository {
  private videosMap: Map<string, TrackedVideo[]> = new Map(); // campaignId -> TrackedVideo[]
  private snapshotsMap: Map<string, VideoSnapshot[]> = new Map(); // `${campaignId}:${videoId}` -> VideoSnapshot[]

  async list(campaignId: string): Promise<TrackedVideo[]> {
    return this.videosMap.get(campaignId) || [];
  }

  async get(campaignId: string, videoId: string): Promise<TrackedVideo | null> {
    const list = await this.list(campaignId);
    return list.find((v) => v.videoId === videoId || v.id === videoId) || null;
  }

  async create(campaignId: string, video: TrackedVideo): Promise<TrackedVideo> {
    const list = this.videosMap.get(campaignId) || [];
    const existingIndex = list.findIndex((v) => v.videoId === video.videoId);
    if (existingIndex >= 0) {
      list[existingIndex] = video;
    } else {
      list.push(video);
    }
    this.videosMap.set(campaignId, list);
    return video;
  }

  async update(campaignId: string, videoId: string, updates: Partial<TrackedVideo>): Promise<TrackedVideo> {
    const list = this.videosMap.get(campaignId) || [];
    const index = list.findIndex((v) => v.videoId === videoId || v.id === videoId);
    if (index === -1) {
      throw AppError.notFound(`Tracked video ${videoId} not found`);
    }
    const updated = { ...list[index], ...updates };
    list[index] = updated;
    this.videosMap.set(campaignId, list);
    return updated;
  }

  async delete(campaignId: string, videoId: string): Promise<void> {
    const list = this.videosMap.get(campaignId) || [];
    const filtered = list.filter((v) => v.videoId !== videoId && v.id !== videoId);
    this.videosMap.set(campaignId, filtered);
    this.snapshotsMap.delete(`${campaignId}:${videoId}`);
  }

  async addSnapshot(campaignId: string, videoId: string, snapshot: VideoSnapshot): Promise<VideoSnapshot> {
    const key = `${campaignId}:${videoId}`;
    let snapshots = this.snapshotsMap.get(key) || [];
    snapshots.push(snapshot);

    // Downsample if snapshots exceed 500
    if (snapshots.length > CONFIG.LIVE_MAX_SNAPSHOTS_PER_VIDEO) {
      // Keep newer half intact, downsample older half (take every 2nd snapshot)
      const half = Math.floor(snapshots.length / 2);
      const olderHalf = snapshots.slice(0, half).filter((_, i) => i % 2 === 0);
      const newerHalf = snapshots.slice(half);
      snapshots = [...olderHalf, ...newerHalf];
    }

    this.snapshotsMap.set(key, snapshots);
    return snapshot;
  }

  async getSnapshots(campaignId: string, videoId: string, from?: string, to?: string): Promise<VideoSnapshot[]> {
    const key = `${campaignId}:${videoId}`;
    let snapshots = this.snapshotsMap.get(key) || [];
    if (from) {
      snapshots = snapshots.filter((s) => s.at >= from);
    }
    if (to) {
      snapshots = snapshots.filter((s) => s.at <= to);
    }
    return snapshots;
  }
}

export class InMemoryAlertRepository implements AlertRepository {
  private alertsMap: Map<string, Alert[]> = new Map(); // campaignId -> Alert[]

  async list(campaignId: string, filters?: { acknowledged?: boolean; active?: boolean }): Promise<Alert[]> {
    let alerts = this.alertsMap.get(campaignId) || [];
    if (filters?.acknowledged !== undefined) {
      alerts = alerts.filter((a) => a.acknowledged === filters.acknowledged);
    }
    if (filters?.active !== undefined) {
      alerts = alerts.filter((a) => (filters.active ? a.resolvedAt === null : a.resolvedAt !== null));
    }
    return alerts;
  }

  async get(campaignId: string, alertId: string): Promise<Alert | null> {
    const alerts = this.alertsMap.get(campaignId) || [];
    return alerts.find((a) => a.id === alertId) || null;
  }

  async findActiveByTypeAndVideo(campaignId: string, type: AlertType, videoId: string): Promise<Alert | null> {
    const alerts = this.alertsMap.get(campaignId) || [];
    return alerts.find((a) => a.type === type && a.videoId === videoId && a.resolvedAt === null) || null;
  }

  async upsert(campaignId: string, alert: Alert): Promise<Alert> {
    const alerts = this.alertsMap.get(campaignId) || [];
    const index = alerts.findIndex((a) => a.id === alert.id);
    if (index >= 0) {
      alerts[index] = alert;
    } else {
      alerts.push(alert);
    }
    this.alertsMap.set(campaignId, alerts);
    return alert;
  }

  async update(campaignId: string, alertId: string, updates: Partial<Alert>): Promise<Alert> {
    const alerts = this.alertsMap.get(campaignId) || [];
    const index = alerts.findIndex((a) => a.id === alertId);
    if (index === -1) {
      throw AppError.notFound(`Alert ${alertId} not found`);
    }
    const updated = { ...alerts[index], ...updates };
    alerts[index] = updated;
    this.alertsMap.set(campaignId, alerts);
    return updated;
  }
}

export class InMemoryPulseSummaryRepository implements PulseSummaryRepository {
  private summaryMap: Map<string, PulseSummary> = new Map(); // campaignId -> latest PulseSummary

  async getLatest(campaignId: string): Promise<PulseSummary | null> {
    return this.summaryMap.get(campaignId) || null;
  }

  async create(campaignId: string, summary: PulseSummary): Promise<PulseSummary> {
    this.summaryMap.set(campaignId, summary);
    return summary;
  }
}



