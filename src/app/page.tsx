export default function Home(): React.ReactElement {
  const installUrl =
    process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL ?? '#';

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <div className="mb-8 inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
        🛡️ Free for public repos
      </div>

      <h1 className="text-5xl font-semibold tracking-tight">
        Catch security bugs <br />
        <span className="text-zinc-400">before they ship.</span>
      </h1>

      <p className="mt-6 text-lg leading-relaxed text-zinc-300">
        AI-powered security review on every pull request. Combines Semgrep
        with Claude to surface real, exploitable issues — without the false
        positive noise of enterprise SAST tools.
      </p>

      <div className="mt-10 flex gap-4">
        <a
          href={installUrl}
          className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Install on GitHub →
        </a>
        <a
          href="#how"
          className="rounded-lg border border-zinc-800 px-5 py-3 font-medium text-zinc-100 hover:bg-zinc-900"
        >
          How it works
        </a>
      </div>

      <section id="how" className="mt-24">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <ol className="mt-6 space-y-4 text-zinc-300">
          <li>
            <span className="text-zinc-500">1.</span> Install the GitHub App on
            any repo
          </li>
          <li>
            <span className="text-zinc-500">2.</span> Open a pull request — we
            scan changed files
          </li>
          <li>
            <span className="text-zinc-500">3.</span> Get a PR comment with
            real findings and suggested fixes
          </li>
        </ol>
      </section>

      <section className="mt-24">
        <h2 className="text-2xl font-semibold">What we catch</h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 text-sm text-zinc-300">
          <li className="rounded-lg border border-zinc-800 p-4">
            Hardcoded secrets and API keys
          </li>
          <li className="rounded-lg border border-zinc-800 p-4">
            Missing auth checks in API routes
          </li>
          <li className="rounded-lg border border-zinc-800 p-4">
            IDOR (insecure direct object reference)
          </li>
          <li className="rounded-lg border border-zinc-800 p-4">
            SSRF and open redirects
          </li>
          <li className="rounded-lg border border-zinc-800 p-4">
            SQL injection in raw queries
          </li>
          <li className="rounded-lg border border-zinc-800 p-4">
            Misconfigured CORS and cookies
          </li>
        </ul>
      </section>

      <section className="mt-24">
        <h2 className="text-2xl font-semibold">Pricing</h2>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-800 p-6">
            <div className="text-sm text-zinc-500">Free</div>
            <div className="mt-1 text-2xl font-semibold">$0</div>
            <div className="mt-4 text-sm text-zinc-400">Public repositories</div>
          </div>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-6">
            <div className="text-sm text-zinc-500">Pro</div>
            <div className="mt-1 text-2xl font-semibold">$19 / repo / mo</div>
            <div className="mt-4 text-sm text-zinc-400">Private repositories</div>
          </div>
        </div>
      </section>

      <footer className="mt-24 border-t border-zinc-900 pt-8 text-sm text-zinc-500">
        Built by an indie hacker, for indie hackers.
      </footer>
    </main>
  );
}
