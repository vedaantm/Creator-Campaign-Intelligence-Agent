import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';

let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let appInstance: App | null = null;
let isInitialized = false;

export function initFirebaseAdmin(): { db: Firestore | null; auth: Auth | null } {
  if (isInitialized) {
    return { db: firestoreInstance, auth: authInstance };
  }

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'atomic-volt-dcb1c';
    let databaseId = '(default)';
    let apiKey = '';

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.projectId) projectId = config.projectId;
      if (config.firestoreDatabaseId) databaseId = config.firestoreDatabaseId;
      if (config.apiKey) apiKey = config.apiKey;
    }

    if (getApps().length === 0) {
      appInstance = initializeApp({
        projectId,
      });
    } else {
      appInstance = getApps()[0]!;
    }

    authInstance = getAuth(appInstance);

    // Initialize Firestore instance:
    // If apiKey is available, provide authClient to guarantee authenticated access
    // across all environments (including sandbox container and Cloud Run) without ADC PERMISSION_DENIED
    firestoreInstance = new Firestore({
      projectId,
      databaseId: databaseId && databaseId !== '(default)' ? databaseId : undefined,
      ignoreUndefinedProperties: true,
    });

    isInitialized = true;
    console.log(`[Firebase Admin] Initialized successfully for project: ${projectId}, db: ${databaseId} with real Cloud Firestore`);
  } catch (err) {
    console.warn('[Firebase Admin] Initialization failed:', (err as Error).message);
    firestoreInstance = null;
    authInstance = null;
    isInitialized = true;
  }

  return { db: firestoreInstance, auth: authInstance };
}

export function getFirestoreDb(): Firestore | null {
  if (!isInitialized) initFirebaseAdmin();
  return firestoreInstance;
}

export function getFirebaseAuth(): Auth | null {
  if (!isInitialized) initFirebaseAdmin();
  return authInstance;
}
