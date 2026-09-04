import { getAdminFirestore, getAdminApp, getAdminAuth } from "../src/lib/firebaseAdmin";
import firebaseConfig from "../firebase-applet-config.json";

async function runTest() {
  console.log("=== Testing Firebase Admin SDK Connectivity & Writes ===");
  try {
    const app = getAdminApp();
    console.log(`[Admin App] App name: ${app.name}, Project ID: ${app.options.projectId}`);

    const db = getAdminFirestore();
    const testDocId = `admin_probe_${Date.now()}`;
    const testDocRef = db.doc(`_connectivity_probes/${testDocId}`);

    console.log(`[Firestore Write Probe] Attempting to write test document to: _connectivity_probes/${testDocId}`);
    await testDocRef.set({
      test: true,
      timestamp: new Date().toISOString(),
      source: "Admin SDK Diagnostic Probe",
      databaseId: firebaseConfig.firestoreDatabaseId
    });

    console.log("✅ Successfully wrote test document via Admin SDK!");

    const readDoc = await testDocRef.get();
    if (readDoc.exists) {
      console.log("✅ Successfully verified read of test document:", readDoc.data());
    }

    await testDocRef.delete();
    console.log("✅ Successfully cleaned up test document.");
    console.log("🎉 ALL ADMIN SDK PERMISSIONS VERIFIED SUCCESSFULLY!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ FAILED Admin SDK Write Test:");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
    console.error("Details:", error.details || "None");
    process.exit(1);
  }
}

runTest();
