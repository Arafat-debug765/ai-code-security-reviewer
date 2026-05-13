import Link from 'next/link';

/**
 * Dashboard placeholder.
 *
 * Weekend 3 work (replace this):
 *   - Real auth (NextAuth.js with GitHub provider)
 *   - Pull the signed-in user's installations and recent scans from Prisma
 *   - Show usage/quota and let them toggle which detectors are active
 *
 * Weekend 1 addition: link to the local review tool.
 */

export default function Dashboard(): React.ReactElement {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-4 text-zinc-400">
        Coming in Weekend 3 with GitHub auth and live scan history.
      </p>

      <section className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="text-lg font-medium">Local tooling</h2>
        <p className="mt-2 text-sm text-zinc-400">
          While you're iterating on the scanner, use the review tool to
          evaluate findings and build your dataset.
        </p>
        <Link
          href="/review"
          className="mt-4 inline-block rounded bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Open review tool →
        </Link>
      </section>
    </main>
  );
}
