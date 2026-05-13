import { NextRequest, NextResponse } from 'next/server';
import { Webhooks } from '@octokit/webhooks';
import { prisma } from '@/lib/db';
import { getInstallationOctokit, postScanComment } from '@/lib/github';
import { scan } from '@/lib/scanner';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

/**
 * GitHub webhook receiver.
 *
 * Weekend 2 deliverable. This handler:
 *   1. Verifies the webhook signature
 *   2. Handles `installation.created` and `pull_request.opened|synchronize`
 *   3. For PRs: clones the repo at the head sha, scans changed files,
 *      posts a comment
 *
 * Production note: scanning inside an HTTP handler is fine for an MVP
 * but you'll want to move this to a background queue (e.g. Upstash QStash,
 * Inngest, or a Vercel Cron + DB queue) once you have >1 scan/minute.
 */

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel: max 5min on Pro plan; longer scans need a queue.

const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

const webhooks = webhookSecret ? new Webhooks({ secret: webhookSecret }) : null;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!webhooks) {
    return NextResponse.json(
      { error: 'GITHUB_APP_WEBHOOK_SECRET not configured' },
      { status: 500 },
    );
  }

  const signature = req.headers.get('x-hub-signature-256');
  const event = req.headers.get('x-github-event');
  const deliveryId = req.headers.get('x-github-delivery');
  if (!signature || !event || !deliveryId) {
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 });
  }

  const body = await req.text();
  const verified = await webhooks.verify(body, signature);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  try {
    if (event === 'installation' && payload.action === 'created') {
      await handleInstallationCreated(payload);
    } else if (
      event === 'pull_request' &&
      (payload.action === 'opened' || payload.action === 'synchronize')
    ) {
      // Don't await — return 200 fast so GitHub doesn't time us out.
      // Errors are logged in handlePullRequest.
      handlePullRequest(payload).catch((err) =>
        console.error('PR scan failed:', err),
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleInstallationCreated(payload: any): Promise<void> {
  const installation = payload.installation;
  await prisma.installation.upsert({
    where: { id: installation.id },
    create: {
      id: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
    },
    update: {
      accountLogin: installation.account.login,
      accountType: installation.account.type,
    },
  });

  // Add the repos selected during install.
  for (const repo of payload.repositories ?? []) {
    await prisma.repo.upsert({
      where: { githubId: BigInt(repo.id) },
      create: {
        githubId: BigInt(repo.id),
        fullName: repo.full_name,
        isPrivate: repo.private,
        installationId: installation.id,
      },
      update: { fullName: repo.full_name, isPrivate: repo.private },
    });
  }
}

async function handlePullRequest(payload: any): Promise<void> {
  const installationId: number = payload.installation.id;
  const owner: string = payload.repository.owner.login;
  const repo: string = payload.repository.name;
  const prNumber: number = payload.pull_request.number;
  const headSha: string = payload.pull_request.head.sha;

  // Track the scan in the DB so we can enforce quotas later.
  const repoRecord = await prisma.repo.findUnique({
    where: { githubId: BigInt(payload.repository.id) },
  });
  if (!repoRecord) {
    console.warn(`Repo ${owner}/${repo} not registered; ignoring PR ${prNumber}`);
    return;
  }

  const scanRecord = await prisma.scan.create({
    data: {
      repoId: repoRecord.id,
      prNumber,
      commitSha: headSha,
      status: 'running',
    },
  });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aicsr-'));
  try {
    const octokit = await getInstallationOctokit(installationId);

    // 1. Fetch the list of files changed in the PR.
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 300,
    });
    const changedPaths = files
      .filter((f) => f.status !== 'removed')
      .map((f) => f.filename);

    // 2. Shallow-clone the head commit. For MVP we use git CLI; for
    //    higher volume you'd switch to GitHub's contents API or a
    //    persistent cache of repo state.
    const cloneUrl = `https://x-access-token:${await getInstallationToken(installationId)}@github.com/${owner}/${repo}.git`;
    await runGit(['clone', '--depth', '1', '--quiet', cloneUrl, tmpDir]);
    await runGit(['-C', tmpDir, 'fetch', '--depth', '1', 'origin', headSha]);
    await runGit(['-C', tmpDir, 'checkout', '--quiet', headSha]);

    // 3. Scan only the changed files.
    const absoluteChangedPaths = changedPaths.map((p) => path.join(tmpDir, p));
    const result = await scan({
      target: tmpDir,
      changedFiles: absoluteChangedPaths,
    });

    // 4. Persist findings.
    await prisma.scan.update({
      where: { id: scanRecord.id },
      data: {
        status: 'complete',
        completedAt: new Date(),
        semgrepFindings: result.stats.semgrepFindings,
        confirmedFindings: result.stats.confirmedFindings,
        falsePositives: result.stats.falsePositives,
        durationMs: result.stats.durationMs,
        inputTokens: result.stats.tokensUsed.input,
        outputTokens: result.stats.tokensUsed.output,
        findings: {
          create: result.findings.map((f) => ({
            ruleId: f.ruleId,
            category: f.category,
            severity: f.severity,
            filePath: f.filePath.replace(tmpDir + path.sep, ''),
            startLine: f.startLine,
            endLine: f.endLine,
            confirmed: f.confirmed,
            confidence: f.confidence,
            explanation: f.llmExplanation,
            suggestedFix: f.suggestedFix,
          })),
        },
      },
    });

    // 5. Post the PR comment.
    await postScanComment({
      installationId,
      owner,
      repo,
      prNumber,
      result,
    });
  } catch (err) {
    await prisma.scan.update({
      where: { id: scanRecord.id },
      data: {
        status: 'failed',
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      },
    });
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function getInstallationToken(installationId: number): Promise<string> {
  // Octokit caches and refreshes this internally; we just need the raw
  // token string for the git clone URL.
  const octokit = await getInstallationOctokit(installationId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = await (octokit as any).auth();
  return auth.token;
}

function runGit(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (c) => (stderr += c.toString()));
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`git ${args[0]} failed: ${stderr}`)),
    );
    proc.on('error', reject);
  });
}
