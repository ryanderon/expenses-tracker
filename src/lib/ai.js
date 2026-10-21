import { DEFAULT_MODEL, getModelInfo, modelsFor } from '@/lib/aiModels';

/**
 * Bring-your-own-key AI client, called straight from the browser.
 *
 * There's no backend to proxy through, so the user's keys live in local
 * storage and every request goes direct to the provider. All three send CORS
 * headers back: Google AI Studio and Groq always do, Anthropic only when it
 * sees the direct-browser-access header.
 *
 * Gemini and Groq are plain fetch + server-sent events. The Anthropic SDK is
 * imported lazily, so nobody on a free provider downloads it.
 */

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

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GROQ_BASE = 'https://api.groq.com/openai/v1';

/** Gemini's finish reasons for an answer it withheld. */
const GEMINI_BLOCKED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

/** Carries the HTTP status so `describeAiError` can map every provider alike. */
class AiError extends Error {
  constructor(status, message) {
    super(message || `AI request failed (${status})`);
    this.name = 'AiError';
    this.status = status;
  }
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (init.signal?.aborted) throw abortError();
    throw new AiError(0, err?.message);
  }
  if (res.ok) return res;

  const body = await res.json().catch(() => null);
  const error = Array.isArray(body) ? body[0]?.error : body?.error;
  const message = error?.message || res.statusText;
  // Gemini answers a bad key with a 400, not a 401.
  const badKey = res.status === 400 && /api key/i.test(message);
  throw new AiError(badKey ? 401 : res.status, message);
}

/** Yields each `data:` payload of a server-sent event stream as parsed JSON. */
async function* readEvents(res, signal) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        yield JSON.parse(data);
      }
    }
  } catch (err) {
    if (signal?.aborted) throw abortError();
    throw err;
  } finally {
    reader.releaseLock();
  }
}

async function streamGemini({ apiKey, model, maxTokens, messages, onText, signal }) {
  const res = await request(`${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    signal,
  });

  let text = '';
  let usage = null;
  let finish = null;
  for await (const event of readEvents(res, signal)) {
    if (event.promptFeedback?.blockReason) throw new Error('insights.errRefusal');
    const candidate = event.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.thought || !part.text) continue;
      text += part.text;
      onText?.(part.text);
    }
    if (candidate?.finishReason) finish = candidate.finishReason;
    if (event.usageMetadata) {
      const u = event.usageMetadata;
      usage = {
        input_tokens: u.promptTokenCount ?? 0,
        output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      };
    }
  }

  if (GEMINI_BLOCKED.has(finish)) throw new Error('insights.errRefusal');
  return { text, usage, stopReason: finish === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn' };
}

async function streamGroq({ apiKey, model, maxTokens, messages, onText, signal }) {
  const res = await request(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_completion_tokens: maxTokens,
      stream: true,
    }),
    signal,
  });

  let text = '';
  let usage = null;
  let finish = null;
  for await (const event of readEvents(res, signal)) {
    const choice = event.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) {
      text += delta;
      onText?.(delta);
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
    // Groq reports usage on the last chunk, under its own key.
    const u = event.x_groq?.usage || event.usage;
    if (u) usage = { input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 };
  }

  return { text, usage, stopReason: finish === 'length' ? 'max_tokens' : 'end_turn' };
}

async function createAnthropicClient(apiKey) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
    maxRetries: 1,
  });
}

/** Re-throws SDK errors as `AiError` so callers never need the SDK's classes. */
function fromAnthropicError(err, signal) {
  if (signal?.aborted) return abortError();
  if (err instanceof AiError || err?.message?.startsWith('insights.')) return err;
  return new AiError(err?.status ?? 0, err?.message);
}

async function streamAnthropic({ apiKey, model, maxTokens, effort, messages, onText, signal }) {
  const info = getModelInfo(model);
  const params = { model, max_tokens: maxTokens, system: SYSTEM_PROMPT, messages };

  // Haiku rejects both of these; only send them where they're supported.
  if (info.supportsThinking) params.thinking = { type: 'adaptive' };
  if (info.supportsEffort) params.output_config = { effort };

  try {
    const client = await createAnthropicClient(apiKey);
    const stream = client.messages.stream(params, { signal });
    stream.on('text', (delta) => onText?.(delta));
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') throw new Error('insights.errRefusal');

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { text, usage: message.usage, stopReason: message.stop_reason };
  } catch (err) {
    throw fromAnthropicError(err, signal);
  }
}

const STREAMERS = { google: streamGemini, groq: streamGroq, anthropic: streamAnthropic };

/**
 * Streams a completion from whichever provider serves `model`, invoking
 * `onText` with each delta. Returns the full text plus token usage as
 * `{ input_tokens, output_tokens }`.
 *
 * `messages` is `[{ role: 'user' | 'assistant', content: string }]`.
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
  return STREAMERS[info.provider]({
    apiKey, model: info.id, maxTokens: info.maxTokens, effort, messages, onText, signal,
  });
}

/**
 * Confirms a key works before the user relies on it. Gemini and Groq expose a
 * free model lookup, which also proves the model id is live; Anthropic has no
 * equivalent, so it gets a tiny real request.
 */
export async function verifyApiKey(provider, apiKey) {
  const model = modelsFor(provider)[0].id;

  if (provider === 'google') {
    await request(`${GEMINI_BASE}/models/${model}`, { headers: { 'x-goog-api-key': apiKey } });
  } else if (provider === 'groq') {
    await request(`${GROQ_BASE}/models/${model}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  } else {
    try {
      const client = await createAnthropicClient(apiKey);
      await client.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with just: OK' }],
      });
    } catch (err) {
      throw fromAnthropicError(err);
    }
  }
  return true;
}

/**
 * Maps errors to i18n keys. Returning a key rather than a sentence keeps this
 * module free of copy and lets the caller translate.
 */
export function describeAiError(err) {
  if (!err) return 'common.somethingWrong';
  if (err.name === 'AbortError') return 'insights.cancelled';
  if (err.message?.startsWith('insights.')) return err.message;
  if (!(err instanceof AiError)) return 'common.somethingWrong';

  switch (err.status) {
    case 0: return 'insights.errConnection';
    case 401: return 'insights.errAuth';
    case 403: return 'insights.errPermission';
    case 404: return 'insights.errNotFound';
    case 413: return 'insights.errTooLarge';
    case 429: return 'insights.errRateLimit';
    default: return 'common.somethingWrong';
  }
}
