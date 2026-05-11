import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDocs, 
  collection, 
  query, 
  where,
  Timestamp,
  getCountFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Tracks the current user session.
 * Records unique users in 'appUsers' collection.
 */
export async function trackUser() {
  try {
    let userId = localStorage.getItem('app_user_id');
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('app_user_id', userId);
    }

    const userDocRef = doc(db, 'appUsers', userId);
    
    // Check if it's the first time
    const isFirstTime = !localStorage.getItem('app_user_initialized');
    
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone || 
                        document.referrer.includes('android-app://');

    const data: any = {
      userId,
      lastActiveAt: serverTimestamp(),
      userAgent: window.navigator.userAgent,
      installedLikePWA: isStandalone
    };

    if (isFirstTime) {
      data.firstSeenAt = serverTimestamp();
      localStorage.setItem('app_user_initialized', 'true');
    }

    await setDoc(userDocRef, data, { merge: true });

    // Try to sign in anonymously in background for security if needed, but not blocking tracking
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
    } catch (e) {
      // Ignore auth errors for tracking purposes as we allow guest writes in rules
    }

  } catch (error) {
    console.warn('Could not track user: ', error);
  }
}

/**
 * Gets the total number of unique devices/users recorded.
 */
export async function getInstallCount() {
  try {
    const coll = collection(db, 'appUsers');
    const snapshot = await getCountFromServer(coll);
    return snapshot.data().count;
  } catch (error) {
    console.error('Error getting install count:', error);
    return 0;
  }
}

/**
 * Gets the number of users active in the last 5 minutes.
 */
export async function getActiveUserCount() {
  try {
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
    const q = query(collection(db, 'appUsers'), where('lastActiveAt', '>=', Timestamp.fromDate(fiveMinutesAgo)));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (error) {
    console.error('Error getting active user count:', error);
    return 0;
  }
}
