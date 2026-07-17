const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  isJidUser,
} = require("@whiskeysockets/baileys");
const express = require("express");
const cors = require("cors");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let isConnected = false;
let isConnecting = false;

// ─── WhatsApp Connection ───────────────────────────────────────────────────

async function connectToWhatsApp() {
  if (isConnecting) return;
  isConnecting = true;

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: require("pino")({ level: "silent" }),
    markOnlineOnConnect: false,
    connectTimeoutMs: 30000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log("\n📱 Scan the QR code above with WhatsApp on your phone.");
      console.log("   Go to WhatsApp → Linked Devices → Link a Device\n");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connected! API is ready.\n");
      isConnected = true;
      isConnecting = false;
    }

    if (connection === "close") {
      isConnected = false;
      isConnecting = false;

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("🔄 Reconnecting...");
        setTimeout(connectToWhatsApp, 3000);
      } else {
        console.log("❌ Logged out. Delete auth_info folder and restart.");
      }
    }
  });
}

// ─── Helper: normalize phone number ───────────────────────────────────────

function normalizePhone(phone) {
  return phone.toString().replace(/[\s\-\(\)\+]/g, "");
}

// ─── Routes ───────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.json({
    service: "WhatsApp Number Validator API",
    status: isConnected ? "connected" : "disconnected",
    endpoints: {
      "POST /validate": "Validate a single number",
      "POST /validate/bulk": "Validate multiple numbers (max 50)",
      "POST /send": "Send a WhatsApp message",
      "GET /status": "Check connection status",
    },
  });
});

// Connection status
app.get("/status", (req, res) => {
  res.json({
    connected: isConnected,
    message: isConnected
      ? "WhatsApp session is active"
      : "WhatsApp not connected. Check terminal for QR code.",
  });
});

// ── Single number validation ──
app.post("/validate", async (req, res) => {
  if (!isConnected) {
    return res.status(503).json({
      success: false,
      error: "WhatsApp session not ready. Check terminal for QR code.",
    });
  }

  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({
      success: false,
      error: 'Missing "phone" field in request body.',
    });
  }

  const normalized = normalizePhone(phone);

  if (!/^\d{7,15}$/.test(normalized)) {
    return res.status(400).json({
      success: false,
      error:
        "Invalid phone number format. Use E.164 without +, e.g. 923001234567",
    });
  }

  try {
    const jid = `${normalized}@s.whatsapp.net`;
    const [result] = await sock.onWhatsApp(jid);

    return res.json({
      success: true,
      phone: normalized,
      exists: result?.exists ?? false,
      jid: result?.jid ?? null,
    });
  } catch (err) {
    console.error("Validation error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Validation failed. " + err.message,
    });
  }
});

// ── Bulk validation ──
app.post("/validate/bulk", async (req, res) => {
  if (!isConnected) {
    return res.status(503).json({
      success: false,
      error: "WhatsApp session not ready. Check terminal for QR code.",
    });
  }

  const { phones } = req.body;

  if (!phones || !Array.isArray(phones)) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid "phones" array in request body.',
    });
  }

  if (phones.length > 50) {
    return res.status(400).json({
      success: false,
      error: "Maximum 50 numbers per bulk request.",
    });
  }

  const results = [];

  for (const phone of phones) {
    const normalized = normalizePhone(phone);

    if (!/^\d{7,15}$/.test(normalized)) {
      results.push({ phone: normalized, exists: false, error: "Invalid format" });
      continue;
    }

    try {
      const jid = `${normalized}@s.whatsapp.net`;
      const [result] = await sock.onWhatsApp(jid);

      results.push({
        phone: normalized,
        exists: result?.exists ?? false,
        jid: result?.jid ?? null,
      });

      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      results.push({ phone: normalized, exists: false, error: err.message });
    }
  }

  const summary = {
    total: results.length,
    registered: results.filter((r) => r.exists).length,
    not_registered: results.filter((r) => !r.exists && !r.error).length,
    errors: results.filter((r) => r.error).length,
  };

  return res.json({ success: true, summary, results });
});

// ── Send message ──
app.post("/send", async (req, res) => {
  if (!isConnected) {
    return res.status(503).json({
      success: false,
      error: "WhatsApp session not ready. Check terminal for QR code.",
    });
  }

  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing "to" or "message" field in request body.',
    });
  }

  const normalized = normalizePhone(to);

  if (!/^\d{7,15}$/.test(normalized)) {
    return res.status(400).json({
      success: false,
      error: "Invalid phone number format. Use E.164 without +, e.g. 923001234567",
    });
  }

  try {
    const jid = `${normalized}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });

    return res.json({ success: true, to: normalized });
  } catch (err) {
    console.error("Send error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to send message. " + err.message,
    });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   WhatsApp Number Validator API        ║");
  console.log(`║   Running on http://localhost:${PORT}     ║`);
  console.log("╚════════════════════════════════════════╝\n");
  console.log("🔌 Connecting to WhatsApp...\n");
  await connectToWhatsApp();
});