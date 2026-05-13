/**
 * Dashboard placeholder.
 *
 * Weekend 3 work:
 *   - Replace this with real auth (NextAuth.js with GitHub provider)
 *   - Pull the signed-in user's installations and recent scans from Prisma
 *   - Show usage/quota and let them toggle which detectors are active
 */

export default function Dashboard(): React.ReactElement {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-4 text-zinc-400">
        Coming in Weekend 3. For now, install the GitHub App and open a PR —
        we'll comment automatically.
      </p>
    </main>
  );
}
