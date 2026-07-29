const token = "372bce2b-f4fe-4469-99a5-c3697e281180"; // User token from settings
const targetPhone = "558791791807"; // Target test phone number

async function run() {
  const img = "https://i.imgur.com/l8StCRM.jpeg";
  const payload = {
    number: targetPhone,
    type: "button",
    text: "🚀 ASSINATURAS PREMIUM COM ENTREGA AUTOMÁTICA!\n\n✅ Entrega imediata após a compra\n🛡️ Suporte por 30 dias",
    choices: ["Comprar Agora|https://www.contaspj.shop/"],
    imageButton: img,
    image: img,
    imageUrl: img,
    mediaUrl: img,
    media: img,
    footerText: "⚡ Entrega Automática • 🛡️ Suporte 30 Dias"
  };

  console.log("Sending UAZAPI send/menu request with aliases...");
  try {
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
    console.log("UAZAPI Response body:", resText);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

run();
