# Firebase Auth & Data Persistence Strategy

This document explains how Bivaax Trade handles user authentication and data persistence in an ephemeral cloud environment (Cloud Run/Railway).

## 1. The Core Problem
Most cloud environments have ephemeral file systems. This means that if we store user data in a local `database.sqlite` file, all user accounts and data are lost every time the application is redeployed or the container restarts.

## 2. The Solution: Firestore as the Source of Truth
We treat **Firebase Firestore** as the permanent "Source of Truth" for all user accounts and critical session data. 

### Synchronization Flow:
1.  **Authentication (Client)**: User signs in or registers via the Firebase Client SDK.
2.  **Sync Trigger**: Upon every authentication state change (or manual login/register), the client calls the `/api/user/sync` (or `/api/auth/sync`) endpoint.
3.  **Server-Side Restoration**:
    -   The server receives the Firebase ID Token.
    -   It validates the token using the Firebase Admin SDK.
    -   It checks if the user exists in the local **SQLite** database.
    -   **If missing in SQLite**: The server fetches the user data from **Firestore** and inserts it into the local SQLite database.
    -   **If found in SQLite**: It ensures the data is up-to-date.
4.  **Session Establishment**: The server issues a local JWT session only after the SQLite synchronization is confirmed.

## 3. Legacy Account Migration
If a user was created before this synchronization system was implemented (using only local SQLite), the sync endpoint performs a lookup by email. If a match is found, it updates the legacy `id` in the database with the real Firebase `UID` to ensure future persistence works correctly.

## 4. Self-Healing Mechanism
The `src/lib/firebase-admin.ts` implements a "Self-Healing" proxy. If Firestore is temporarily unreachable during a sync attempt, it can fall back to a local mock or log the error without crashing the entire authentication flow, allowing for graceful degradation.

## 5. Developer Guidelines
- **Always update both**: When adding new user fields (like `balance`, `vip_level`), ensure the update logic writes to both SQLite (for fast local queries) and Firestore (for persistence).
- **UID as Primary Key**: Always use the Firebase `UID` as the primary identifier across all tables. Avoid using auto-incrementing integers for user IDs as they will lose context upon container restart.
- **Verification**: If a user reports "Invalid email or password" after a redeploy, it usually means their Firestore record is missing or the sync endpoint failed to restore it. Check the `users` collection in the Firebase Console.

## 6. Security
- ID tokens are always validated server-side.
- SQLite is only used as a high-performance local cache for the current container instance.
- Sensitive credentials should never be stored in SQLite without encryption (though Firebase handles password management for us).
