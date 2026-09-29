import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function main() {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error("Config file not found.");
    return;
  }

  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  console.log("Client-side Firebase initialized successfully!");

  const campaignsSnap = await getDocs(collection(db, 'campaigns'));
  console.log(`Found ${campaignsSnap.size} campaigns:`);

  for (const campaignDoc of campaignsSnap.docs) {
    const data = campaignDoc.data();
    console.log(`\n================ CAMPAIGN ID: ${campaignDoc.id} ================`);
    console.log(`Name: ${data.name}`);
    console.log(`Approved Lineup:`, JSON.stringify(data.approvedLineup, null, 2));

    // Get premortem runs
    const premortemSnap = await getDocs(collection(db, `campaigns/${campaignDoc.id}/premortemRuns`));
    console.log(`Premortem runs count: ${premortemSnap.size}`);
    for (const runDoc of premortemSnap.docs) {
      const runData = runDoc.data();
      console.log(` - Run ID: ${runDoc.id}, Approved: ${runData.approved}, Score: ${runData.healthScore}`);
    }

    // Get creators
    const creatorsSnap = await getDocs(collection(db, `campaigns/${campaignDoc.id}/creators`));
    console.log(`Creators count: ${creatorsSnap.size}`);
    for (const crtDoc of creatorsSnap.docs) {
      const crtData = crtDoc.data();
      console.log(` - Creator: ${crtDoc.id} | Name: ${crtData.channel?.title || crtData.input}`);
    }
  }
}

main().catch(console.error);
