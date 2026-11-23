# ⛽ Paytrol — AI-Powered Trip Fuel Cost Splitter (PWA)

> Snap your car's instrument cluster. Let Vision AI extract your trip distance and fuel economy. Verify in one tap, and split the bill with friends.

---

## 🚀 Connecting GitHub to Azure (Zero-Config 1-Click Deployment)

This application is ready to deploy directly to **Azure Static Web Apps** (or Azure App Service) with the included GitHub Actions workflow.

### Step 1: Push to your GitHub Repository
```bash
git add .
git commit -m "Initial commit of Paytrol PWA"
git branch -M main
git remote add origin https://github.com/<your-username>/paytrol.git
git push -u origin main
```

### Step 2: Connect Azure to your GitHub Repo
1. Go to the [Azure Portal](https://portal.azure.com/).
2. Click **Create a resource** → Search for **Static Web App** → Click **Create**.
3. Fill in:
   - **Subscription**: Your company Azure subscription (Free)
   - **Resource Group**: Select or create one (e.g., `rg-paytrol`)
   - **Name**: `paytrol`
   - **Plan type**: **Free**
   - **Deployment details**: Select **GitHub** and authorize.
   - **Repository**: Select your `paytrol` repository.
   - **Branch**: `main`
   - **Build Presets**: Select **Next.js**
     - App location: `/`
     - Api location: (leave blank)
     - Output location: (leave blank)
4. Click **Review + Create**.
   - Azure automatically adds a deployment token to your GitHub repository secrets and triggers `.github/workflows/azure-static-web-apps.yml`.
   - Your PWA will be live on an Azure URL (e.g. `https://salmon-island-...azurestaticapps.net`) in ~2 minutes!

### Step 3: Configure Environment Variables in Azure Portal
In your Azure Static Web App, navigate to **Configuration** → **Application settings** and add:
- `NEXTAUTH_SECRET`: Random 32+ character string
- `NEXTAUTH_URL`: Your Azure Static Web App domain (e.g. `https://<app>.azurestaticapps.net`)
- `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret
- `GEMINI_API_KEY`: Google AI Studio Gemini API key (Free tier: 15 req/min)
- `COSMOS_ENDPOINT`: Your Azure Cosmos DB endpoint (Optional - in-memory fallback included)
- `COSMOS_KEY`: Your Azure Cosmos DB key (Optional)
- `AZURE_STORAGE_CONNECTION_STRING`: Your Azure Blob Storage connection string (Optional)

---

## 🛠️ Local Development

```bash
# 1. Install dependencies
npm install

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
- **In-App Camera with Framing Guide**: Rectangular target to align trip distance and avg mileage. Also supports gallery upload.
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
- **Existing User**: Instant in-app notification + email invite with Accept / Decline.
- **New User**: Email with deep link; auto-links as friend upon first Google login.
- **3 Tab Views**: `Friends`, `Pending Sent`, and `Pending Received`.

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
