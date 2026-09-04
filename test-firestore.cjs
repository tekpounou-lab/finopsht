const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "ai-studio-007bdbb1-7c82-4aab-ab17-f3b0aff2673c"
});
const db = admin.firestore();
async function run() {
  const user = await db.collection('users').doc('IeLFaHNvfFezBNw5mCW69YmLnUl2').get();
  console.log('User exists?', user.exists);
  if (user.exists) {
    console.log('User data:', user.data());
  }
}
run().catch(console.error);
