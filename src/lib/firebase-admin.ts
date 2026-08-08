import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let adminAuth: any = null;
let adminDb: any = null;
let useMock = false;

function createMockDb() {
  const dbPath = path.join(process.cwd(), 'local_db.json');
  
  const readDb = () => {
    try {
      if (fs.existsSync(dbPath)) {
        const content = fs.readFileSync(dbPath, 'utf8').trim();
        if (content) {
          try {
            return JSON.parse(content);
          } catch (jsonErr) {
            console.warn('[MockDB] local_db.json was corrupted, resetting to empty state.');
          }
        }
      }
    } catch (e: any) {
      console.error('[MockDB] Failed to read local_db.json:', e.message);
    }
    return { collections: {} };
  };

  const writeDb = (data: any) => {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[MockDB] Failed to write local_db.json:', e);
    }
  };

  const getCollectionData = (name: string) => {
    const db = readDb();
    if (!db.collections) db.collections = {};
    if (!db.collections[name]) db.collections[name] = {};
    return db.collections[name];
  };

  const saveCollectionData = (name: string, colData: any) => {
    const db = readDb();
    if (!db.collections) db.collections = {};
    db.collections[name] = colData;
    writeDb(db);
  };

  const createQueryObj = (colName: string, filters: any[] = [], orderSpecs: any[] = [], limitVal?: number) => {
    const getDocsFn = async () => {
      const colData = getCollectionData(colName);
      let docs = Object.entries(colData).map(([id, data]: [string, any]) => ({
        id,
        ref: {
          id,
          get: async () => ({ id, exists: true, data: () => data }),
          set: async (d: any, opts?: any) => mockDbObj.collection(colName).doc(id).set(d, opts),
          update: async (d: any) => mockDbObj.collection(colName).doc(id).update(d),
          delete: async () => mockDbObj.collection(colName).doc(id).delete()
        },
        data: () => data,
        exists: true
      }));

      // Apply filters
      for (const filter of filters) {
        const { field, op, value } = filter;
        docs = docs.filter(doc => {
          const val = doc.data()[field];
          if (op === '==') return val === value;
          if (op === '!=') return val !== value;
          if (op === '>') return val > value;
          if (op === '<') return val < value;
          if (op === '>=') return val >= value;
          if (op === '<=') return val <= value;
          return true;
        });
      }

      // Apply order by
      for (const spec of orderSpecs) {
        const { field, direction } = spec;
        docs.sort((a, b) => {
          const valA = a.data()[field];
          const valB = b.data()[field];
          if (valA < valB) return direction === 'desc' ? 1 : -1;
          if (valA > valB) return direction === 'desc' ? -1 : 1;
          return 0;
        });
      }

      // Apply limit
      if (typeof limitVal === 'number') {
        docs = docs.slice(0, limitVal);
      }

      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach(callback: (doc: any) => void) {
          docs.forEach(callback);
        }
      };
    };

    const queryObj: any = {
      where: (field: string, op: string, value: any) => {
        return createQueryObj(colName, [...filters, { field, op, value }], orderSpecs, limitVal);
      },
      orderBy: (field: string, direction: string = 'asc') => {
        return createQueryObj(colName, filters, [...orderSpecs, { field, direction }], limitVal);
      },
      limit: (n: number) => {
        return createQueryObj(colName, filters, orderSpecs, n);
      },
      get: getDocsFn
    };
    return queryObj;
  };

  const mockDbObj: any = {
    settings: () => {},
  };

  const collectionFn = (name: string) => {
    const colObj: any = {
      doc: (id: string) => {
        const docId = id || Math.random().toString(36).substring(2, 15);
        return {
          id: docId,
          collection: (subName: string) => {
            return collectionFn(`${name}/${docId}/${subName}`);
          },
          get: async () => {
            const colData = getCollectionData(name);
            const data = colData[docId];
            return {
              id: docId,
              exists: data !== undefined,
              data: () => data || {}
            };
          },
          set: async (data: any, options?: any) => {
            const colData = getCollectionData(name);
            if (options?.merge && colData[docId]) {
              colData[docId] = { ...colData[docId], ...data };
            } else {
              colData[docId] = data;
            }
            saveCollectionData(name, colData);
          },
          update: async (data: any) => {
            const colData = getCollectionData(name);
            colData[docId] = { ...(colData[docId] || {}), ...data };
            saveCollectionData(name, colData);
          },
          delete: async () => {
            const colData = getCollectionData(name);
            delete colData[docId];
            saveCollectionData(name, colData);
          }
        };
      },
      add: async (data: any) => {
        const docId = Math.random().toString(36).substring(2, 15);
        const colData = getCollectionData(name);
        colData[docId] = data;
        saveCollectionData(name, colData);
        return { id: docId };
      },
      where: (field: string, op: string, value: any) => {
        return createQueryObj(name, [{ field, op, value }]);
      },
      orderBy: (field: string, direction: string = 'asc') => {
        return createQueryObj(name, [], [{ field, direction }]);
      },
      limit: (n: number) => {
        return createQueryObj(name, [], [], n);
      },
      get: async () => {
        return createQueryObj(name).get();
      }
    };
    return colObj;
  };

  mockDbObj.collection = collectionFn;
  return mockDbObj;
}

function createMockAuth() {
  return {
    verifyIdToken: async () => ({ uid: 'mock-uid' }),
    getUser: async () => ({ uid: 'mock-uid' }),
  };
}

function handleFirebaseError(err: any) {
  if (err && (err.code === 7 || err.code === 5 || err.message?.includes('PERMISSION_DENIED') || err.message?.includes('NOT_FOUND') || err.message?.includes('permission') || err.message?.includes('not found') || err.message?.includes('insufficient'))) {
    if (!useMock) {
      console.log(`ℹ️ Firestore access unavailable (${err.code || 'UNKNOWN'}). Switching adminDb to mock/offline mode.`);
      useMock = true;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Promise<T>): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Firebase operation timed out'));
    }, timeoutMs);
  });

  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise
  ]).catch(async (err) => {
    clearTimeout(timer);
    if (err.message === 'Firebase operation timed out') {
      console.warn(`⏳ Firebase operation timed out after ${timeoutMs}ms. Switching adminDb to mock/offline mode.`);
      useMock = true;
      return await onTimeout();
    }
    throw err;
  });
}

function wrapCollectionRef(realCol: any, mockCol: any): any {
  return {
    _name: realCol._name,
    id: realCol.id,
    doc(...args: any[]) {
      if (useMock) return mockCol.doc(...args);
      try {
        return wrapDocRef(realCol.doc(...args), mockCol.doc(...args));
      } catch (err) {
        handleFirebaseError(err);
        return mockCol.doc(...args);
      }
    },
    async add(...args: any[]) {
      if (useMock) return mockCol.add(...args);
      try {
        return await withTimeout(realCol.add(...args), 2000, () => mockCol.add(...args));
      } catch (err) {
        handleFirebaseError(err);
        return await mockCol.add(...args);
      }
    },
    where(...args: any[]) {
      if (useMock) return mockCol.where(...args);
      try {
        return wrapQuery(realCol.where(...args), mockCol.where(...args));
      } catch (err) {
        handleFirebaseError(err);
        return mockCol.where(...args);
      }
    },
    orderBy(...args: any[]) {
      if (useMock) return mockCol.orderBy(...args);
      try {
        return wrapQuery(realCol.orderBy(...args), mockCol.orderBy(...args));
      } catch (err) {
        handleFirebaseError(err);
        return mockCol.orderBy(...args);
      }
    },
    limit(...args: any[]) {
      if (useMock) return mockCol.limit(...args);
      try {
        return wrapQuery(realCol.limit(...args), mockCol.limit(...args));
      } catch (err) {
        handleFirebaseError(err);
        return mockCol.limit(...args);
      }
    },
    async get() {
      if (useMock) return mockCol.get();
      try {
        return await withTimeout(realCol.get(), 2000, () => mockCol.get());
      } catch (err) {
        handleFirebaseError(err);
        return await mockCol.get();
      }
    }
  };
}

function wrapDocRef(realDoc: any, mockDoc: any): any {
  return {
    id: realDoc.id,
    collection(subcollectionName: string) {
      if (useMock) return mockDoc.collection(subcollectionName);
      try {
        const realSub = realDoc.collection(subcollectionName);
        const mockSub = mockDoc.collection(subcollectionName);
        return wrapCollectionRef(realSub, mockSub);
      } catch (err) {
        handleFirebaseError(err);
        return mockDoc.collection(subcollectionName);
      }
    },
    async get() {
      if (useMock) return mockDoc.get();
      try {
        return await withTimeout(realDoc.get(), 2000, () => mockDoc.get());
      } catch (err) {
        handleFirebaseError(err);
        return await mockDoc.get();
      }
    },
    async set(...args: any[]) {
      if (useMock) return mockDoc.set(...args);
      try {
        return await withTimeout(realDoc.set(...args), 2000, () => mockDoc.set(...args));
      } catch (err) {
        handleFirebaseError(err);
        return await mockDoc.set(...args);
      }
    },
    async update(...args: any[]) {
      if (useMock) return mockDoc.update(...args);
      try {
        return await withTimeout(realDoc.update(...args), 2000, () => mockDoc.update(...args));
      } catch (err) {
        handleFirebaseError(err);
        return await mockDoc.update(...args);
      }
    },
    async delete() {
      if (useMock) return mockDoc.delete();
      try {
        return await withTimeout(realDoc.delete(), 2000, () => mockDoc.delete());
      } catch (err) {
        handleFirebaseError(err);
        return await mockDoc.delete();
      }
    }
  };
}

function wrapQuery(realQuery: any, mockQuery: any): any {
  return {
    where(...args: any[]) {
      if (useMock) return mockQuery.where(...args);
      try {
        return wrapQuery(realQuery.where(...args), mockQuery.where(...args));
      } catch (err) {
        handleFirebaseError(err);
        return mockQuery.where(...args);
      }
    },
    orderBy(...args: any[]) {
      if (useMock) return mockQuery.orderBy(...args);
      try {
        return wrapQuery(realQuery.orderBy(...args), mockQuery.orderBy(...args));
      } catch (err) {
        handleFirebaseError(err);
        return mockQuery.orderBy(...args);
      }
    },
    limit(...args: any[]) {
      if (useMock) return mockQuery.limit(...args);
      try {
        return wrapQuery(realQuery.limit(...args), mockQuery.limit(...args));
      } catch (err) {
        handleFirebaseError(err);
        return mockQuery.limit(...args);
      }
    },
    async get() {
      if (useMock) return mockQuery.get();
      try {
        return await withTimeout(realQuery.get(), 2000, () => mockQuery.get());
      } catch (err) {
        handleFirebaseError(err);
        return await mockQuery.get();
      }
    }
  };
}

function createSelfHealingFirestoreWrapper(realDb: any, mockDb: any): any {
  const handler = {
    get(target: any, prop: string, receiver: any): any {
      if (useMock) {
        return mockDb[prop];
      }
      
      const value = target[prop];
      if (typeof value === 'function') {
        if (prop === 'collection') {
          return function(...args: any[]) {
            if (useMock) return mockDb.collection(...args);
            try {
              const collectionRef = value.apply(target, args);
              return wrapCollectionRef(collectionRef, mockDb.collection(...args));
            } catch (err) {
              handleFirebaseError(err);
              return mockDb.collection(...args);
            }
          };
        }
        if (prop === 'doc') {
          return function(...args: any[]) {
            if (useMock) return mockDb.doc(...args);
            try {
              const docRef = value.apply(target, args);
              return wrapDocRef(docRef, mockDb.doc(...args));
            } catch (err) {
              handleFirebaseError(err);
              return mockDb.doc(...args);
            }
          };
        }
        return value.bind(target);
      }
      return value;
    }
  };
  return new Proxy(realDb, handler);
}

try {
  let projectId = 'bvaax-trade';
  let databaseId: string | undefined = undefined;
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.projectId) projectId = config.projectId;
    if (config.firestoreDatabaseId) databaseId = config.firestoreDatabaseId;
  }

  let credential: any = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } catch (e) {
      console.warn('⚠️ Could not parse FIREBASE_SERVICE_ACCOUNT env var');
    }
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
    } catch (e) {
      console.warn('⚠️ Could not parse FIREBASE_SERVICE_ACCOUNT_KEY env var');
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    credential = cert(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  // Check if running inside Google Cloud Platform (Cloud Run / App Engine)
  const isGcpEnv = Boolean(process.env.K_SERVICE || process.env.GAE_APPLICATION || process.env.GOOGLE_CLOUD_PROJECT);

  if (credential || isGcpEnv) {
    let app;
    if (!getApps().length) {
      // Always provide projectId to ensure the correct Firebase project is used
      const options = credential ? { credential, projectId } : { projectId };
      app = initializeApp(options);
    } else {
      app = getApps()[0];
    }
    adminAuth = getAuth(app);
    
    let realDb;
    try {
      realDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
    } catch (err) {
      console.warn(`[FirebaseAdmin] Failed to initialize Firestore with databaseId ${databaseId}. Falling back to (default).`);
      realDb = getFirestore(app);
    }
    
    realDb.settings({ ignoreUndefinedProperties: true });
    
    adminDb = createSelfHealingFirestoreWrapper(realDb, createMockDb());
    console.log(`✅ Firebase Admin initialized with self-healing proxy wrapper.`);
  } else {
    console.warn('ℹ️ Running on external hosting (e.g. Railway) without Google Cloud service account key. Using in-memory fallback database handler.');
    adminDb = createMockDb();
    adminAuth = createMockAuth();
  }
} catch (e: any) {
  console.warn('⚠️ Firebase Admin initialization warning:', e.message);
  adminDb = createMockDb();
  adminAuth = createMockAuth();
}

export { adminAuth, adminDb };

export async function syncUserToFirestore(uid: string, data: any) {
  if (!adminDb || !uid) return;
  try {
    const userRef = adminDb.collection('users').doc(uid);
    // Remove fields that shouldn't be in Firestore if any, 
    // but here we just want to ensure balance and profile are synced.
    await userRef.set(data, { merge: true });
  } catch (err) {
    console.error(`[FirebaseSync] Failed to sync user ${uid}:`, err);
  }
}
