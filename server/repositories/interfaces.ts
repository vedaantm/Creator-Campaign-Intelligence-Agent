import {
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignQuery,
  PaginatedResponse,
  User,
  Job,
  ActivityEntry,
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

export interface CampaignRepository {
  create(campaign: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deletedAt'>): Promise<Campaign>;
  getById(id: string): Promise<Campaign | null>;
  list(query: Partial<CampaignQuery>, userEmail: string, userId: string): Promise<PaginatedResponse<Campaign>>;
  listTrash(userId: string): Promise<PaginatedResponse<Campaign>>;
  update(id: string, expectedVersion: number, updates: Partial<UpdateCampaignInput>): Promise<Campaign>;
  softDelete(id: string, expectedVersion: number): Promise<Campaign>;
  restore(id: string): Promise<Campaign>;
  hardDelete(id: string): Promise<void>;
  duplicate(id: string, newOwnerId: string, newOwnerEmail: string): Promise<Campaign>;
  exportData(id: string): Promise<Record<string, unknown>>;
  importData(data: Record<string, unknown>, ownerId: string, ownerEmail: string): Promise<Campaign>;
}

export interface UserRepository {
  getById(uid: string): Promise<User | null>;
  upsert(user: User): Promise<User>;
}

export interface JobRepository {
  create(job: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>): Promise<Job>;
  getById(id: string): Promise<Job | null>;
  listRunningByCampaign(campaignId: string): Promise<Job[]>;
  update(id: string, updates: Partial<Job>): Promise<Job>;
}

export interface ActivityRepository {
  log(entry: Omit<ActivityEntry, 'id' | 'at'>): Promise<ActivityEntry>;
  listByCampaign(campaignId: string, limit?: number, cursor?: string): Promise<PaginatedResponse<ActivityEntry>>;
}

export interface CacheRepository {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CreatorRepository {
  create(campaignId: string, creator: Omit<Creator, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Creator>;
  getById(campaignId: string, creatorId: string): Promise<Creator | null>;
  list(campaignId: string, query?: Partial<CreatorQuery>): Promise<Creator[]>;
  update(campaignId: string, creatorId: string, expectedVersion: number, updates: Partial<Creator>): Promise<Creator>;
  delete(campaignId: string, creatorId: string): Promise<void>;
  count(campaignId: string): Promise<number>;
  findByNormalizedKey(campaignId: string, normalizedKey: string): Promise<Creator | null>;
  bulkUpsert(campaignId: string, creators: Creator[]): Promise<void>;
}

export interface PremortemRepository {
  create(campaignId: string, run: Omit<PremortemRun, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<PremortemRun>;
  getById(campaignId: string, runId: string): Promise<PremortemRun | null>;
  list(campaignId: string): Promise<PremortemRun[]>;
  update(campaignId: string, runId: string, expectedVersion: number, updates: Partial<PremortemRun>): Promise<PremortemRun>;
  delete(campaignId: string, runId: string): Promise<void>;
  setApprovedRun(campaignId: string, runId: string): Promise<void>;
}

export interface BriefRepository {
  list(campaignId: string): Promise<CreatorBrief[]>;
  getById(campaignId: string, creatorId: string): Promise<CreatorBrief | null>;
  upsert(campaignId: string, brief: CreatorBrief): Promise<CreatorBrief>;
  update(campaignId: string, creatorId: string, expectedVersion: number, updates: Partial<CreatorBrief>): Promise<CreatorBrief>;
  delete(campaignId: string, creatorId: string): Promise<void>;
  listVersions(campaignId: string, creatorId: string): Promise<CreatorBriefVersion[]>;
  getVersion(campaignId: string, creatorId: string, versionNumber: number): Promise<CreatorBriefVersion | null>;
  createVersion(campaignId: string, creatorId: string, version: CreatorBriefVersion): Promise<CreatorBriefVersion>;
}

export interface SearchPackRepository {
  get(campaignId: string): Promise<SearchPack | null>;
  upsert(campaignId: string, searchPack: SearchPack): Promise<SearchPack>;
  update(campaignId: string, expectedVersion: number, updates: Partial<SearchPack>): Promise<SearchPack>;
  delete(campaignId: string): Promise<void>;
}

export interface TrackedVideoRepository {
  list(campaignId: string): Promise<TrackedVideo[]>;
  get(campaignId: string, videoId: string): Promise<TrackedVideo | null>;
  create(campaignId: string, video: TrackedVideo): Promise<TrackedVideo>;
  update(campaignId: string, videoId: string, updates: Partial<TrackedVideo>): Promise<TrackedVideo>;
  delete(campaignId: string, videoId: string): Promise<void>;
  addSnapshot(campaignId: string, videoId: string, snapshot: VideoSnapshot): Promise<VideoSnapshot>;
  getSnapshots(campaignId: string, videoId: string, from?: string, to?: string): Promise<VideoSnapshot[]>;
}

export interface AlertRepository {
  list(campaignId: string, filters?: { acknowledged?: boolean; active?: boolean }): Promise<Alert[]>;
  get(campaignId: string, alertId: string): Promise<Alert | null>;
  findActiveByTypeAndVideo(campaignId: string, type: AlertType, videoId: string): Promise<Alert | null>;
  upsert(campaignId: string, alert: Alert): Promise<Alert>;
  update(campaignId: string, alertId: string, updates: Partial<Alert>): Promise<Alert>;
}

export interface PulseSummaryRepository {
  getLatest(campaignId: string): Promise<PulseSummary | null>;
  create(campaignId: string, summary: PulseSummary): Promise<PulseSummary>;
}


