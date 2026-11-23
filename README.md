# ⛽ Paytrol — AI-Powered Trip Fuel Cost Splitter (PWA)

> Snap your car's instrument cluster. Let Vision AI extract your trip distance and fuel economy. Verify in one tap, and split the bill with friends.

---

## 🚀 Deployment (Azure App Service)

Paytrol runs on **Azure App Service (Linux, Node 24)** and deploys from GitHub Actions:

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | every pull request | lint, typecheck, tests, build |
| `main_paytrol.yml` | push to `main` | the same checks, then deploys the standalone Next.js bundle and calls `/api/health` |
| `photo-cleanup.yml` | daily, 03:00 IST | deletes dashboard photos older than 7 days |

### App settings (App Service → Settings → Environment variables)

| Setting | Required | Notes |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | yes | random 32+ characters |
| `NEXTAUTH_URL` | yes | e.g. `https://paytrol.azurewebsites.net` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client |
| `GEMINI_API_KEY` | yes | Google AI Studio key; optional `GEMINI_MODEL` (default `gemini-2.5-flash`) |
| `AZURE_COSMOS_CONNECTIONSTRING` (or `COSMOS_ENDPOINT` + `COSMOS_KEY`) | yes | Cosmos DB for NoSQL, key-based NoSQL connection string or a `mongodb://` one (Cosmos DB for MongoDB); database `COSMOS_DATABASE` (default `paytrol`) is created automatically |
| `AZURE_STORAGE_CONNECTION_STRING` | recommended | photos go to the private `dashboard-photos` container; without it photos are stored inside trips |
| `CRON_SECRET` | recommended | protects `/api/retention/cleanup` |

The connection string can live in either the **App settings** or the **Connection strings** tab (type DocDb or Custom); it can be either a Cosmos DB for NoSQL string (`AccountEndpoint=...;AccountKey=...`) or a Cosmos DB for MongoDB string (`mongodb://...`). Both use the database `COSMOS_DATABASE` (default `paytrol`). If a deploy fails its health check, `/api/health` names the exact problem.

Without the Cosmos settings the app refuses to save data in production rather than silently keeping it in memory
(set `ALLOW_MEMORY_STORE=true` only for a throwaway demo).

Use **Node 24 LTS** as the App Service runtime stack. The deploy sets the startup command to `node server.js`.

### Where the data lives
- **Trips, balances, friends, users, settlements:** Azure Portal → Cosmos DB account → **Data Explorer** → database `paytrol`.
- **Dashboard photos:** Storage account → Containers → `dashboard-photos` (private; the app hands out 1-hour signed links).
- **Is everything connected?** Open `https://<your-app>/api/health`. It shows which services are live without exposing secrets.

### Photo cleanup schedule
In GitHub → Settings → Secrets and variables → Actions, add the secret `CRON_SECRET` (same value as the app setting)
and the variable `PAYTROL_URL` (e.g. `https://paytrol.azurewebsites.net`).

---

## 🛠️ Local Development

```bash
# 1. Install dependencies
npm ci

# Copy .env.example to .env.local and fill in the Google + NextAuth values

# 2. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🌟 Core Features & User Flows

### 1. Authentication & Profile Setup
- **Google Sign-In**: 1-tap OAuth login (captures name, email, profile photo).
- **Vehicle & Fuel Defaults**: Set default fuel type (**Petrol**, **Diesel**, **CNG**), currency (**INR ₹**), and last-paid fuel price per liter.

### 2. Capture, AI Extraction & Verification
- **One-tap scan**: opens the phone's own picker to take a photo or choose one from the gallery, then shows a preview to confirm or retake.
- **Gemini Vision Extraction**: Vision-capable AI specifically extracts trip distance (under *"Since start"*) and average fuel economy while ignoring total odometer (e.g. 66639 km) and range.
- **Mandatory Verification Gate**:
  - Cropped photo preview at top with expand/collapse toggle.
  - Pre-filled editable numeric fields: Distance (km), Avg Mileage (km/L), Fuel Price (₹/L).
  - Yellow highlight banner if AI confidence is low due to glare or blur.
  - Real-time math:
    $$\text{Fuel Used (L)} = \frac{\text{Distance (km)}}{\text{Average Mileage (km/L)}}$$
    $$\text{Total Cost} = \text{Fuel Used (L)} \times \text{Fuel Price per Liter}$$
    *(For 6 km at 5.8 km/L and ₹105/L: $6 \div 5.8 = 1.034\text{ L}$, totaling ₹108.62.)*

### 3. Friends Network & Email Invites
- **Invite Friends**: Enter friend's email address.
- **Existing User**: sees the request in the app with Accept / Decline. (No email is sent.)
- **New User**: the invite links automatically on their first Google sign-in with that email.
- **Mutual invites** merge into one friendship.
- One page: requests for you, your friends, invites you sent, and guests.

### 4. Trip Splitting & Ledger
- Checkboxes for friends who joined + **"Include me in the split"** toggle.
- **Split Modes**: **Equal Split** (default) or **Custom Percentage %**.
- Trip card with attached photo proof, formula breakdown, and individual shares.

### 5. Balances & 1-Tap UPI Settlement
- Aggregates net balances across all trips (e.g., *"Rahul owes you ₹420"*).
- **Mark as Settled** action.
- **Pay via UPI** deep link (`upi://pay?pa=...&am=...`) for instant settlement via Google Pay, PhonePe, or Paytm on mobile.

### 6. PWA & Add to Homescreen
- Fully installable Progressive Web App with service worker, `manifest.json`, and native Add to Homescreen prompts for Android & iOS Safari.
