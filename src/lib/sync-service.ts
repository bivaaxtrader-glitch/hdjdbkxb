import { adminDb } from './firebase-admin.ts';
import { get, run, transaction, db } from '../db/mysql-db.ts';
import logger from './logger.ts';
import { mapUserForFrontend } from './user-utils.ts';
import { getIO } from '../services/socketService.ts';
import Big from 'big.js';

export async function syncUserTransactionsFromFirestore(userId: string) {
  if (!adminDb || !userId) return;
  try {
    const [depositsSnap, withdrawalsSnap, transactionsSnap] = await Promise.all([
      adminDb.collection('deposits').where('userId', '==', userId).get(),
      adminDb.collection('withdrawals').where('userId', '==', userId).get(),
      adminDb.collection('transactions').where('userId', '==', userId).get()
    ]);

    const list: any[] = [];

    depositsSnap.forEach((doc) => {
      const data = doc.data();
      const ts = data.timestamp || data.createdAt || Date.now();
      list.push({
        id: doc.id,
        type: 'deposit',
        amount: Number(data.amount || 0),
        currency: data.currency || 'BDT',
        status: (data.status === 'success' || data.status === 'approved' || data.status === 'completed') ? 'completed' : (data.status || 'pending').toLowerCase(),
        method: data.method || 'direct',
        tx_hash: data.trxId || data.txHash || '',
        timestamp: ts,
        details: { walletNumber: data.walletNumber || '', orderId: data.orderId || '', firestoreId: doc.id }
      });
    });

    withdrawalsSnap.forEach((doc) => {
      const data = doc.data();
      const ts = data.timestamp || data.createdAt || data.created_at || Date.now();
      list.push({
        id: doc.id,
        type: 'withdrawal',
        amount: Number(data.amount || 0),
        currency: data.currency || 'BDT',
        status: (data.status === 'success' || data.status === 'approved' || data.status === 'completed') ? 'completed' : (data.status || 'pending').toLowerCase(),
        method: data.method || 'direct',
        tx_hash: data.trxId || '',
        timestamp: ts,
        details: { ...(data.details || {}), firestoreId: doc.id }
      });
    });

    for (const data of list) {
      const txHash = data.tx_hash;
      const amount = data.amount.toString();
      const type = data.type;
      const status = data.status;
      const createdTime = data.timestamp;
      
      let existingTx = null;
      if (txHash) {
        existingTx = await get('SELECT id FROM transactions WHERE user_id = ? AND tx_hash = ?', [userId, txHash]);
      }
      
      if (!existingTx) {
        const pattern = `%${data.id}%`;
        existingTx = await get('SELECT id FROM transactions WHERE user_id = ? AND details LIKE ?', [userId, pattern]);
      }

      if (!existingTx) {
        await run(
          `INSERT INTO transactions (user_id, type, amount, status, method, tx_hash, currency, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            type,
            amount,
            status,
            data.method,
            txHash,
            data.currency,
            JSON.stringify(data.details),
            createdTime
          ]
        );
      } else {
        await run(
          `UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE id = ? AND status != ?`,
          [status, existingTx.id, status]
        );
      }
    }
  } catch (err) {
    logger.error(`[syncUserTransactions] Error: ${err}`);
  }
}

export async function syncUserTradesFromFirestore(uid: string) {
  if (!adminDb || !uid) return;
  try {
    const snapshot = await adminDb.collection('trades').where('userId', '==', uid).get();
    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const firebaseId = doc.id;

      const existing = await get('SELECT id FROM trades WHERE firebase_id = ?', [firebaseId]);
      if (!existing) {
        await run(`
          INSERT INTO trades (firebase_id, user_id, market_id, amount, direction, entry_price, exit_price, duration, expiry_time, is_demo, status, payout_amount, settled_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            firebaseId, uid, data.marketId, data.amount, data.direction, 
            data.entryPrice, data.exitPrice || null, data.duration, 
            data.expiryTime, data.isDemo ? 1 : 0, data.status || 'open', 
            data.payoutAmount || 0, data.settledAt || null, data.createdAt || Date.now()
          ]
        );
      } else {
        await run(`
          UPDATE trades SET status = ?, exit_price = ?, payout_amount = ?, settled_at = ? 
          WHERE firebase_id = ? AND status != ?`,
          [data.status || 'open', data.exitPrice || null, data.payoutAmount || 0, data.settledAt || null, firebaseId, data.status]
        );
      }
    }
  } catch (err: any) {
    logger.error(`[syncUserTrades] Error: ${err.message}`);
  }
}

export async function syncUserKycFromFirestore(userId: string) {
  if (!adminDb || !userId) return;
  try {
    const kycSnap = await adminDb.collection('kycRequests').where('userId', '==', userId).get();
    
    // Always update user table status from Firestore user doc first
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData) {
        await run(
          'UPDATE users SET kyc_status = ?, is_verified = ? WHERE uid = ?',
          [userData.kycStatus || 'unverified', (userData.is_verified || userData.isVerified || userData.emailVerified) ? 1 : 0, userId]
        );
      }
    }

    if (!kycSnap.empty) {
      for (const doc of kycSnap.docs) {
        const data = doc.data();
        const existing = await get('SELECT id FROM kyc_requests WHERE user_id = ? AND (full_name = ? AND document_number = ?)', 
          [userId, data.fullName, data.idNumber]);
        
        if (!existing) {
          await run(
            `INSERT INTO kyc_requests (user_id, status, full_name, document_type, document_number, front_image, back_image, selfie_image, rejection_reason, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              data.status || 'pending',
              data.fullName || '',
              data.idType || '',
              data.idNumber || '',
              data.idFrontUrl || '',
              data.idBackUrl || '',
              data.selfieUrl || '',
              data.rejectionReason || null,
              data.timestamp || Date.now(),
              data.updatedAt || Date.now()
            ]
          );
        } else {
          await run(
            'UPDATE kyc_requests SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?',
            [data.status || 'pending', data.rejectionReason || null, Date.now(), existing.id]
          );
        }
      }
    }
  } catch (err: any) {
    logger.error(`[syncUserKyc] Error: ${err.message}`);
  }
}

/**
 * Authoritatively syncs all user data from Firestore to SQLite.
 * This is the "Truth" restoration flow.
 */
export async function authoritativeSync(userId: string, emitSocket = true) {
  if (!adminDb || !userId) return null;
  
  try {
    const doc = await adminDb.collection('users').doc(userId).get();
    if (!doc.exists) return null;

    const fireData = doc.data();
    if (!fireData) return null;

    const oldUser = await get('SELECT * FROM users WHERE uid = ?', [userId]) as any;
    let user = oldUser;

    if (!user) {
      // Restore basic profile
      await run(
        `INSERT INTO users (
          uid, email, display_name, real_balance, demo_balance, 
          kyc_status, is_verified, country, referral_code, referred_by_uid,
          affiliate_balance, total_affiliate_earnings, referral_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          fireData.email || '',
          fireData.displayName || fireData.name || '',
          fireData.balance || 0,
          fireData.demoBalance || 10000,
          fireData.kycStatus || 'unverified',
          (fireData.is_verified || fireData.isVerified || fireData.emailVerified) ? 1 : 0,
          fireData.country || '',
          fireData.referralCode || '',
          fireData.referredBy || '',
          fireData.affiliateBalance || 0,
          fireData.totalAffiliateEarnings || 0,
          fireData.referralCount || 0
        ]
      );
      user = await get('SELECT * FROM users WHERE uid = ?', [userId]);
    } else {
      // Authoritatively update existing record
      await run(
        `UPDATE users SET 
          real_balance = ?, demo_balance = ?, kyc_status = ?, is_verified = ?,
          display_name = ?, country = ?, affiliate_balance = ?, 
          total_affiliate_earnings = ?, referral_count = ?
        WHERE uid = ?`,
        [
          fireData.balance || 0,
          fireData.demoBalance || 10000,
          fireData.kycStatus || 'unverified',
          (fireData.is_verified || fireData.isVerified || fireData.emailVerified) ? 1 : 0,
          fireData.displayName || fireData.name || user.display_name,
          fireData.country || user.country,
          fireData.affiliateBalance || 0,
          fireData.totalAffiliateEarnings || 0,
          fireData.referralCount || 0,
          userId
        ]
      );
      user = await get('SELECT * FROM users WHERE uid = ?', [userId]);
    }

    // Sync sub-collections in parallel background tasks
    Promise.all([
      syncUserTransactionsFromFirestore(userId),
      syncUserTradesFromFirestore(userId),
      syncUserKycFromFirestore(userId)
    ]).catch(e => logger.error(`Sub-sync error: ${e}`));

    const finalUser = await get('SELECT * FROM users WHERE uid = ?', [userId]);
    
    // If something critical changed and we are in background, notify the frontend via socket
    if (emitSocket && oldUser) {
        const io = getIO();
        if (io) {
            const mapped = mapUserForFrontend(finalUser);
            io.to(`user:${userId}`).emit('user_update', mapped);
            // Also notify balance specifically if changed
            if (oldUser.real_balance !== finalUser.real_balance || oldUser.demo_balance !== finalUser.demo_balance) {
                io.to(`user:${userId}`).emit('balance_update', {
                    real_balance: finalUser.real_balance,
                    demo_balance: finalUser.demo_balance
                });
            }
        }
    }

    return finalUser;
  } catch (err: any) {
    logger.error(`[authoritativeSync] Error for ${userId}: ${err.message}`);
    return null;
  }
}
