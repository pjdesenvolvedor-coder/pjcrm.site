const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc, deleteField } = require('firebase/firestore');

const firebaseConfig = {
  "projectId": "studio-5471169383-dbf19",
  "appId": "1:650735497898:web:a4638f4414017dd8f416d3",
  "apiKey": "AIzaSyDD2M7rruv7xOWuYji2yY0oxxXTWOaHSm4",
  "authDomain": "studio-5471169383-dbf19.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "650735497898"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const userId = "1jazArIvDGSi0lKel1BPO00Ajn43";
  try {
    const ref = doc(db, "users", userId, "settings", "config");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      console.log("Current upsells in DB:", JSON.stringify(data.upsells, null, 2));
      console.log("Current upsells2 in DB:", JSON.stringify(data.upsells2, null, 2));
      
      // Delete old upsells2 field completely from Firestore
      await updateDoc(ref, {
        upsells2: deleteField()
      });
      console.log("Successfully removed old upsells2 field from Firestore!");
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
