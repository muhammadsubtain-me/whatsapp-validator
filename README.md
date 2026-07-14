# WhatsApp Number Validator API

A free, self-hosted REST API to check if a phone number is registered on WhatsApp. Built with Node.js + Baileys.

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
node index.js
```

### 3. Scan the QR code
A QR code will appear in your terminal. Open WhatsApp on your phone:
> **WhatsApp → Linked Devices → Link a Device → Scan QR**

You only do this **once**. The session is saved in the `auth_info/` folder and persists across restarts.

---

## API Endpoints

### `GET /status`
Check if WhatsApp session is active.

**Response:**
```json
{
  "connected": true,
  "message": "WhatsApp session is active"
}
```

---

### `POST /validate`
Validate a single phone number.

**Request:**
```json
{
  "phone": "923001234567"
}
```

**Response (registered):**
```json
{
  "success": true,
  "phone": "923001234567",
  "exists": true,
  "jid": "923001234567@s.whatsapp.net"
}
```

**Response (not registered):**
```json
{
  "success": true,
  "phone": "923001234567",
  "exists": false,
  "jid": null
}
```

---

### `POST /validate/bulk`
Validate up to **50 numbers** in one request.

**Request:**
```json
{
  "phones": ["923001234567", "923111234567", "923331234567"]
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 3,
    "registered": 2,
    "not_registered": 1,
    "errors": 0
  },
  "results": [
    { "phone": "923001234567", "exists": true, "jid": "923001234567@s.whatsapp.net" },
    { "phone": "923111234567", "exists": false, "jid": null },
    { "phone": "923331234567", "exists": true, "jid": "923331234567@s.whatsapp.net" }
  ]
}
```

---

## Phone Number Format

Use **E.164 format without the `+`**:

| Country | Format | Example |
|---------|--------|---------|
| Pakistan | `92` + number | `923001234567` |
| India | `91` + number | `919876543210` |
| USA | `1` + number | `12025551234` |
| UK | `44` + number | `447911123456` |

The API also accepts formats like `+923001234567`, `0092-300-1234567` — it strips all non-numeric characters automatically.

---

## Tips

- Use a **dedicated/spare WhatsApp number** for the session, not your personal one.
- Add a **300ms+ delay** between bulk checks (already built-in).
- The `auth_info/` folder stores your session — **back it up** and **never commit it to Git**.
- If you get logged out, delete `auth_info/` and restart to re-scan the QR.
