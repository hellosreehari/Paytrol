/**
 * Shown the moment a tab is tapped, while the next page's code loads. Without
 * it the old page stays on screen until the new one is ready, so a tap felt
 * ignored for a second or two.
 */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2 pt-1">
        <div className="h-6 w-28 rounded-md bg-surface-sunken" />
        <div className="h-3 w-48 rounded-md bg-surface-sunken" />
      </div>
      <div className="space-y-3">
        <div className="h-24 rounded-2xl bg-surface" />
        <div className="h-24 rounded-2xl bg-surface" />
        <div className="h-24 rounded-2xl bg-surface" />
      </div>
    </div>
  );
}
