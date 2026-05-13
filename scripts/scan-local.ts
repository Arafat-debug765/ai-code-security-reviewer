#!/usr/bin/env tsx
/**
 * Local CLI scanner. This is the Weekend 1 deliverable.
 *
 * Usage:
 *   pnpm scan ./path/to/repo
 *   pnpm scan ./path/to/repo --json > results.json
 *   pnpm scan ./path/to/repo --bench         # show timing + cost breakdown
 *
 * No GitHub App or database is required. You only need:
 *   - ANTHROPIC_API_KEY in .env
 *   - semgrep installed (`pipx install semgrep`)
 *
 * Use this against real OSS repos until your false-positive rate is below
 * ~20%. Iterate on src/prompts/security-review.ts and on the Semgrep
 * rules in semgrep-rules/ based on what you find.
 */

import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scan } from '../src/lib/scanner';
// import { renderComment } from '../src/lib/github';
import { renderComment } from '../src/lib/comment-renderer';

// Pricing for claude-sonnet-4-5 in USD per million tokens.
// Update if you switch models. See https://docs.claude.com/en/docs/about-claude/pricing
const PRICE_INPUT_PER_MTOK = 3;
const PRICE_OUTPUT_PER_MTOK = 15;

interface CliFlags {
  target: string;
  json: boolean;
  bench: boolean;
  preview: boolean;
}

function parseArgs(argv: string[]): CliFlags {
  const args = argv.slice(2);
  const flags: CliFlags = {
    target: '',
    json: false,
    bench: false,
    preview: false,
  };
  for (const a of args) {
    if (a === '--json') flags.json = true;
    else if (a === '--bench') flags.bench = true;
    else if (a === '--preview') flags.preview = true;
    else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else if (!flags.target) flags.target = a;
  }
  if (!flags.target) {
    printHelp();
    process.exit(1);
  }
  return flags;
}

function printHelp(): void {
  console.log(`AI Code Security Reviewer — local CLI

Usage:
  pnpm scan <path>              Run full scan, pretty-print results
  pnpm scan <path> --json       Output raw JSON to stdout
  pnpm scan <path> --bench      Print timing and estimated cost
  pnpm scan <path> --preview    Render the comment as it would appear on GitHub`);
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv);
  const target = path.resolve(flags.target);

  try {
    await fs.access(target);
  } catch {
    console.error(`Target does not exist: ${target}`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
    process.exit(1);
  }

  if (!flags.json) {
    console.error(`Scanning ${target}...`);
  }

  const result = await scan({ target });

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  if (flags.preview) {
    console.log(renderComment(result));
    return;
  }

  printHumanReadable(result, flags.bench);
}

function printHumanReadable(
  result: Awaited<ReturnType<typeof scan>>,
  bench: boolean,
): void {
  const { findings, stats } = result;
  console.log('');
  console.log(`Findings: ${findings.length} confirmed, ${stats.falsePositives} suppressed`);
  console.log(`Semgrep candidates: ${stats.semgrepFindings}`);
  console.log('');

  for (const f of findings) {
    const emoji =
      ({
        critical: '🚨',
        high: '⚠️ ',
        medium: '🔶',
        low: '🔹',
        info: 'ℹ️ ',
      } as Record<string, string>)[f.severity] ?? '🔹';
    console.log(`${emoji} [${f.severity.toUpperCase()}] ${f.filePath}:${f.startLine}`);
    console.log(`   Rule: ${f.ruleId}`);
    console.log(`   ${f.llmExplanation}`);
    if (f.suggestedFix) {
      console.log(`   Suggested fix:\n${indent(f.suggestedFix, 6)}`);
    }
    console.log('');
  }

  if (bench) {
    const costIn = (stats.tokensUsed.input / 1_000_000) * PRICE_INPUT_PER_MTOK;
    const costOut = (stats.tokensUsed.output / 1_000_000) * PRICE_OUTPUT_PER_MTOK;
    const total = costIn + costOut;
    console.log('--- Bench ---');
    console.log(`Duration: ${(stats.durationMs / 1000).toFixed(2)}s`);
    console.log(`Tokens: ${stats.tokensUsed.input} in / ${stats.tokensUsed.output} out`);
    console.log(`Est. cost: $${total.toFixed(4)} (in: $${costIn.toFixed(4)}, out: $${costOut.toFixed(4)})`);
  }
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

main().catch((err) => {
  console.error('Scan failed:', err);
  process.exit(1);
});
