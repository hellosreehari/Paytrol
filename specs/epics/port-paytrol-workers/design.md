# port-paytrol-workers — design

## 1. The Resource & Runtime Model

Paytrol is deployed as a single Cloudflare Worker component (`paytrol-web`) with two environments (`stage` and `prod`).

- **Application:** Next.js 16.4.6 with App Router.
- **Adapter:** `@opennextjs/cloudflare` v1.20.18 using standalone Next.js build output.
- **Cache Strategy:** Static assets incremental cache without external KV requirements initially.
- **Cron Jobs:** `vercel.json` cron (`0 3 * * *` targeting `/api/retention/cleanup`) is adapted to Cloudflare Cron Triggers via a custom Worker entry (`worker.ts` + `lib/cron/schedule.ts`).

## 2. External Services & Backends

All external data layers stay hosted externally; no database migration is required:

1. **Azure Cosmos DB:** Accessed via `@azure/cosmos` HTTP client. Fallback to in-memory store if unset in development or preview.
2. **Azure Blob Storage:** Accessed via `@azure/storage-blob`. Fallback to base64 Data URLs if unset in development or preview.
3. **Google Gemini API:** Accessed via `@google/generative-ai` REST client. Fallback mock data returned when unset.
4. **NextAuth:** Configured with Google OAuth and demo credentials fallback for non-production environments.

## 3. Secrets & Configuration

### Brokered / Infrastructure Secrets
- `CLOUDFLARE_API_TOKEN`: Brokered via Cloudflare integration (`workers-deploy` template).
- `CLOUDFLARE_ACCOUNT_ID`: Brokered via Cloudflare integration (`account-id` template).

### Application Secrets (Project Rung)
- `NEXTAUTH_SECRET`: Generated 32-byte secret for JWT signing and session management.
- `CRON_SECRET`: Generated token for authenticating retention cleanup invocations.

### Optional External Credential Tails
- `AZURE_STORAGE_CONNECTION_STRING`
- `COSMOS_ENDPOINT`
- `COSMOS_KEY`
- `COSMOS_DATABASE`
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_URL`

## 4. Out of Scope

- Moving Azure Cosmos DB data into Supabase or Cloudflare D1 (app retains its Azure architecture).
- Storing blobs in Cloudflare R2 (Azure Blob Storage is preserved).
