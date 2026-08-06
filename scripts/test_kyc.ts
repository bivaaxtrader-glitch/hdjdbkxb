import { adminDb } from '../src/lib/firebase-admin';

async function test() {
  try {
    const snap = await adminDb.collection('kycRequests').where('userId', '==', 'HFvr43UhRiTSjb6m5sQJHmHGNvm1').limit(1).get();
    console.log("Empty:", snap.empty);
    if (!snap.empty) {
      console.log("Data:", snap.docs[0].data());
    }
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
