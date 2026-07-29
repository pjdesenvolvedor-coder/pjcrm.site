const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

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
  console.log("Fetching users...");
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    console.log(`Found ${querySnapshot.size} users`);
    for (const doc of querySnapshot.docs) {
      console.log("User ID:", doc.id);
      
      const settingsSnapshot = await getDocs(collection(db, "users", doc.id, "settings"));
      settingsSnapshot.forEach(settingsDoc => {
        console.log("  Settings ID:", settingsDoc.id);
        console.log("  Settings Data:", JSON.stringify(settingsDoc.data(), null, 2));
      });
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
