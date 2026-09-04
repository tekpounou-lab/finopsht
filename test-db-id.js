import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json', 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: "tek-pou-nou-tpn"
});

const dbDefault = getFirestore(app);
const dbNamed = getFirestore(app, "ai-studio-finopstekpounou-007bdbb1-7c82-4aab-ab17-f3b0aff2673c");

async function check() {
  const s1 = await dbDefault.collection("businesses").get();
  console.log(`Default DB businesses: ${s1.size}`);
  const s2 = await dbNamed.collection("businesses").get();
  console.log(`Named DB businesses: ${s2.size}`);
}
check().catch(console.error);
