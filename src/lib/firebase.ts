import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Use config from firebase-applet-config.json
const firebaseConfig = {
  projectId: "atomic-volt-dcb1c",
  appId: "1:890886921436:web:71f26c818ff3fe907c6819",
  apiKey: "AIzaSyBff1IAkld_ZHKwF8-732DRRaUwZJng1wc",
  authDomain: "atomic-volt-dcb1c.firebaseapp.com",
  storageBucket: "atomic-volt-dcb1c.firebasestorage.app",
  messagingSenderId: "890886921436",
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
