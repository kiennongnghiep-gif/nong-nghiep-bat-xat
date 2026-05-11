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
 * Uses Anonymous Auth if enabled, otherwise falls back to a localStorage ID for tracking.
 */
export async function trackUser() {
  try {
    let uid: string;
    
    try {
      const userCredential = await signInAnonymously(auth);
      uid = userCredential.user.uid;
    } catch (authError: any) {
      if (authError.code === 'auth/admin-restricted-operation') {
        console.warn('Anonymous Auth is not enabled in Firebase Console. Please enable it to track users accurately.');
        // Fallback to localStorage ID for basic tracking if auth fails
        uid = localStorage.getItem('agri_user_id') || '';
        if (!uid) {
          uid = 'guest_' + Math.random().toString(36).substring(2, 15);
          localStorage.setItem('agri_user_id', uid);
        }
      } else {
        throw authError;
      }
    }

    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {
      uid,
      lastSeen: serverTimestamp(),
    }, { merge: true });

  } catch (error) {
    // If it's a permission error because of rules (which require auth), we just log it
    console.warn('Could not track user: ', error);
  }
}

/**
 * Gets the total number of "installs" (unique user records).
 */
export async function getInstallCount() {
  try {
    const coll = collection(db, 'users');
    const snapshot = await getCountFromServer(coll);
    return snapshot.data().count;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
    return 0;
  }
}

/**
 * Gets the number of "active users" (seen in the last 24 hours).
 */
export async function getActiveUserCount() {
  try {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const q = query(collection(db, 'users'), where('lastSeen', '>=', Timestamp.fromDate(yesterday)));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
    return 0;
  }
}
