const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

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
  const targetPhone = "558791791807";
  
  try {
    const configSnap = await getDoc(doc(db, "users", userId, "settings", "config"));
    if (!configSnap.exists()) {
      console.log("Config document not found!");
      return;
    }
    
    const settings = configSnap.data();
    const token = settings.webhookToken;
    const upsell = settings.upsells2.find(u => u.isActive && u.upsellDelayMinutes === 0);
    
    if (!upsell) {
      console.log("Active 0-min upsell rule not found!");
      return;
    }
    
    console.log("Upsell rule found. Image length:", upsell.imageButton ? upsell.imageButton.length : 0);
    
    const payload = {
      number: targetPhone,
      type: "button",
      text: upsell.upsellMessage,
      choices: ["Comprar Agora - ENTREGA AUTOMÁTICA|https://www.contaspj.shop/"],
      imageButton: upsell.imageButton,
      image: upsell.imageButton,
      imageUrl: upsell.imageButton,
      mediaUrl: upsell.imageButton,
      media: upsell.imageButton,
      footerText: upsell.footerText
    };
    
    console.log("Sending UAZAPI send/menu request with user settings data...");
    const res = await fetch("https://pjcontas.uazapi.com/send/menu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": token,
        "apikey": token
      },
      body: JSON.stringify(payload)
    });
    
    const resText = await res.text();
    console.log("UAZAPI Response status:", res.status);
    console.log("UAZAPI Response body length:", resText.length);
    console.log("UAZAPI Response body:", resText);
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
