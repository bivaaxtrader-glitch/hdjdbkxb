const admin = require("firebase-admin");
const serviceAccount = require("./firebase-blueprint.json"); // well, this is schema. 

// Actually I can't easily seed firestore from node without the service account key.
// But I can add it to the default seeding logic in `AdminDashboard.tsx`.
