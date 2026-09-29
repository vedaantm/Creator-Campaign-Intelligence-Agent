import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from '../firebaseAdmin.ts';
import { AppError } from '../errors/AppError.ts';
import { getRepositories } from '../repositories/index.ts';

// Extend Express Request
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email: string;
        displayName?: string;
        photoURL?: string;
      };
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(AppError.unauthenticated('Missing or invalid Authorization header'));
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return next(AppError.unauthenticated('Bearer token empty'));
  }

  const firebaseAuth = getFirebaseAuth();

  // Support demo / development testing token
  if (token.startsWith('demo_user_') || !firebaseAuth) {
    const demoEmail = token.startsWith('demo_user_')
      ? `${token.replace('demo_user_', '')}@example.com`
      : 'demo@creatorcampaign.ai';
    const demoUid = token.startsWith('demo_user_') ? token : 'demo_uid_123';

    req.user = {
      uid: demoUid,
      email: demoEmail,
      displayName: 'Demo Marketer',
      photoURL: '',
    };

    // Upsert into users repository
    const repos = getRepositories();
    repos.users.upsert({
      uid: demoUid,
      email: demoEmail,
      displayName: 'Demo Marketer',
      photoURL: null,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    }).catch(() => {});

    return next();
  }

  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || 'unknown@example.com',
      displayName: decoded.name,
      photoURL: decoded.picture,
    };

    // Upsert user in background
    const repos = getRepositories();
    repos.users.upsert({
      uid: decoded.uid,
      email: decoded.email || 'unknown@example.com',
      displayName: decoded.name || null,
      photoURL: decoded.picture || null,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    }).catch((err) => console.error('Error upserting user:', err));

    next();
  } catch (err) {
    console.error('Firebase token verification failed:', err);
    return next(AppError.unauthenticated('Invalid or expired Firebase ID token'));
  }
}
