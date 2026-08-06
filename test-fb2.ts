import { adminAuth } from './src/lib/firebase-admin.ts';
async function test() {
  try {
    const token = "dummy";
    const decoded = await adminAuth.verifyIdToken(token);
    console.log("Success:", decoded);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
test();
