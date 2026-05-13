import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';
import type { ScanResult } from '@/types';
import { renderComment } from './comment-renderer';

export { renderComment };

/**
 * GitHub App client. Used to authenticate as an installation and post
 * PR comments. Lazily instantiated so missing env vars don't crash
 * the CLI workflow (which doesn't need GitHub credentials).
 */

let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!appId || !privateKey) {
    throw new Error(
      'GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set to use GitHub features.',
    );
  }
  _app = new App({ appId, privateKey });
  return _app;
}

/**
 * Get an Octokit client authenticated as a specific installation.
 */
export async function getInstallationOctokit(
  installationId: number,
): Promise<Octokit> {
  const app = getApp();
  return (await app.getInstallationOctokit(installationId)) as unknown as Octokit;
}

/**
 * Post the scan result as a single PR comment, with collapsible
 * sections per finding. Keeps the PR review feed clean.
 */
export async function postScanComment(args: {
  installationId: number;
  owner: string;
  repo: string;
  prNumber: number;
  result: ScanResult;
}): Promise<void> {
  const octokit = await getInstallationOctokit(args.installationId);
  const body = renderComment(args.result);

  await octokit.issues.createComment({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.prNumber,
    body,
  });
}

/**
 * Format the scan result as a markdown comment.
 *
 * The goal is to be useful, not noisy:
 *  - If no findings: short positive ack so the dev knows we ran.
 *  - If findings: one collapsible section per finding, severity emoji,
 *    suggested fix as a fenced code block.
 */




function severityEmoji(s: string): string {
  return (
    {
      critical: '🚨',
      high: '⚠️',
      medium: '🔶',
      low: '🔹',
      info: 'ℹ️',
    } as Record<string, string>
  )[s] ?? '🔹';
}
