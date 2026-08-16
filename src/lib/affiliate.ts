import { db } from '../firebase';
import { doc, runTransaction, collection, query, where, getDocs, limit, updateDoc, increment, addDoc } from '../firebase';

/**
 * Generates a sequential professional numeric ID for a new user.
 */
export async function getNextAffiliateId(): Promise<number> {
  try {
    const counterRef = doc(db, 'counters', 'affiliate');
    
    const newId = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists()) {
        transaction.set(counterRef, { currentId: 100000 });
        return 100000;
      }
      const nextId = (counterDoc.data().currentId || 100000) + 1;
      transaction.update(counterRef, { currentId: nextId });
      return nextId;
    });
    
    return newId;
  } catch (err) {
    console.error("Transaction failed, using fallback random numeric ID", err);
    return 100000 + Math.floor(Math.random() * 899999);
  }
}

/**
 * Finds a user by their numeric affiliate ID.
 */
export async function getUserByAffiliateId(id: string | number) {
  if (!id) return null;
  
  // 1. If it is numeric or convertible to a valid integer, search by affiliateId (numeric)
  const numericId = typeof id === 'string' ? parseInt(id) : id;
  if (!isNaN(numericId) && String(numericId) === String(id)) {
    const q = query(
      collection(db, 'users'), 
      where('affiliateId', '==', numericId), 
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { uid: snap.docs[0].id, ...snap.docs[0].data() };
    }
  }

  // 2. Search by referralCode (string)
  const qStr = query(
    collection(db, 'users'),
    where('referralCode', '==', String(id)),
    limit(1)
  );
  const snapStr = await getDocs(qStr);
  if (!snapStr.empty) {
    return { uid: snapStr.docs[0].id, ...snapStr.docs[0].data() };
  }

  // 3. Fallback: search by affiliateId as a string
  const qAffStr = query(
    collection(db, 'users'),
    where('affiliateId', '==', String(id)),
    limit(1)
  );
  const snapAffStr = await getDocs(qAffStr);
  if (!snapAffStr.empty) {
    return { uid: snapAffStr.docs[0].id, ...snapAffStr.docs[0].data() };
  }

  // 4. Fallback: search by uid direct doc check
  const qUid = query(
    collection(db, 'users'),
    where('uid', '==', String(id)),
    limit(1)
  );
  const snapUid = await getDocs(qUid);
  if (!snapUid.empty) {
    return { uid: snapUid.docs[0].id, ...snapUid.docs[0].data() };
  }

  return null;
}

/**
 * Processes revenue share when a referred user loses a trade.
 * Bivaax model: Referrer gets a share of the lost amount.
 */
export async function processRevenueShare(userId: string, lostAmount: number, currency: string) {
  try {
    const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', userId), limit(1)));
    if (userSnap.empty) {
        // If query by uid fails (depending on how it's stored), try direct doc
        const userDoc = await getDocs(query(collection(db, 'users'), where('email', '!=', ''), limit(1))); // dummy but better use standard doc
    }
    
    // Better: just use the userId directly if we have it
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId), limit(1)));
    if (userDoc.empty) return;
    
    const userData = userDoc.docs[0].data();
    const referrerUid = userData.referredBy || userData.referredByUid || userData.referred_by_uid;
    if (!referrerUid) return;

    const referrerRef = doc(db, 'users', referrerUid);
    const referrerSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', referrerUid), limit(1)));
    
    if (referrerSnap.empty) return;
    const referrerData = referrerSnap.docs[0].data();

    // Determine share percentage (default 50% or from tier)
    let sharePercent = 50;
    if (referrerData.customAffiliateShare) {
        sharePercent = referrerData.customAffiliateShare;
    } else {
        // Basic tier logic
        const refCount = referrerData.referralCount || 0;
        if (refCount >= 201) sharePercent = 80;
        else if (refCount >= 51) sharePercent = 70;
        else if (refCount >= 11) sharePercent = 60;
    }

    const shareAmount = lostAmount * (sharePercent / 100);

    // Update referrer balance
    await updateDoc(referrerRef, {
      affiliateBalance: increment(shareAmount),
      totalAffiliateEarnings: increment(shareAmount)
    });

    // Log the commission
    await addDoc(collection(db, 'affiliate_commissions'), {
        referrerUid,
        referredUid: userId,
        amount: shareAmount,
        lostAmount: lostAmount,
        currency: currency,
        percent: sharePercent,
        createdAt: Date.now(),
        type: 'revenue_share'
    });

  } catch (err) {
    console.error("Error processing revenue share:", err);
  }
}
