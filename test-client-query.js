import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, onSnapshot } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  console.log("Setting up client-side test...");
  // We can't easily sign in with Google in node.js client sdk.
  // Is there a way to verify rules?
}

run().catch(console.error);
