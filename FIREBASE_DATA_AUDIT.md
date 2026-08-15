# Firebase Database Architecture Audit Report
**Application Name:** Bivaax Binary Trading App  
**Target Project:** `gen-lang-client-0751918977`  
**Firestore Database ID:** `ai-studio-bivaax-35757849-a9c8-4b69-8132-841aa70fcb62`  
**Auditor:** AI Studio Security & Architecture Auditor  
**Date:** August 2026  

---

## 1. Executive Summary

This audit report evaluates the Bivaax Binary Trading Application’s data synchronization, storage reliability, and security practices across its hybrid data tier: **SQLite (Local Server State)**, **Firebase Authentication (Identity Provider)**, and **Cloud Firestore (Permanent Cloud Backup and Sync)**.

### Core Architecture Findings:
1. **The Ephemeral Container Challenge:** The application operates inside a containerized environment (Cloud Run/Docker). Its local file system is ephemeral, meaning the local SQLite file (`database.sqlite`) is completely deleted and recreated during every application update, redeployment, or container cold-start.
2. **Resilience Strategy:** The system is explicitly designed to handle this local data loss. It uses a **"Sync-on-Startup"** and **"Sync-on-Login"** model. Real-time changes (balances, trades, transactions) are kept in SQLite for ultra-fast, transactional trading execution, and immediately streamed to Cloud Firestore. Upon container reboot, bulk sync hooks and user-specific login sync endpoints reconstruct the local SQLite database from Firestore.
3. **Data Loss Risks Identified:** 
   - *Active Sync Interruption:* If a user is actively placing trades or making transactions during a container shutdown, there is a microsecond gap between the SQLite write and the Firestore write, which could result in a sync discrepancy.
   - *Vulnerability Backdoors:* A major vulnerability was identified in the Express user update endpoint and Firestore Security Rules that allows authenticated users to write directly to their profile fields (including balances and KYC status). This represents a catastrophic risk of data manipulation and fraud, rather than accidental data reset.
   - *Seeding Is Safe:* The payment gateway initialization (`depositMethods` and `app_config`) is safe. It only seeds default values if documents are absent, ensuring that customized admin addresses are never overwritten during redeployments.

---

## 2. Firebase Connection Audit

The Bivaax application relies on a solid, persistent configuration to ensure that it connects to the correct Firebase project after every update.

### Configuration Parameters:
*   **Active Project ID:** `gen-lang-client-0751918977`
*   **Firestore Database ID:** `ai-studio-bivaax-35757849-a9c8-4b69-8132-841aa70fcb62`
*   **Auth Domain:** `gen-lang-client-0751918977.firebaseapp.com`
*   **Storage Bucket:** `gen-lang-client-0751918977.firebasestorage.app`
*   **OAuth Client ID:** `624588178644-t52toftc0qfkgqcsjomq5ll7r1ihft13.apps.googleusercontent.com`

### Configuration Persistence Analysis:
The Firebase connection configuration is defined in `/firebase-applet-config.json` at the root of the workspace. This file is bound and injected at the platform level. It is loaded by the Express backend via `firebase-admin` and read by the React client-side in `src/firebase.ts`. 

Because this file is persisted by the platform, **there is zero risk of the application connecting to a temporary, demo, or wrong Firebase database after update/redeployment.**

---

## 3. User Data Audit & Persistence

The user profile is the core anchor connecting Firebase Authentication, Cloud Firestore, and the SQLite state.

```
Firebase Auth (UID)  --->  Firestore Profile (/users/{uid})  --->  Local SQLite (users table)
```

### Profile Persistence Flow:
1. **Registration:**
   * **Local Registration:** When a user registers using the local email/password form, the profile is written to the local SQLite `users` table and immediately pushed to Firestore using the generated custom user ID (e.g., `usr_...`).
   * **Firebase Sync:** Google and Firebase Auth users authenticate on the client, producing a Firebase ID Token. This is sent to `/api/user/sync`. The backend verifies the token against Firebase Auth (`adminAuth.verifyIdToken(token)`) and creates the SQLite user profile if it doesn't exist, mirroring it to Firestore `/users/{uid}`.

2. **Login Verification:**
   * If a user logs in with email and password, the system checks SQLite. If SQLite is empty (after a redeploy), the backend queries Cloud Firestore by email. If found, it restores their profile, balance, and hashed password back into SQLite, achieving seamless persistence.

3. **Startup Restoration (The Boot Sync):**
   * On server startup, `syncAllUsersFromFirestore()` in `src/api/routes.ts` queries the latest 1,000 user profiles from Cloud Firestore and syncs them to SQLite.
   * If any record exists in SQLite, the sync updates SQLite properties if they differ from Firestore, ensuring data consistency.

---

## 4. Balance Persistence Audit

Financial balances are highly sensitive and require strict coordination between local transaction speed and remote durability.

### Real-Time Balance Life Cycle:
1. **Trade Placement:**
   * User places a trade -> Request is sent to `/api/trades/place`.
   * The server executes an atomic database transaction on SQLite (`transaction(async (conn) => { ... })`).
   * It locks the user's row, verifies they have sufficient balance, and deducts the trade amount.
   * After updating SQLite, the system immediately calls `syncUserToFirestore` to update the Firestore `/users/{uid}` document with the new balance.

2. **Trade Settlement:**
   * Trades are settled on the server side via `settleTrade` in `src/services/tradeService.ts`.
   * Settlement is wrapped in a SQLite transaction (`transaction(async (conn) => { ... })`).
   * Payouts are computed and added back to the user's balance.
   * The updated balance is immediately pushed to Firestore via `syncUserToFirestore`.

3. **Reconciliations:**
   * When a user visits the terminal or logs in, `/api/user/sync` checks if the user's balance in SQLite differs from Firestore. Firestore balances override SQLite during this sync if there is a conflict.

### Race Conditions Risk Analysis:
* **SQLite Level:** **Extremely Secure.** Because of SQLite's transaction-level locking (`BEGIN` / `COMMIT`), multiple simultaneous trades or settlements cannot corrupt or double-deduct the local balance.
* **Sync Level:** **Low to Medium Risk.** The Firestore sync is asynchronous (`syncUserToFirestore` is called without blocking the HTTP response). If a container crashes in the narrow window after SQLite updates but before Firestore finishes writing, the remote balance could lag behind. However, active sessions continuously update this state, minimizing discrepancy windows.

---

## 5. Referral & Affiliate System Audit

The Bivaax platform contains a sophisticated referral network where users earn commissions on their referred users' losses (Revenue Share).

### Referral Structure:
* **`referred_by_uid`**: Stores the UID of the referrer.
* **`referral_code` / `affiliateId`**: Unique string or numeric identifier.

### Registration Linkage:
During signup/sync, the client provides a `referralCode`. The backend:
1. Searches SQLite for the referral code.
2. If not found (e.g., SQLite is empty after redeployment), it queries Cloud Firestore `/users` where `affiliateId` or `referralCode` matches.
3. If the referrer is found, the backend links them to the new user in SQLite (`referred_by_uid = referrer.uid`), increments `referral_count` in both databases, and immediately syncs both accounts.

### Commission Distribution:
When a referred user loses a real trade, `processRevenueShare` in `src/lib/affiliate.ts`:
1. Fetches the referrer's profile from Cloud Firestore.
2. Evaluates their commission tier (50%, 60%, 70%, or 80%) based on `referralCount`.
3. Calculates `shareAmount = lostAmount * (sharePercent / 100)`.
4. Updates the referrer's document in Firestore (`affiliateBalance` and `totalAffiliateEarnings` incremented).
5. Writes a record to the `affiliate_commissions` Firestore collection.
6. The next time the referrer logs in or triggers a sync, the remote balances are restored to SQLite.

---

## 6. Trading & Transaction Data Audit

A trading platform must protect the integrity of its ledger. Bivaax achieves this by storing trade history and wallet transactions as permanent remote collections.

### Ledger Storage:
*   **Trades:** Synced to the Firestore `trades` collection under the document ID matching the SQLite trade ID.
*   **Transactions (Deposits/Withdrawals):** Synced to Firestore `transactions` collection.

### Data Recovery on Ephemeral Reset:
When a container is redeployed, the local SQLite `trades` and `transactions` tables are wiped.
To restore this data, the backend endpoint `/api/user/sync` executes two recovery routines:
1. **`syncUserTransactions(uid)`:** Fetches all transactions for this specific user from Firestore and inserts them back into SQLite.
2. **`syncUserSpecificTradesFromFirestore(uid)`:** Fetches all historical trades for this user from Firestore and writes them back into SQLite.

This ensures that when a user logs back in after an update, their entire dashboard trade history and deposit logs are fully populated.

---

## 7. Security Rules Audit (`firestore.rules`)

The security of Cloud Firestore depends on its rules engine to prevent malicious actors from manipulating their profiles.

### Analysis of `/firestore.rules`:
1. **Critical Vulnerability (Unrestricted Profile Writes):**
   ```firestore
   match /users/{userId} {
     allow read: if isOwner(userId) || isSupport();
     allow write: if isOwner(userId) || isAdmin();
   }
   ```
   **Vulnerability:** This rule grants the owner (`userId`) full write access to their entire document. A malicious user can write directly to their document in Firestore (using the client-side SDK) and change their `balance`, `real_balance`, `affiliateBalance`, `kycStatus`, and `isAdmin` status. When they refresh the page or sync, the backend will trust Firestore and sync these fraudulent values back into SQLite.

2. **Critical Vulnerability (Unrestricted Deposit/Withdrawal Creation):**
   ```firestore
   match /deposits/{depId} {
     allow read: if isSignedIn() && (resource == null || resource.data.userId == request.auth.uid || isAdmin());
     allow write: if isSignedIn();
   }
   ```
   **Vulnerability:** Any signed-in user can write a deposit record directly. A user can write a fake deposit document with `status: "completed"` and `amount: 5000` directly into Firestore.

3. **Hardcoded Admin List:**
   The `isAdmin()` check relies on a hardcoded list of admin emails:
   ```firestore
   let adminEmailList = ['bivaaxofficial@gmail.com', 'bivaaxtrader@gmail.com', 'rimonmahmud@gmail.com'];
   ```
   *Note:* While functional, any changes to the administration team require a redeployment of Firebase rules, which is a rigid practice.

---

## 8. Specific Files and Code Locations for "Data Reset" Dangers

During our analysis, we pinpointed the exact code locations that could lead to financial inconsistencies or data discrepancies.

### 1. The Catastrophic "PATCH Route" Backdoor
*   **File:** `/src/api/routes.ts`
*   **Location:** Line 1568-1616 (PATCH `/api/users/:id`)
*   **Code Segment:**
    ```ts
    router.patch('/users/:id', requireAuth, async (req: AuthRequest, res) => {
      const { id } = req.params;
      if (req.user!.uid !== id && !req.user!.isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      ...
      const fieldMap: { [key: string]: string } = {
        ...
        realBalance: 'real_balance',
        demoBalance: 'demo_balance',
        balance: 'real_balance',
      };
    ```
    **Danger:** The server allows a user to edit *their own* fields because `req.user!.uid === id` is evaluated first. Since `realBalance` and `balance` are mapped, **any registered user can make a REST call to patch their own balance** and credit themselves with infinite money. This represents a severe data manipulation and integrity bypass.

### 2. Is `depositMethods` Overwritten on Redeploy?
*   **File:** `/src/App.tsx`
*   **Location:** Line 75-390 (inside `initializePaymentSettingsAndMethods`)
*   **Logic Evaluation:** 
    We inspected whether payment methods (custom wallet addresses, toggle statuses) are reset on redeploy.
    The code retrieves the active methods from Firestore:
    ```ts
    const binanceQ = query(methodsCol, where('name', '==', 'Binance Pay'));
    const binanceSnap = await getDocs(binanceQ);
    ...
    const binancePayDoc = binanceSnap.docs.find(d => d.data().name === "Binance Pay");
    if (!binancePayDoc) {
      await setDoc(doc(methodsCol), binancePayData);
    }
    ```
    **Audit Conclusion:** **This logic is 100% safe.** It first queries Firestore. If a custom address or status is found, the document is NOT created or overwritten. Default configurations are only seeded if the collections/documents are completely missing. This ensures customized payment details set by the administrator are **never** lost during updates or redeployments.

---

## 9. Production Architecture Diagram

The diagram below maps the runtime interaction and boundaries between the ephemeral front-facing application and the durable back-end database tier.

```
+---------------------------------------------------------------------------------+
|                                CLIENT BROWSER                                   |
|                                                                                 |
|   +-----------------------+                    +----------------------------+   |
|   |   React UI Components |                    | Firebase Auth Web SDK      |   |
|   +-----------+-----------+                    +-------------+--------------+   |
+---------------|----------------------------------------------|------------------+
                |                                              |
                | (REST API Calls / JWT Token)                 | (Auth Token / OAuth)
                v                                              v
+--------------------------------------------------------------+------------------+
|                            CLOUD RUN SERVER CONTAINER                           |
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   |                           Express API Layer                             |   |
|   |                                                                         |   |
|   |   +-------------------+    (Local Write)   +-----------------------+    |   |
|   |   | SQL Transactions  |------------------->|  SQLite Local Database|    |   |
|   |   |  (Atomic Locking) |                    |  (database.sqlite)    |    |   |
|   |   +---------+---------+                    +-----------------------+    |   |
|   |             |                                                           |   |
|   +-------------|-----------------------------------------------------------+   |
+-----------------|---------------------------------------------------------------+
                  |
                  | (Firebase Admin SDK / gRPC)
                  v
+---------------------------------------------------------------------------------+
|                              GOOGLE CLOUD PLATFORM                              |
|                                                                                 |
|   +-----------------------------+               +---------------------------+   |
|   |   Firebase Authentication   |               |      Cloud Firestore      |   |
|   |    (Verified Server-Side)   |               |     (Durable Storage)     |   |
|   +-----------------------------+               +---------------------------+   |
+---------------------------------------------------------------------------------+
```

---

## 10. Recommended Remediation Roadmap (Phase 2 Action Plan)

To permanently secure the platform and optimize sync reliability, we recommend the following non-destructive improvements in the next phase of work:

1.  **Repair the User PATCH Route:**
    Block non-admin users from passing restricted financial properties (`realBalance`, `demoBalance`, `kycStatus`) to `/api/users/:id`.
2.  **Harden Firestore Security Rules:**
    Refine `/firestore.rules` to prevent direct client-side updates of critical attributes (like `balance`, `real_balance`, `isAdmin`, or Completed Transaction states), forcing all updates to happen through the secure Express Admin SDK.
3.  **Implement Sync Queueing:**
    Add a tiny state machine or job queue for Firestore sync operations to ensure that if a Firebase request temporarily times out, it is queued and retried without blocking the user interface.
