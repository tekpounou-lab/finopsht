import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore("ai-studio-finopstekpounou-007bdbb1-7c82-4aab-ab17-f3b0aff2673c");

async function checkUsers() {
  console.log("Checking users...");
  const snap = await db.collection("users").get();
  console.log(`Found ${snap.size} users.`);
  snap.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

checkUsers().catch(console.error);
