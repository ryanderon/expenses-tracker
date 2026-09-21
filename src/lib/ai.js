import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, getModelInfo } from '@/lib/aiModels';

/**
 * Bring-your-own-key Claude client, called straight from the browser.
 *
 * There's no backend to proxy through, so the user's key lives in local
 * storage and every request goes direct to api.anthropic.com. That requires
 * both `dangerouslyAllowBrowser` and the direct-browser-access header, which
 * is what tells the API to send CORS headers back.
 */

function createClient(apiKey) {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
    maxRetries: 1,
  });
}

const SYSTEM_PROMPT = `You are a personal finance analyst built into Penny, a budgeting app used by an individual in Indonesia. All amounts are Indonesian Rupiah (IDR).

You are given a structured JSON snapshot of the user's finances: monthly income/expense totals, category and subcategory breakdowns, budget vs actual, account balances, and notable transactions. Everything you say must be grounded in that data.

How to respond:
- Lead with the answer or the single most important finding. Supporting detail comes after.
- Be specific and quantitative. Cite real numbers and category names from the snapshot, not generalities. "Dining Out rose from Rp 1.2jt to Rp 2.1jt (+75%)" beats "you spent more on food".
- Format IDR readably: Rp 1.250.000, or Rp 1,25jt for large round figures. Never invent precision the data doesn't have.
- Distinguish what the data shows from what you're inferring. If a conclusion needs data you weren't given, say so instead of guessing.
- Keep recommendations concrete and few: two or three actions tied to specific categories and amounts, not a generic checklist.
- Note when a period is incomplete — a partial month's totals are not comparable to a full one.
- Use short markdown: ## headings, **bold**, and - bullets. No tables unless the data is genuinely tabular. Keep the whole response tight.
- Reply in the same language the user writes in. If they write Indonesian, answer in Indonesian.

You are analysing, not lecturing. Skip moralising about spending choices.`;

/**
 * Streams a completion, invoking `onText` with each delta.
 * Returns the full text plus token usage.
 */
export async function streamAnalysis({
  apiKey,
  model = DEFAULT_MODEL,
  effort = 'high',
  messages,
  onText,
  signal,
}) {
  if (!apiKey) throw new Error('insights.errNoKey');

  const info = getModelInfo(model);
  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages,
  };

  // Haiku rejects both of these; only send them where they're supported.
  if (info.supportsThinking) params.thinking = { type: 'adaptive' };
  if (info.supportsEffort) params.output_config = { effort };

  const client = createClient(apiKey);
  const stream = client.messages.stream(params, { signal });

  stream.on('text', (delta) => onText?.(delta));

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error('insights.errRefusal');
  }

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return { text, usage: message.usage, stopReason: message.stop_reason };
}

/** Cheap round-trip to confirm a key works before the user relies on it. */
export async function verifyApiKey(apiKey, model = DEFAULT_MODEL) {
  const client = createClient(apiKey);
  await client.messages.create({
    model,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with just: OK' }],
  });
  return true;
}

/**
 * Maps SDK errors to i18n keys. Returning a key rather than a sentence keeps
 * this module free of copy and lets the caller translate.
 */
export function describeAiError(err) {
  if (!err) return 'common.somethingWrong';
  if (err.name === 'AbortError') return 'insights.cancelled';

  if (err instanceof Anthropic.AuthenticationError) return 'insights.errAuth';
  if (err instanceof Anthropic.PermissionDeniedError) return 'insights.errPermission';
  if (err instanceof Anthropic.NotFoundError) return 'insights.errNotFound';
  if (err instanceof Anthropic.RateLimitError) return 'insights.errRateLimit';
  if (err instanceof Anthropic.APIConnectionError) return 'insights.errConnection';
  if (err instanceof Anthropic.APIError) return 'common.somethingWrong';
  return 'common.somethingWrong';
}
