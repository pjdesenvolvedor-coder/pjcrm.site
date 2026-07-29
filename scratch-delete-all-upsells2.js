const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, deleteField } = require('firebase/firestore');

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
  console.log("Cleaning upsells2 from all users in Firestore...");
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    let cleanedCount = 0;
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const settingsSnap = await getDocs(collection(db, "users", userId, "settings"));
      for (const sDoc of settingsSnap.docs) {
        if (sDoc.id === "config") {
          const data = sDoc.data();
          if (data.upsells2 !== undefined) {
            await updateDoc(doc(db, "users", userId, "settings", "config"), {
              upsells2: deleteField()
            });
            cleanedCount++;
            console.log(`Cleaned upsells2 from user ${userId}`);
          }
        }
      }
    }
    console.log(`Finished! Cleaned upsells2 from ${cleanedCount} user settings documents.`);
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
