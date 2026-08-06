import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function testProject(projectId: string, databaseId?: string) {
  console.log(`\n--- Testing Project: ${projectId}, Database: ${databaseId || '(default)'} ---`);
  try {
    const app = initializeApp({ projectId }, `app-${projectId}-${databaseId || 'default'}`);
    const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
    const collections = await db.listCollections();
    console.log(`✅ Success! Found ${collections.length} collections.`);
  } catch (err: any) {
    console.error(`❌ Failed: ${err.message}`);
  }
}

async function runTests() {
  const configProjectId = 'project-cd57644d-f430-4251-bf2';
  const databaseId = 'ai-studio-bivaax-c738f63f-30fb-4247-a5bb-1aa38ecfdb3f';

  await testProject(configProjectId, databaseId);
  await testProject(configProjectId, undefined); // This should be (default)
  
  process.exit(0);
}

runTests();
