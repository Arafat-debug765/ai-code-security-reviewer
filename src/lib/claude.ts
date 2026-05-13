import Anthropic from '@anthropic-ai/sdk';
import {
  SECURITY_REVIEW_SYSTEM_PROMPT,
  buildFindingPrompt,
} from '@/prompts/security-review';
import type { SemgrepFinding, ReviewedFinding } from '@/types';

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.',
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Run a single Semgrep finding through Claude to confirm/reject and get
 * a human-readable explanation plus suggested fix.
 *
 * Returns the reviewed finding and the token usage for cost tracking.
 */
export async function reviewFinding(
  finding: SemgrepFinding,
  surroundingContext?: string,
): Promise<{
  reviewed: ReviewedFinding;
  usage: { input: number; output: number };
}> {
  const client = getClient();

  const userMessage = buildFindingPrompt({
    ruleId: finding.ruleId,
    ruleMessage: finding.message,
    filePath: finding.filePath,
    startLine: finding.startLine,
    endLine: finding.endLine,
    codeSnippet: finding.codeSnippet,
    surroundingContext,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SECURITY_REVIEW_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text response');
  }

  const parsed = parseLLMResponse(textBlock.text);

  return {
    reviewed: {
      ...finding,
      confirmed: parsed.confirmed,
      confidence: parsed.confidence,
      llmExplanation: parsed.explanation,
      suggestedFix: parsed.suggestedFix || undefined,
    },
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

interface ParsedResponse {
  confirmed: boolean;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  suggestedFix: string;
}

/**
 * Parse Claude's JSON response. We're lenient: if the model wraps it in
 * markdown fences despite instructions, we strip them.
 */
function parseLLMResponse(raw: string): ParsedResponse {
  let cleaned = raw.trim();
  // Strip ```json ... ``` fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  try {
    const parsed = JSON.parse(cleaned);
    return {
      confirmed: Boolean(parsed.confirmed),
      confidence: (['high', 'medium', 'low'] as const).includes(parsed.confidence)
        ? parsed.confidence
        : 'low',
      explanation: String(parsed.explanation ?? ''),
      suggestedFix: String(parsed.suggestedFix ?? ''),
    };
  } catch (err) {
    // If parsing fails, treat as low-confidence unconfirmed finding rather
    // than crashing the whole scan. Log so we can iterate on the prompt.
    console.error('Failed to parse LLM response:', raw.slice(0, 200));
    return {
      confirmed: false,
      confidence: 'low',
      explanation: 'LLM response parsing failed; finding suppressed.',
      suggestedFix: '',
    };
  }
}
