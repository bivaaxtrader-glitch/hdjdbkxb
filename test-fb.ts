import { adminAuth } from './src/lib/firebase-admin.ts';
async function test() {
  try {
    const user = await adminAuth.createUser({
      email: "test-auth-22@example.com",
      password: "password123"
    });
    console.log("Success:", user.uid);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
test();
