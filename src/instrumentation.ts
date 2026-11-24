/**
 * Runs once when a server instance starts. We use it to open the database
 * connection and the Blob Storage container in the background, so the first user
 * request after a cold start (common on Azure App Service, which unloads idle
 * apps) doesn't have to wait for that setup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Not awaited on purpose: the server can start answering requests while
  // this finishes, and requests that need it share the same promises.
  void (async () => {
    try {
      const [{ pingDatabase }, { warmUpBlobStorage }] = await Promise.all([
        import('@/lib/db'),
        import('@/lib/blob-storage'),
      ]);
      // pingDatabase opens the MongoDB connection pool (a no-op without one).
      await Promise.all([pingDatabase(), warmUpBlobStorage()]);
    } catch (error) {
      console.warn('[startup] Storage warm-up failed; it will be retried on first use.', error);
    }
  })();
}
