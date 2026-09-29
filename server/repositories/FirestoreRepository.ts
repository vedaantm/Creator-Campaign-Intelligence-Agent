import { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
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
import {
  InMemoryCampaignRepository,
  InMemoryUserRepository,
  InMemoryJobRepository,
  InMemoryActivityRepository,
  InMemoryCacheRepository,
  InMemoryCreatorRepository,
  InMemoryPremortemRepository,
  InMemoryBriefRepository,
  InMemorySearchPackRepository,
  InMemoryTrackedVideoRepository,
  InMemoryAlertRepository,
  InMemoryPulseSummaryRepository,
} from './InMemoryRepository.ts';
import { AppError } from '../errors/AppError.ts';
import { CONFIG } from '../../shared/config.ts';

let isFirestoreAccessible = true;

function markFirestoreUnavailable(err?: unknown) {
  if (isFirestoreAccessible) {
    isFirestoreAccessible = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[FirestoreRepository] Operating with resilient in-memory storage (Firestore unreachable: ${msg})`);
  }
}

export class FirestoreCampaignRepository implements CampaignRepository {
  private db: Firestore;
  private fallback: InMemoryCampaignRepository;

  constructor(db: Firestore, fallback?: InMemoryCampaignRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryCampaignRepository();
  }

  private col() {
    return this.db.collection('campaigns');
  }

  async create(data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deletedAt'> & { id?: string; createdAt?: string; updatedAt?: string; version?: number }): Promise<Campaign> {
    const docRef = data.id ? this.col().doc(data.id) : this.col().doc();
    const now = new Date().toISOString();
    const campaign: Campaign = {
      ...data,
      id: docRef.id,
      deletedAt: null,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      version: data.version || 1,
    };

    if (isFirestoreAccessible) {
      try {
        await docRef.set(campaign);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.create(campaign);
    return campaign;
  }

  async getById(id: string): Promise<Campaign | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.col().doc(id).get();
        if (doc.exists) {
          const c = doc.data() as Campaign;
          this.fallback.create(c).catch(() => {});
          return c;
        }
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getById(id);
  }

  async list(query: Partial<CampaignQuery>, userEmail: string, userId: string): Promise<PaginatedResponse<Campaign>> {
    if (isFirestoreAccessible) {
      try {
        const emailLower = (userEmail || '').toLowerCase();
        const snapshot = await this.col().where('deletedAt', '==', null).get();

        let items: Campaign[] = [];
        snapshot.forEach((doc: QueryDocumentSnapshot) => {
          const c = doc.data() as Campaign;
          const isOwner = c.ownerId === userId || Boolean(c.ownerEmail && c.ownerEmail.toLowerCase() === emailLower);
          const isMember = Array.isArray(c.memberEmails) && c.memberEmails.some((m: string) => typeof m === 'string' && m.toLowerCase() === emailLower);
          if (isOwner || isMember) {
            items.push(c);
          }
        });

        if (query.status) {
          items = items.filter((c) => c.status === query.status);
        }

        if (query.search) {
          const q = query.search.toLowerCase();
          items = items.filter((c) => (c.name || '').toLowerCase().includes(q));
        }

        const sortField = query.sort || 'updatedAt';
        const orderAsc = query.order === 'asc';
        items.sort((a, b) => {
          const valA = a[sortField];
          const valB = b[sortField];
          if (valA < valB) return orderAsc ? -1 : 1;
          if (valA > valB) return orderAsc ? 1 : -1;
          return 0;
        });

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
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.list(query, userEmail, userId);
  }

  async listTrash(userId: string): Promise<PaginatedResponse<Campaign>> {
    if (isFirestoreAccessible) {
      try {
        const snapshot = await this.col()
          .where('ownerId', '==', userId)
          .where('deletedAt', '!=', null)
          .get();

        const items: Campaign[] = [];
        snapshot.forEach((doc: QueryDocumentSnapshot) => items.push(doc.data() as Campaign));
        items.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));

        return {
          items,
          nextCursor: null,
          total: items.length,
        };
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.listTrash(userId);
  }

  async update(id: string, expectedVersion: number, updates: Partial<UpdateCampaignInput>): Promise<Campaign> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col().doc(id);
        const snap = await docRef.get();
        if (snap.exists) {
          const existing = snap.data() as Campaign;
          if (existing.version !== expectedVersion) {
            throw AppError.conflict(
              `Campaign has been modified by someone else (version mismatch: expected ${expectedVersion}, got ${existing.version})`,
              existing as unknown as Record<string, unknown>
            );
          }

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

          await docRef.set(updated);
          await this.fallback.update(id, expectedVersion, updates).catch(() => {});
          return updated;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.update(id, expectedVersion, updates);
  }

  async softDelete(id: string, expectedVersion: number): Promise<Campaign> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col().doc(id);
        const snap = await docRef.get();
        if (snap.exists) {
          const existing = snap.data() as Campaign;
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

          await docRef.set(updated);
          await this.fallback.softDelete(id, expectedVersion).catch(() => {});
          return updated;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.softDelete(id, expectedVersion);
  }

  async restore(id: string): Promise<Campaign> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col().doc(id);
        const snap = await docRef.get();
        if (snap.exists) {
          const existing = snap.data() as Campaign;
          const updated: Campaign = {
            ...existing,
            deletedAt: null,
            updatedAt: new Date().toISOString(),
            version: existing.version + 1,
          };

          await docRef.set(updated);
          await this.fallback.restore(id).catch(() => {});
          return updated;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.restore(id);
  }

  async hardDelete(id: string): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col().doc(id);
        const subcollections = [
          'creators',
          'guidelines',
          'premortemRuns',
          'briefs',
          'submissions',
          'searchPack',
          'trackedVideos',
          'alerts',
          'pulseSummaries',
          'activity',
        ];

        for (const sub of subcollections) {
          const subSnap = await docRef.collection(sub).limit(100).get();
          const batch = this.db.batch();
          subSnap.forEach((doc: QueryDocumentSnapshot) => batch.delete(doc.ref));
          await batch.commit();
        }

        await docRef.delete();
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.hardDelete(id);
  }

  async duplicate(id: string, newOwnerId: string, newOwnerEmail: string): Promise<Campaign> {
    if (isFirestoreAccessible) {
      try {
        const existing = await this.getById(id);
        if (!existing) {
          throw AppError.notFound('Campaign not found');
        }

        const docRef = this.col().doc();
        const now = new Date().toISOString();

        const newCampaign: Campaign = {
          id: docRef.id,
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

        await docRef.set(newCampaign);

        const oldRef = this.col().doc(id);
        for (const sub of ['guidelines', 'creators']) {
          const subDocs = await oldRef.collection(sub).get();
          if (!subDocs.empty) {
            const batch = this.db.batch();
            subDocs.forEach((d: QueryDocumentSnapshot) => {
              const newSubRef = docRef.collection(sub).doc();
              batch.set(newSubRef, d.data());
            });
            await batch.commit();
          }
        }

        await this.fallback.create(newCampaign);
        return newCampaign;
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.duplicate(id, newOwnerId, newOwnerEmail);
  }

  async exportData(id: string): Promise<Record<string, unknown>> {
    if (isFirestoreAccessible) {
      try {
        const existing = await this.getById(id);
        if (!existing) {
          throw AppError.notFound('Campaign not found');
        }

        const docRef = this.col().doc(id);
        const guidelinesSnap = await docRef.collection('guidelines').get();
        const creatorsSnap = await docRef.collection('creators').get();

        const guidelines: unknown[] = [];
        guidelinesSnap.forEach((d: QueryDocumentSnapshot) => guidelines.push(d.data()));

        const creators: unknown[] = [];
        creatorsSnap.forEach((d: QueryDocumentSnapshot) => creators.push(d.data()));

        return {
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          campaign: {
            name: existing.name,
            brief: existing.brief || {},
            settings: existing.settings || {},
            guidelines,
            creators,
          },
        };
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.exportData(id);
  }

  async importData(data: Record<string, unknown>, ownerId: string, ownerEmail: string): Promise<Campaign> {
    if (isFirestoreAccessible) {
      try {
        const campaignObj = (data.campaign as Record<string, unknown>) || {};
        const name = (campaignObj.name as string) || 'Imported Campaign';

        const docRef = this.col().doc();
        const now = new Date().toISOString();

        const campaign: Campaign = {
          id: docRef.id,
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

        await docRef.set(campaign);

        if (Array.isArray(campaignObj.guidelines) && campaignObj.guidelines.length > 0) {
          const batch = this.db.batch();
          for (const g of campaignObj.guidelines) {
            batch.set(docRef.collection('guidelines').doc(), g as Record<string, unknown>);
          }
          await batch.commit();
        }

        if (Array.isArray(campaignObj.creators) && campaignObj.creators.length > 0) {
          const batch = this.db.batch();
          for (const c of campaignObj.creators) {
            batch.set(docRef.collection('creators').doc(), c as Record<string, unknown>);
          }
          await batch.commit();
        }

        await this.fallback.create(campaign);
        return campaign;
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.importData(data, ownerId, ownerEmail);
  }
}

export class FirestoreUserRepository implements UserRepository {
  private db: Firestore;
  private fallback: InMemoryUserRepository;

  constructor(db: Firestore, fallback?: InMemoryUserRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryUserRepository();
  }

  async getById(uid: string): Promise<User | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.db.collection('users').doc(uid).get();
        if (doc.exists) return doc.data() as User;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getById(uid);
  }

  async upsert(user: User): Promise<User> {
    if (isFirestoreAccessible) {
      try {
        await this.db.collection('users').doc(user.uid).set(user, { merge: true });
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.upsert(user);
    return user;
  }
}

export class FirestoreJobRepository implements JobRepository {
  private db: Firestore;
  private fallback: InMemoryJobRepository;

  constructor(db: Firestore, fallback?: InMemoryJobRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryJobRepository();
  }

  async create(data: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>): Promise<Job> {
    const docRef = this.db.collection('jobs').doc();
    const now = new Date().toISOString();
    const job: Job = {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    };
    if (isFirestoreAccessible) {
      try {
        await docRef.set(job);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.create(job);
    return job;
  }

  async getById(id: string): Promise<Job | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.db.collection('jobs').doc(id).get();
        if (doc.exists) return doc.data() as Job;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getById(id);
  }

  async listRunningByCampaign(campaignId: string): Promise<Job[]> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.db
          .collection('jobs')
          .where('campaignId', '==', campaignId)
          .where('status', 'in', ['queued', 'running'])
          .get();

        const jobs: Job[] = [];
        snap.forEach((d: QueryDocumentSnapshot) => jobs.push(d.data() as Job));
        return jobs;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.listRunningByCampaign(campaignId);
  }

  async update(id: string, updates: Partial<Job>): Promise<Job> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.db.collection('jobs').doc(id);
        const snap = await docRef.get();
        if (snap.exists) {
          const updated: Job = {
            ...(snap.data() as Job),
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          await docRef.set(updated, { merge: true });
          await this.fallback.update(id, updates).catch(() => {});
          return updated;
        }
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.update(id, updates);
  }
}

export class FirestoreActivityRepository implements ActivityRepository {
  private db: Firestore;
  private fallback: InMemoryActivityRepository;

  constructor(db: Firestore, fallback?: InMemoryActivityRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryActivityRepository();
  }

  async log(entry: Omit<ActivityEntry, 'id' | 'at'>): Promise<ActivityEntry> {
    const docRef = this.db
      .collection('campaigns')
      .doc(entry.campaignId)
      .collection('activity')
      .doc();

    const activity: ActivityEntry = {
      ...entry,
      id: docRef.id,
      at: new Date().toISOString(),
    };

    if (isFirestoreAccessible) {
      try {
        await docRef.set(activity);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.log(activity);
    return activity;
  }

  async listByCampaign(campaignId: string, limit = 20, cursor?: string): Promise<PaginatedResponse<ActivityEntry>> {
    if (isFirestoreAccessible) {
      try {
        let query = this.db
          .collection('campaigns')
          .doc(campaignId)
          .collection('activity')
          .orderBy('at', 'desc')
          .limit(limit);

        if (cursor) {
          const cursorDoc = await this.db
            .collection('campaigns')
            .doc(campaignId)
            .collection('activity')
            .doc(cursor)
            .get();
          if (cursorDoc.exists) {
            query = query.startAfter(cursorDoc);
          }
        }

        const snap = await query.get();
        const items: ActivityEntry[] = [];
        snap.forEach((d: QueryDocumentSnapshot) => items.push(d.data() as ActivityEntry));

        const nextCursor = items.length === limit ? items[items.length - 1].id : null;

        return {
          items,
          nextCursor,
          total: items.length,
        };
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.listByCampaign(campaignId, limit, cursor);
  }
}

export class FirestoreCacheRepository implements CacheRepository {
  private db: Firestore;
  private fallback: InMemoryCacheRepository;

  constructor(db: Firestore, fallback?: InMemoryCacheRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryCacheRepository();
  }

  async get<T>(key: string): Promise<T | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.db.collection('cache').doc(key).get();
        if (doc.exists) {
          const data = doc.data();
          if (data && Date.now() <= data.expiresAt) {
            return data.value as T;
          }
        }
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        await this.db.collection('cache').doc(key).set({
          value,
          expiresAt: Date.now() + ttlSeconds * 1000,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.set(key, value, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        await this.db.collection('cache').doc(key).delete();
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.delete(key);
  }
}

export class FirestoreCreatorRepository implements CreatorRepository {
  private db: Firestore;
  private fallback: InMemoryCreatorRepository;

  constructor(db: Firestore, fallback?: InMemoryCreatorRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryCreatorRepository();
  }

  private col(campaignId: string) {
    return this.db.collection('campaigns').doc(campaignId).collection('creators');
  }

  async create(campaignId: string, data: Omit<Creator, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Creator> {
    const docRef = this.col(campaignId).doc();
    const now = new Date().toISOString();

    const creator: Creator = {
      ...data,
      id: docRef.id,
      campaignId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    if (isFirestoreAccessible) {
      try {
        await docRef.set(creator);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.create(campaignId, creator);
    return creator;
  }

  async getById(campaignId: string, creatorId: string): Promise<Creator | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.col(campaignId).doc(creatorId).get();
        if (doc.exists) return doc.data() as Creator;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getById(campaignId, creatorId);
  }

  async list(campaignId: string, query?: Partial<CreatorQuery>): Promise<Creator[]> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).get();
        let list = snap.docs.map((d) => d.data() as Creator);

        if (list.length > 0) {
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
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.list(campaignId, query);
  }

  async update(campaignId: string, creatorId: string, expectedVersion: number, updates: Partial<Creator>): Promise<Creator> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(creatorId);
        const doc = await docRef.get();

        if (doc.exists) {
          const existing = doc.data() as Creator;
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

          await docRef.set(updated);
          await this.fallback.update(campaignId, creatorId, expectedVersion, updates).catch(() => {});
          return updated;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.update(campaignId, creatorId, expectedVersion, updates);
  }

  async delete(campaignId: string, creatorId: string): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(creatorId);
        await docRef.delete();
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.delete(campaignId, creatorId);
  }

  async count(campaignId: string): Promise<number> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).count().get();
        return snap.data().count;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.count(campaignId);
  }

  async findByNormalizedKey(campaignId: string, normalizedKey: string): Promise<Creator | null> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).get();
        const normalizedLower = (normalizedKey || '').toLowerCase();
        for (const d of snap.docs) {
          const c = d.data() as Creator;
          if (
            (c.normalizedKey && c.normalizedKey.toLowerCase() === normalizedLower) ||
            (c.channel?.channelId && c.channel.channelId === normalizedKey)
          ) {
            return c;
          }
        }
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.findByNormalizedKey(campaignId, normalizedKey);
  }

  async bulkUpsert(campaignId: string, creators: Creator[]): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        const batch = this.db.batch();
        for (const c of creators) {
          const docRef = this.col(campaignId).doc(c.id);
          batch.set(docRef, c);
        }
        await batch.commit();
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.bulkUpsert(campaignId, creators);
  }
}

export class FirestorePremortemRepository implements PremortemRepository {
  private db: Firestore;
  private fallback: InMemoryPremortemRepository;

  constructor(db: Firestore, fallback?: InMemoryPremortemRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryPremortemRepository();
  }

  private col(campaignId: string) {
    return this.db.collection('campaigns').doc(campaignId).collection('premortemRuns');
  }

  async create(campaignId: string, data: Omit<PremortemRun, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<PremortemRun> {
    const docRef = this.col(campaignId).doc();
    const now = new Date().toISOString();

    const run: PremortemRun = {
      ...data,
      id: docRef.id,
      campaignId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    if (isFirestoreAccessible) {
      try {
        await docRef.set(run);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.create(campaignId, run);
    return run;
  }

  async getById(campaignId: string, runId: string): Promise<PremortemRun | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.col(campaignId).doc(runId).get();
        if (doc.exists) return doc.data() as PremortemRun;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getById(campaignId, runId);
  }

  async list(campaignId: string): Promise<PremortemRun[]> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).orderBy('createdAt', 'desc').get();
        const list: PremortemRun[] = [];
        snap.forEach((d: QueryDocumentSnapshot) => list.push(d.data() as PremortemRun));
        if (list.length > 0) return list;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.list(campaignId);
  }

  async update(campaignId: string, runId: string, expectedVersion: number, updates: Partial<PremortemRun>): Promise<PremortemRun> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(runId);
        const doc = await docRef.get();
        if (doc.exists) {
          const existing = doc.data() as PremortemRun;
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

          await docRef.set(updated);
          await this.fallback.update(campaignId, runId, expectedVersion, updates).catch(() => {});
          return updated;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.update(campaignId, runId, expectedVersion, updates);
  }

  async delete(campaignId: string, runId: string): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(runId);
        const doc = await docRef.get();
        if (doc.exists) {
          const data = doc.data() as PremortemRun;
          if (data.approved) {
            throw AppError.validation('Cannot delete an approved Pre-Mortem run. Approve a different run or keep it as historical reference.');
          }
          await docRef.delete();
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.delete(campaignId, runId);
  }

  async setApprovedRun(campaignId: string, runId: string): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).get();
        const batch = this.db.batch();
        snap.forEach((d) => {
          if (d.id === runId) {
            batch.update(d.ref, { approved: true, updatedAt: new Date().toISOString() });
          } else {
            const data = d.data() as PremortemRun;
            if (data.approved) {
              batch.update(d.ref, { approved: false, updatedAt: new Date().toISOString() });
            }
          }
        });
        await batch.commit();
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.setApprovedRun(campaignId, runId);
  }
}

export class FirestoreBriefRepository implements BriefRepository {
  private db: Firestore;
  private fallback: InMemoryBriefRepository;

  constructor(db: Firestore, fallback?: InMemoryBriefRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryBriefRepository();
  }

  private col(campaignId: string) {
    return this.db.collection('campaigns').doc(campaignId).collection('briefs');
  }

  async list(campaignId: string): Promise<CreatorBrief[]> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).get();
        const items: CreatorBrief[] = [];
        snap.forEach((d: QueryDocumentSnapshot) => items.push(d.data() as CreatorBrief));
        if (items.length > 0) return items;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.list(campaignId);
  }

  async getById(campaignId: string, creatorId: string): Promise<CreatorBrief | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.col(campaignId).doc(creatorId).get();
        if (doc.exists) return doc.data() as CreatorBrief;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getById(campaignId, creatorId);
  }

  async upsert(campaignId: string, brief: CreatorBrief): Promise<CreatorBrief> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(brief.creatorId);
        const existingDoc = await docRef.get();
        const existing = existingDoc.exists ? (existingDoc.data() as CreatorBrief) : null;
        const now = new Date().toISOString();

        const data: CreatorBrief = {
          ...brief,
          campaignId,
          creatorId: brief.creatorId,
          id: brief.id || brief.creatorId,
          updatedAt: now,
          generatedAt: existing?.generatedAt || brief.generatedAt || now,
          version: (existing?.version || 0) + 1,
        };

        await docRef.set(data);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.upsert(campaignId, brief);
  }

  async update(
    campaignId: string,
    creatorId: string,
    expectedVersion: number,
    updates: Partial<CreatorBrief>
  ): Promise<CreatorBrief> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(creatorId);
        const doc = await docRef.get();
        if (doc.exists) {
          const existing = doc.data() as CreatorBrief;
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

          await docRef.set(updated);
          await this.fallback.update(campaignId, creatorId, expectedVersion, updates).catch(() => {});
          return updated;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.update(campaignId, creatorId, expectedVersion, updates);
  }

  async delete(campaignId: string, creatorId: string): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(creatorId);
        const versionsSnap = await docRef.collection('versions').get();
        const batch = this.db.batch();
        versionsSnap.forEach((v) => batch.delete(v.ref));
        batch.delete(docRef);
        await batch.commit();
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.delete(campaignId, creatorId);
  }

  async listVersions(campaignId: string, creatorId: string): Promise<CreatorBriefVersion[]> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId)
          .doc(creatorId)
          .collection('versions')
          .orderBy('versionNumber', 'desc')
          .get();

        const items: CreatorBriefVersion[] = [];
        snap.forEach((d: QueryDocumentSnapshot) => items.push(d.data() as CreatorBriefVersion));
        if (items.length > 0) return items;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.listVersions(campaignId, creatorId);
  }

  async getVersion(
    campaignId: string,
    creatorId: string,
    versionNumber: number
  ): Promise<CreatorBriefVersion | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.col(campaignId)
          .doc(creatorId)
          .collection('versions')
          .doc(String(versionNumber))
          .get();

        if (doc.exists) return doc.data() as CreatorBriefVersion;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getVersion(campaignId, creatorId, versionNumber);
  }

  async createVersion(
    campaignId: string,
    creatorId: string,
    version: CreatorBriefVersion
  ): Promise<CreatorBriefVersion> {
    if (isFirestoreAccessible) {
      try {
        await this.col(campaignId)
          .doc(creatorId)
          .collection('versions')
          .doc(String(version.versionNumber))
          .set(version);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.createVersion(campaignId, creatorId, version);
  }
}

export class FirestoreSearchPackRepository implements SearchPackRepository {
  private db: Firestore;
  private fallback: InMemorySearchPackRepository;

  constructor(db: Firestore, fallback?: InMemorySearchPackRepository) {
    this.db = db;
    this.fallback = fallback || new InMemorySearchPackRepository();
  }

  private docRef(campaignId: string) {
    return this.db.collection('campaigns').doc(campaignId).collection('searchPack').doc('default');
  }

  async get(campaignId: string): Promise<SearchPack | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.docRef(campaignId).get();
        if (doc.exists) return doc.data() as SearchPack;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.get(campaignId);
  }

  async upsert(campaignId: string, searchPack: SearchPack): Promise<SearchPack> {
    if (isFirestoreAccessible) {
      try {
        const ref = this.docRef(campaignId);
        const existingDoc = await ref.get();
        const existing = existingDoc.exists ? (existingDoc.data() as SearchPack) : null;
        const now = new Date().toISOString();

        const data: SearchPack = {
          ...searchPack,
          campaignId,
          id: existing?.id || searchPack.id || 'default',
          generatedAt: existing?.generatedAt || searchPack.generatedAt || now,
          updatedAt: now,
          version: (existing?.version || 0) + 1,
        };

        await ref.set(data);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.upsert(campaignId, searchPack);
  }

  async update(campaignId: string, expectedVersion: number, updates: Partial<SearchPack>): Promise<SearchPack> {
    if (isFirestoreAccessible) {
      try {
        const ref = this.docRef(campaignId);
        const doc = await ref.get();
        if (doc.exists) {
          const existing = doc.data() as SearchPack;
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

          await ref.set(updated);
          await this.fallback.update(campaignId, expectedVersion, updates).catch(() => {});
          return updated;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.update(campaignId, expectedVersion, updates);
  }

  async delete(campaignId: string): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        const ref = this.docRef(campaignId);
        await ref.delete();
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.delete(campaignId);
  }
}

export class FirestoreTrackedVideoRepository implements TrackedVideoRepository {
  private db: Firestore;
  private fallback: InMemoryTrackedVideoRepository;

  constructor(db: Firestore, fallback?: InMemoryTrackedVideoRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryTrackedVideoRepository();
  }

  private col(campaignId: string) {
    return this.db.collection('campaigns').doc(campaignId).collection('trackedVideos');
  }

  async list(campaignId: string): Promise<TrackedVideo[]> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).get();
        const items: TrackedVideo[] = [];
        snap.forEach((d) => items.push(d.data() as TrackedVideo));
        if (items.length > 0) return items;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.list(campaignId);
  }

  async get(campaignId: string, videoId: string): Promise<TrackedVideo | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.col(campaignId).doc(videoId).get();
        if (doc.exists) return doc.data() as TrackedVideo;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.get(campaignId, videoId);
  }

  async create(campaignId: string, video: TrackedVideo): Promise<TrackedVideo> {
    if (isFirestoreAccessible) {
      try {
        const ref = this.col(campaignId).doc(video.videoId);
        await ref.set(video);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.create(campaignId, video);
  }

  async update(campaignId: string, videoId: string, updates: Partial<TrackedVideo>): Promise<TrackedVideo> {
    if (isFirestoreAccessible) {
      try {
        const ref = this.col(campaignId).doc(videoId);
        const doc = await ref.get();
        if (doc.exists) {
          const existing = doc.data() as TrackedVideo;
          const updated = { ...existing, ...updates };
          await ref.set(updated, { merge: true });
          await this.fallback.update(campaignId, videoId, updates).catch(() => {});
          return updated;
        }
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.update(campaignId, videoId, updates);
  }

  async delete(campaignId: string, videoId: string): Promise<void> {
    if (isFirestoreAccessible) {
      try {
        const ref = this.col(campaignId).doc(videoId);
        const snapshotsSnap = await ref.collection('snapshots').get();
        const batch = this.db.batch();
        snapshotsSnap.forEach((d) => batch.delete(d.ref));
        batch.delete(ref);
        await batch.commit();
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    await this.fallback.delete(campaignId, videoId);
  }

  async addSnapshot(campaignId: string, videoId: string, snapshot: VideoSnapshot): Promise<VideoSnapshot> {
    if (isFirestoreAccessible) {
      try {
        const videoRef = this.col(campaignId).doc(videoId);
        const snapCol = videoRef.collection('snapshots');
        const docRef = snapCol.doc();
        const data = { ...snapshot, id: docRef.id };
        await docRef.set(data);

        const allSnaps = await snapCol.orderBy('at', 'asc').get();
        if (allSnaps.size > CONFIG.LIVE_MAX_SNAPSHOTS_PER_VIDEO) {
          const deleteCount = allSnaps.size - CONFIG.LIVE_MAX_SNAPSHOTS_PER_VIDEO;
          const batch = this.db.batch();
          for (let i = 0; i < deleteCount; i++) {
            batch.delete(allSnaps.docs[i].ref);
          }
          await batch.commit();
        }
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.addSnapshot(campaignId, videoId, snapshot);
  }

  async getSnapshots(campaignId: string, videoId: string, from?: string, to?: string): Promise<VideoSnapshot[]> {
    if (isFirestoreAccessible) {
      try {
        let q = this.col(campaignId).doc(videoId).collection('snapshots').orderBy('at', 'asc');
        if (from) q = q.where('at', '>=', from);
        if (to) q = q.where('at', '<=', to);

        const snap = await q.get();
        const items: VideoSnapshot[] = [];
        snap.forEach((d) => items.push(d.data() as VideoSnapshot));
        if (items.length > 0) return items;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getSnapshots(campaignId, videoId, from, to);
  }
}

export class FirestoreAlertRepository implements AlertRepository {
  private db: Firestore;
  private fallback: InMemoryAlertRepository;

  constructor(db: Firestore, fallback?: InMemoryAlertRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryAlertRepository();
  }

  private col(campaignId: string) {
    return this.db.collection('campaigns').doc(campaignId).collection('alerts');
  }

  async list(campaignId: string, filters?: { acknowledged?: boolean; active?: boolean }): Promise<Alert[]> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).get();
        let items: Alert[] = [];
        snap.forEach((d) => items.push(d.data() as Alert));

        if (items.length > 0) {
          if (filters?.acknowledged !== undefined) {
            items = items.filter((a) => a.acknowledged === filters.acknowledged);
          }
          if (filters?.active !== undefined) {
            items = items.filter((a) => (filters.active ? a.resolvedAt === null : a.resolvedAt !== null));
          }
          return items;
        }
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.list(campaignId, filters);
  }

  async get(campaignId: string, alertId: string): Promise<Alert | null> {
    if (isFirestoreAccessible) {
      try {
        const doc = await this.col(campaignId).doc(alertId).get();
        if (doc.exists) return doc.data() as Alert;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.get(campaignId, alertId);
  }

  async findActiveByTypeAndVideo(campaignId: string, type: AlertType, videoId: string): Promise<Alert | null> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId)
          .where('type', '==', type)
          .where('videoId', '==', videoId)
          .where('resolvedAt', '==', null)
          .limit(1)
          .get();

        if (!snap.empty) return snap.docs[0].data() as Alert;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.findActiveByTypeAndVideo(campaignId, type, videoId);
  }

  async upsert(campaignId: string, alert: Alert): Promise<Alert> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(alert.id);
        await docRef.set(alert);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.upsert(campaignId, alert);
  }

  async update(campaignId: string, alertId: string, updates: Partial<Alert>): Promise<Alert> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(alertId);
        const doc = await docRef.get();
        if (doc.exists) {
          const existing = doc.data() as Alert;
          const updated = { ...existing, ...updates };
          await docRef.set(updated, { merge: true });
          await this.fallback.update(campaignId, alertId, updates).catch(() => {});
          return updated;
        }
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.update(campaignId, alertId, updates);
  }
}

export class FirestorePulseSummaryRepository implements PulseSummaryRepository {
  private db: Firestore;
  private fallback: InMemoryPulseSummaryRepository;

  constructor(db: Firestore, fallback?: InMemoryPulseSummaryRepository) {
    this.db = db;
    this.fallback = fallback || new InMemoryPulseSummaryRepository();
  }

  private col(campaignId: string) {
    return this.db.collection('campaigns').doc(campaignId).collection('pulseSummaries');
  }

  async getLatest(campaignId: string): Promise<PulseSummary | null> {
    if (isFirestoreAccessible) {
      try {
        const snap = await this.col(campaignId).orderBy('createdAt', 'desc').limit(1).get();
        if (!snap.empty) return snap.docs[0].data() as PulseSummary;
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.getLatest(campaignId);
  }

  async create(campaignId: string, summary: PulseSummary): Promise<PulseSummary> {
    if (isFirestoreAccessible) {
      try {
        const docRef = this.col(campaignId).doc(summary.id);
        await docRef.set(summary);
      } catch (err) {
        markFirestoreUnavailable(err);
      }
    }
    return this.fallback.create(campaignId, summary);
  }
}
