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
import {
  FirestoreCampaignRepository,
  FirestoreUserRepository,
  FirestoreJobRepository,
  FirestoreActivityRepository,
  FirestoreCacheRepository,
  FirestoreCreatorRepository,
  FirestorePremortemRepository,
  FirestoreBriefRepository,
  FirestoreSearchPackRepository,
  FirestoreTrackedVideoRepository,
  FirestoreAlertRepository,
  FirestorePulseSummaryRepository,
} from './FirestoreRepository.ts';
import { initFirebaseAdmin } from '../firebaseAdmin.ts';
import { seedDemoCampaign } from '../fixtures/seed.ts';

export interface Repositories {
  campaigns: CampaignRepository;
  users: UserRepository;
  jobs: JobRepository;
  activity: ActivityRepository;
  cache: CacheRepository;
  creators: CreatorRepository;
  premortem: PremortemRepository;
  briefs: BriefRepository;
  searchPack: SearchPackRepository;
  trackedVideos: TrackedVideoRepository;
  alerts: AlertRepository;
  pulseSummaries: PulseSummaryRepository;
  isDemoOrMemory: boolean;
}

let repos: Repositories | null = null;

function createInMemorySet(): Repositories {
  const inMemSet: Repositories = {
    campaigns: new InMemoryCampaignRepository(),
    users: new InMemoryUserRepository(),
    jobs: new InMemoryJobRepository(),
    activity: new InMemoryActivityRepository(),
    cache: new InMemoryCacheRepository(),
    creators: new InMemoryCreatorRepository(),
    premortem: new InMemoryPremortemRepository(),
    briefs: new InMemoryBriefRepository(),
    searchPack: new InMemorySearchPackRepository(),
    trackedVideos: new InMemoryTrackedVideoRepository(),
    alerts: new InMemoryAlertRepository(),
    pulseSummaries: new InMemoryPulseSummaryRepository(),
    isDemoOrMemory: true,
  };
  seedDemoCampaign(inMemSet);
  return inMemSet;
}

export function getRepositories(): Repositories {
  if (repos) return repos;

  const isDemo = process.env.DEMO_MODE === 'true';
  const { db } = initFirebaseAdmin();

  if (isDemo || !db) {
    console.log(`[Repository] Using InMemoryRepository (${isDemo ? 'DEMO_MODE enabled' : 'Firebase db not initialized'})`);
    repos = createInMemorySet();
  } else {
    console.log('[Repository] Initializing FirestoreRepository with in-memory resilient fallback');
    const inMemFallback = createInMemorySet();
    repos = {
      campaigns: new FirestoreCampaignRepository(db, inMemFallback.campaigns as InMemoryCampaignRepository),
      users: new FirestoreUserRepository(db, inMemFallback.users as InMemoryUserRepository),
      jobs: new FirestoreJobRepository(db, inMemFallback.jobs as InMemoryJobRepository),
      activity: new FirestoreActivityRepository(db, inMemFallback.activity as InMemoryActivityRepository),
      cache: new FirestoreCacheRepository(db, inMemFallback.cache as InMemoryCacheRepository),
      creators: new FirestoreCreatorRepository(db, inMemFallback.creators as InMemoryCreatorRepository),
      premortem: new FirestorePremortemRepository(db, inMemFallback.premortem as InMemoryPremortemRepository),
      briefs: new FirestoreBriefRepository(db, inMemFallback.briefs as InMemoryBriefRepository),
      searchPack: new FirestoreSearchPackRepository(db, inMemFallback.searchPack as InMemorySearchPackRepository),
      trackedVideos: new FirestoreTrackedVideoRepository(db, inMemFallback.trackedVideos as InMemoryTrackedVideoRepository),
      alerts: new FirestoreAlertRepository(db, inMemFallback.alerts as InMemoryAlertRepository),
      pulseSummaries: new FirestorePulseSummaryRepository(db, inMemFallback.pulseSummaries as InMemoryPulseSummaryRepository),
      isDemoOrMemory: false,
    };
    seedDemoCampaign(repos);
  }

  return repos;
}

export function resetRepositoriesForTesting(customRepos?: Repositories): Repositories {
  if (customRepos) {
    repos = customRepos;
    return repos;
  }
  repos = createInMemorySet();
  return repos;
}
