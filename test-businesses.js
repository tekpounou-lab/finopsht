import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore("ai-studio-finopstekpounou-007bdbb1-7c82-4aab-ab17-f3b0aff2673c");

async function checkBusinesses() {
  console.log("Checking businesses...");
  const snap = await db.collection("businesses").get();
  console.log(`Found ${snap.size} businesses.`);
  snap.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

checkBusinesses().catch(console.error);
