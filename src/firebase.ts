import { initializeApp, getApps } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup as fbSignInWithPopup, 
  GoogleAuthProvider as FbGoogleAuthProvider,
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword,
  updateProfile as fbUpdateProfile,
  updatePassword as fbUpdatePassword,
  updateEmail as fbUpdateEmail,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  sendEmailVerification as fbSendEmailVerification,
  reauthenticateWithCredential as fbReauthenticateWithCredential,
  EmailAuthProvider as FbEmailAuthProvider
} from "firebase/auth";

import { 
  getFirestore, 
  doc as fbDoc, 
  getDocFromServer,
  collection as fbCollection,
  query as fbQuery,
  getDocs as fbGetDocs,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  addDoc as fbAddDoc,
  deleteDoc as fbDeleteDoc,
  onSnapshot as fbOnSnapshot
} from "firebase/firestore";

import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const realFirebaseAuth = getAuth(firebaseApp);
export const dbInstance = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(fbDoc(dbInstance, 'test', 'connection'));
    console.log("✅ Firebase connection established");
  } catch (error: any) {
    // Suppress confusing client-side direct firestore connection logs
    // since the client successfully routes all persistent state via server-proxied API endpoints.
    console.debug("Firebase direct client connection check status:", error.message || error);
  }
}
testConnection();

import { getAuthToken, clearAuth, saveAuth } from './lib/auth-client.ts';

// Authentication Wrapper
export const auth = {
  get currentUser() {
    return realFirebaseAuth.currentUser;
  },
  onAuthStateChanged: (callback: (user: any) => void) => {
    return realFirebaseAuth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        // If we have a Firebase user but no local token, or if we want to ensure freshness
        const localUser = localStorage.getItem('bivax_user');
        const localToken = localStorage.getItem('bivax_token');
        
        if (!localToken || !localUser) {
          try {
            const token = await fbUser.getIdToken();
            const res = await fetch('/api/auth/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token })
            });
            if (res.ok) {
              const data = await res.json();
              saveAuth(data.token, data.user);
              callback({
                ...data.user,
                uid: fbUser.uid,
                email: fbUser.email,
                getIdToken: (forceRefresh?: boolean) => fbUser.getIdToken(forceRefresh)
              });
              return;
            }
          } catch (e) {
            console.error("Auth sync failed on state change:", e);
          }
        }
        
        const user = localUser ? JSON.parse(localUser) : null;
        callback(fbUser ? {
          ...user,
          uid: fbUser.uid,
          email: fbUser.email,
          getIdToken: (forceRefresh?: boolean) => fbUser.getIdToken(forceRefresh)
        } : null);
      } else {
        clearAuth();
        callback(null);
      }
    });
  },
  signOut: async () => {
    await realFirebaseAuth.signOut();
    clearAuth();
  }
} as any;

async function safeJsonResponse(res: Response) {
  try {
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await res.json();
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: `Server returned non-JSON response (${res.status})` };
    }
  } catch (err: any) {
    return { error: err.message || 'JSON parse error' };
  }
}

export const db = {
  // ... (keeping db proxy for compatibility with existing components)
  collection: (name: string) => ({
    _name: name,
    doc: (id: string) => ({
      _name: name,
      id: id,
      get: async () => {
        try {
          const token = getAuthToken();
          const res = await fetch(`/api/${name === 'users' ? 'user/profile' : name + '/' + id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await safeJsonResponse(res);
          return { exists: () => !!data && !data.error, data: () => data, id };
        } catch {
          return { exists: () => false, data: () => null, id };
        }
      },
      update: async (data: any) => {
        try {
          const token = getAuthToken();
          const res = await fetch(`/api/${name}/${id}`, {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          });
          return await safeJsonResponse(res);
        } catch (e: any) {
          return { error: e.message };
        }
      },
      set: async (data: any) => {
        try {
          const token = getAuthToken();
          const res = await fetch(`/api/${name}/${id}`, {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          });
          return await safeJsonResponse(res);
        } catch (e: any) {
          return { error: e.message };
        }
      }
    }),
    async get(this: any) {
      try {
        const token = getAuthToken();
        const user = JSON.parse(localStorage.getItem('bivax_user') || '{}');
        const isAdmin = !!user.is_admin;
        
        let endpoint = `/api/${name}`;
        const params = new URLSearchParams();
        if (this && this._constraints) {
          this._constraints.forEach((c: any) => {
            if (c && c.type === 'where') {
              params.append(c.field, String(c.value));
            }
          });
        }
        
        const qStr = params.toString();
        if (qStr) {
          endpoint += `?${qStr}`;
        } else if (name === 'news') {
          endpoint = `/api/news?type=collection`;
        } else if (isAdmin && (name === 'users' || name === 'trades' || name === 'transactions')) {
          endpoint = `/api/admin/${name}`;
        }

        const res = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await safeJsonResponse(res);
        const docs = (Array.isArray(data) ? data : []).map((d: any) => ({
            id: d.id || d.uid,
            data: () => d,
            exists: () => true
        }));
        return {
          docs,
          empty: docs.length === 0,
          forEach: (cb: any) => docs.forEach(cb)
        };
      } catch {
        return { docs: [], empty: true, forEach: () => {} };
      }
    }
  })
} as any;

export async function signInWithEmailAndPassword(a: any, email: string, pass: string) {
  try {
    const result = await fbSignInWithEmailAndPassword(realFirebaseAuth, email, pass);
    const token = await result.user.getIdToken();
    
    const res = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await safeJsonResponse(res);
    if (data.error) throw new Error(data.error);
    saveAuth(data.token, data.user);
    return { 
      user: {
        ...data.user,
        getIdToken: async () => data.token || ''
      } 
    };
  } catch (error: any) {
    throw error;
  }
}

export async function createUserWithEmailAndPassword(a: any, email: string, pass: string) {
  try {
    const result = await fbCreateUserWithEmailAndPassword(realFirebaseAuth, email, pass);
    const token = await result.user.getIdToken();
    
    const referralCode = localStorage.getItem('referralCode') || localStorage.getItem('referral_code') || '';
    const referralSubId = localStorage.getItem('referralSub') || localStorage.getItem('referral_sub_id') || '';
    const referralType = localStorage.getItem('referralType') || localStorage.getItem('referral_type') || '';

    const res = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        token, 
        referralCode,
        referralSubId,
        referralType
      })
    });
    const data = await safeJsonResponse(res);
    if (data.error) throw new Error(data.error);
    saveAuth(data.token, data.user);

    // Clear referral data
    localStorage.removeItem('referralCode');
    localStorage.removeItem('referral_code');
    localStorage.removeItem('referralSub');
    localStorage.removeItem('referral_sub_id');
    localStorage.removeItem('referralType');
    localStorage.removeItem('referral_type');

    return { 
      user: {
        ...data.user,
        getIdToken: async () => data.token || ''
      } 
    };
  } catch (error: any) {
    throw error;
  }
}

export const signInWithPopup = async (a: any, p: any) => {
  try {
    const result = await fbSignInWithPopup(realFirebaseAuth, p);
    const idToken = await result.user.getIdToken();
    
    const referralCode = localStorage.getItem('referralCode') || localStorage.getItem('referral_code') || '';
    const referralSubId = localStorage.getItem('referralSub') || localStorage.getItem('referral_sub_id') || '';
    const referralType = localStorage.getItem('referralType') || localStorage.getItem('referral_type') || '';

    const res = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken, referralCode, referralSubId, referralType })
    });
    const data = await safeJsonResponse(res);
    if (data.error) throw new Error(data.error);
    saveAuth(data.token, data.user);

    // Clear referral data
    localStorage.removeItem('referralCode');
    localStorage.removeItem('referral_code');
    localStorage.removeItem('referralSub');
    localStorage.removeItem('referral_sub_id');
    localStorage.removeItem('referralType');
    localStorage.removeItem('referral_type');

    return { 
      user: {
        ...data.user,
        getIdToken: async () => data.token || ''
      } 
    };
  } catch (error: any) {
    throw error;
  }
};

export enum OperationType {
  GET = 'get',
  SET = 'set',
  UPDATE = 'update',
  DELETE = 'delete',
  ADD = 'add',
  QUERY = 'query'
}

export function handleFirestoreError(error: any, operation?: OperationType, path?: string, ...args: any[]) {
  console.error(`API Error [${operation}] at ${path}:`, error, args);
}

// Re-exports for compatibility
export const onAuthStateChanged = (authObj: any, cb: any) => authObj.onAuthStateChanged(cb);
export const signOut = (authObj: any) => authObj.signOut();
export const reauthenticateWithCredential = (user: any, cred: any) => fbReauthenticateWithCredential(user, cred);
export const updatePassword = (user: any, pass: string) => fbUpdatePassword(user, pass);
export const updateEmail = (user: any, email: string) => fbUpdateEmail(user, email);
export const sendEmailVerification = (user: any) => fbSendEmailVerification(user);
export const GoogleAuthProvider = FbGoogleAuthProvider;
export const EmailAuthProvider = FbEmailAuthProvider;
export const googleProvider = new FbGoogleAuthProvider();
export const sendPasswordResetEmail = (auth: any, email: string) => fbSendPasswordResetEmail(auth, email);
export const collection = (dbObj: any, ...path: string[]) => {
  let basePath = '';
  if (dbObj) {
    if (typeof dbObj._name === 'string') {
      basePath = dbObj._name;
      if (dbObj.id) {
        basePath += '/' + dbObj.id;
      }
    } else if (typeof dbObj.path === 'string') {
      basePath = dbObj.path;
    }
  }

  const fullPathParts: string[] = [];
  if (basePath) {
    fullPathParts.push(...basePath.split('/').filter(Boolean));
  }
  for (const p of path) {
    if (typeof p === 'string') {
      fullPathParts.push(...p.split('/').filter(Boolean));
    }
  }

  const fullPath = fullPathParts.join('/');
  if (dbObj && typeof dbObj.collection === 'function' && !basePath) {
    return dbObj.collection(fullPath);
  }
  return db.collection(fullPath);
};

export const doc = (dbObj: any, ...path: string[]) => {
  let basePath = '';
  if (dbObj) {
    if (typeof dbObj._name === 'string') {
      basePath = dbObj._name;
      if (dbObj.id) {
        basePath += '/' + dbObj.id;
      }
    } else if (typeof dbObj.path === 'string') {
      basePath = dbObj.path;
    }
  }

  const allParts: string[] = [];
  if (basePath) {
    allParts.push(...basePath.split('/').filter(Boolean));
  }
  for (const p of path) {
    if (typeof p === 'string') {
      allParts.push(...p.split('/').filter(Boolean));
    }
  }

  if (allParts.length === 0) {
    const randomId = Math.random().toString(36).substring(2, 15);
    return db.collection('default').doc(randomId);
  }

  if (allParts.length % 2 === 1) {
    const colPath = allParts.join('/');
    const randomId = Math.random().toString(36).substring(2, 15);
    return db.collection(colPath).doc(randomId);
  } else {
    const docId = allParts.pop()!;
    const colPath = allParts.join('/');
    return db.collection(colPath).doc(docId);
  }
};

export const getDoc = (ref: any) => ref && typeof ref.get === 'function' ? ref.get() : Promise.resolve({ exists: () => false, data: () => ({}) });
export const getDocs = (queryRef: any) => queryRef && typeof queryRef.get === 'function' ? queryRef.get() : Promise.resolve({ docs: [], empty: true, forEach: () => {} });
export const setDoc = (ref: any, data: any, ...args: any[]) => ref && typeof ref.set === 'function' ? ref.set(data, ...args) : Promise.resolve();
export const updateDoc = (ref: any, data: any, ...args: any[]) => ref && typeof ref.update === 'function' ? ref.update(data) : Promise.resolve();
export const addDoc = async (colRef: any, data: any) => {
  const name = colRef?._name || '';
  let token = getAuthToken();
  if (!token && auth.currentUser) {
      try {
          token = await auth.currentUser.getIdToken(true);
      } catch (e) {
          console.warn("Failed to get fresh Firebase token for addDoc", e);
      }
  }

  // If frontend is adding to user's transaction subcollection directly, just mock success
  // because the actual deposits/withdrawals API will handle creating the transaction record.
  if (name.includes('/transactions')) {
      return { id: 'txn_' + Math.random().toString(36).substring(2, 11) };
  }

  let endpoint = `/api/${name}`;
  let method = 'POST';
  let bodyData: any = data;

  if (name === 'deposits') {
    endpoint = '/api/wallet/deposit';
  } else if (name === 'withdrawals') {
    endpoint = '/api/wallet/withdraw';
  } else if (name === 'trades') {
    endpoint = '/api/trades/place';
  } else if (name === 'tickets') {
    endpoint = '/api/tickets';
    const ticketId = data.ticketId || colRef.id || ('t_' + Math.random().toString(36).substring(2, 11));
    bodyData = { ticketId, ticketData: data };
  } else if (name && name.startsWith('tickets/') && name.endsWith('/messages')) {
    endpoint = '/api/tickets/messages';
    const parts = name.split('/');
    const ticketId = parts[1];
    const messageId = data.messageId || ('m_' + Math.random().toString(36).substring(2, 11));
    bodyData = { ticketId, messageId, messageData: data };
  }

  try {
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(endpoint, {
      method,
      headers,
      body: JSON.stringify(bodyData)
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        clearAuth();
      }
      const errorText = await res.text();
      throw new Error(`Proxy addDoc failed for ${name}: ${res.status} ${res.statusText} - ${errorText}`);
    }
    
    const result = await res.json();
    return { id: result.id || bodyData.ticketId || bodyData.messageId || 'new-id' };
  } catch (err) {
    console.error(`Proxy addDoc error for ${name}:`, err);
    throw err;
  }
};
export const deleteDoc = async (ref: any) => {
  if (ref && ref._name && ref.id) {
    const token = getAuthToken();
    try {
      await fetch(`/api/${ref._name}/${ref.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      console.error("deleteDoc failed", e);
    }
  }
  return Promise.resolve();
};
export const onSnapshot = (ref: any, cb: any, errCb?: any) => {
  ref.get().then((s: any) => cb(s)).catch((e: any) => errCb && errCb(e));
  return () => {};
};
export const where = (field: string, op: string, value: any) => {
  return { type: 'where', field, op, value };
};
export const query = (ref: any, ...constraints: any[]) => {
  const newRef = Object.create(ref);
  newRef._constraints = [...(ref._constraints || []), ...constraints];
  return newRef;
};
export const orderBy = (...args: any[]) => ({});
export const limit = (n: number) => ({});
export const serverTimestamp = () => Date.now();
export const increment = (n: number) => ({ increment: n });
export const collectionGroup = (dbObj: any, name: string) => dbObj.collection(name);
export const runTransaction = (dbObj: any, cb: any) => {
  return cb({
    get: (ref: any) => ref.get(),
    set: (ref: any, data: any) => ref.update(data),
    update: (ref: any, data: any) => ref.update(data),
    delete: (ref: any) => Promise.resolve(),
  });
};
