import { collection, addDoc, getDocs, query, where, updateDoc, doc } from "./firebase";
import { db } from "./firebase";

export const seedPromo = async () => {
  // Client-side seeding is disabled to prevent "Failed to fetch" errors.
  // Seeding is now handled securely on the server-side inside routes.ts / syncDatabaseFromFirestore.
  console.log("Client-side seeding disabled; handled server-side.");
};
