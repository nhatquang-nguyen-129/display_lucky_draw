import Button from "@/components/Button";

export default function Settings() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-medium text-base-100">Settings</h1>
        <p className="mt-1 text-sm text-base-400">Connect data sources and general preferences.</p>
      </header>

      <div className="max-w-xl rounded-xl border border-base-800 bg-base-900 p-6">
        <h2 className="font-display text-base font-medium text-base-100">Connect Google Sheets</h2>
        <p className="mt-1 text-sm text-base-400">
          Sync the participant list directly from Google Sheets. Requires signing in with Google once,
          after which you can refresh data anytime, even offline (using the last cached data).
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" disabled>
            Sign in with Google (coming soon)
          </Button>
        </div>
        <p className="mt-3 text-xs text-base-500">
          This is the next extension point — requires its own OAuth2 client id/secret and the Google Sheets API v4.
        </p>
      </div>
    </div>
  );
}
