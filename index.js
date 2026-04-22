require("dotenv").config();
const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;
const API = `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`;

const sessions = {};

function session(phone) {
  if (!sessions[phone]) sessions[phone] = { step: "start", data: {} };
  return sessions[phone];
}

function reset(phone) {
  sessions[phone] = { step: "start", data: {} };
}

async function send(to, text) {
  try {
    await axios.post(API,
      { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
      { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Send error:", e.response?.data || e.message);
  }
}

async function sendButtons(to, body, buttons) {
  try {
    await axios.post(API, {
      messaging_product: "whatsapp", to, type: "interactive",
      interactive: {
        type: "button", body: { text: body },
        action: { buttons: buttons.map((b, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: b.slice(0, 20) } })) }
      }
    }, { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Button error:", e.response?.data || e.message);
  }
}

async function handle(phone, text, btnId) {
  const s = session(phone);
  const t = (text || "").trim().toLowerCase();
  const b = btnId || "";

  if (s.step === "start") {
    await sendButtons(phone,
      `שלום! כאן מרפאת ד"ר בני פרדמן 🦷\nמומחה לשיקום הפה | הרצליה\n\nבמה אוכל לעזור?`,
      ["תיאום תור", "שאלה כללית", "כאב דחוף"]
    );
    s.step = "main";
    return;
  }

  if (s.step === "main") {
    if (b === "btn_0" || t.includes("תיאום") || t.includes("תור")) {
      await sendButtons(phone,
        "מעולה! לאיזה טיפול אתה/את מגיע/ה?",
        ["שיקום / כתרים", "השתלות", "ציפויים / הלבנה"]
      );
      s.step = "treatment";
    } else if (b === "btn_1" || t.includes("שאלה")) {
      await send(phone, "שמחים לעזור 😊\nשלח/י את שאלתך וד\"ר בני יחזור אליך בהקדם.\n\nלתיאום תור: 054-540-7199");
      reset(phone);
    } else if (b === "btn_2" || t.includes("כאב") || t.includes("דחוף")) {
      await send(phone, "מבינים שזה קשה 😔\nלטיפול דחוף — צור/י קשר ישיר:\n📞 054-540-7199\n\nד\"ר בני יחזור אליך במהירות האפשרית.");
      reset(phone);
    } else {
      reset(phone);
      await handle(phone, text, btnId);
    }
    return;
  }

  if (s.step === "treatment") {
    let treatment = "";
    if (b === "btn_0" || t.includes("שיקום") || t.includes("כתר")) treatment = "שיקום / כתרים";
    else if (b === "btn_1" || t.includes("השתל")) treatment = "השתלות";
    else if (b === "btn_2" || t.includes("ציפוי") || t.includes("הלבנ")) treatment = "ציפויים / הלבנה";
    else treatment = text || "טיפול";
    s.data.treatment = treatment;

    await sendButtons(phone,
      `קיבלנו — ${treatment}.\n\nהנה מועדים פנויים בקרוב:`,
      ["יום ג׳ הקרוב 09:00", "יום ג׳ הקרוב 14:00", "יום ו׳ הקרוב 09:00"]
    );
    s.step = "slot";
    return;
  }

  if (s.step === "slot") {
    const slots = ["יום ג׳ 09:00", "יום ג׳ 14:00", "יום ו׳ 09:00"];
    const chosen = b === "btn_0" ? slots[0] : b === "btn_1" ? slots[1] : b === "btn_2" ? slots[2] : text;
    s.data.slot = chosen;

    await send(phone,
      `מעולה! קיבלנו את בקשתך:\n\n` +
      `📅 ${chosen}\n` +
      `🦷 ${s.data.treatment}\n\n` +
      `ד"ר בני יאשר את התור ויחזור אליך ל-054-540-7199.\n\n` +
      `לשאלות: ferdman.clinic@gmail.com\n` +
      `📍 הנדיב 71, הרצליה — קומה 2, חדר 221`
    );
    reset(phone);
    return;
  }

  reset(phone);
  await handle(phone, "", "");
}

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;
    const phone = msg.from;
    let text = "", btnId = "";
    if (msg.type === "text") text = msg.text?.body || "";
    else if (msg.type === "interactive") {
      const i = msg.interactive;
      if (i.type === "button_reply") { btnId = i.button_reply.id; text = i.button_reply.title; }
    }
    await handle(phone, text, btnId);
  } catch (e) {
    console.error("Webhook error:", e.message);
  }
});

app.get("/", (_, res) => res.send("Dr. Benny Ferdman Bot — Active"));

app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
