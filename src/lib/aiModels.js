/**
 * The provider and model lists, kept apart from `lib/ai.js` because that module
 * pulls in the Anthropic SDK. The store needs to know which model ids are
 * valid; it must not drag ~165 kB of SDK into the main bundle to find out.
 *
 * Google AI Studio and Groq come first because both have a free tier: a key
 * costs nothing, which is the difference between someone trying AI insights
 * and not. The snapshot handed to the model is a page of pre-aggregated
 * numbers, so a fast free model handles it fine; Claude is there for anyone
 * who wants to pay for more.
 */
export const AI_PROVIDERS = [
  {
    id: 'google',
    label: 'Google AI Studio (Gemini)',
    free: true,
    keyPlaceholder: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyLabelKey: 'settings.keyGoogle',
    getKeyKey: 'settings.getKeyGoogle',
  },
  {
    id: 'groq',
    label: 'Groq (GPT-OSS)',
    free: true,
    keyPlaceholder: 'gsk_...',
    keyUrl: 'https://console.groq.com/keys',
    keyLabelKey: 'settings.keyGroq',
    getKeyKey: 'settings.getKeyGroq',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    free: false,
    keyPlaceholder: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyLabelKey: 'settings.keyAnthropic',
    getKeyKey: 'settings.getKeyAnthropic',
  },
];

/**
 * `maxTokens` is the output cap. Groq's free tier counts it against the
 * per-minute token budget before the request runs, so it stays small there or
 * a single question can trip the limit on its own.
 *
 * `shortLabel` fits the model chip in the chat composer on a phone.
 *
 * Claude streams, so `maxTokens` there is generous: adaptive thinking spends
 * from the same budget as the reply, and only what's generated is billed.
 *
 * `maxTransactions` caps how many raw transaction rows ride along with the
 * snapshot (about 20 tokens each). Same reason: Groq's free tier can't take a
 * busy month in one request, the others can.
 */
export const AI_MODELS = [
  {
    id: 'gemini-3.8-flash',
    provider: 'google',
    label: 'Gemini 3.8 Flash',
    shortLabel: 'Gemini Flash',
    hintKey: 'settings.modelGeminiFlash',
    maxTokens: 8192,
    maxTransactions: 600,
  },
  {
    // Newest generation, and the only Gemini 4 model on the free tier
    // (Carbon and Argon are paid only).
    id: 'gemini-4-hydrogen',
    provider: 'google',
    label: 'Gemini 4 Hydrogen',
    shortLabel: 'Gemini 4',
    hintKey: 'settings.modelGemini4',
    maxTokens: 8192,
    maxTransactions: 600,
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'google',
    label: 'Gemini 3.5 Flash-Lite',
    shortLabel: 'Flash-Lite',
    hintKey: 'settings.modelGeminiLite',
    maxTokens: 8192,
    maxTransactions: 400,
  },
  // Groq shut its Llama models down for free and developer accounts on
  // 16 Aug 2026; these are its recommended replacements. They reason before
  // answering, and that reasoning counts against `maxTokens`, so the 20B
  // gets the same cap as the 120B instead of the old 2048.
  {
    id: 'openai/gpt-oss-120b',
    provider: 'groq',
    label: 'GPT-OSS 120B',
    shortLabel: 'GPT-OSS 120B',
    hintKey: 'settings.modelGptOss120',
    maxTokens: 4096,
    maxTransactions: 100,
  },
  {
    id: 'openai/gpt-oss-20b',
    provider: 'groq',
    label: 'GPT-OSS 20B',
    shortLabel: 'GPT-OSS 20B',
    hintKey: 'settings.modelGptOss20',
    maxTokens: 4096,
    maxTransactions: 30,
  },
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    label: 'Claude Haiku 5.5',
    shortLabel: 'Haiku 5.5',
    hintKey: 'settings.modelHaiku',
    maxTokens: 64000,
    maxTransactions: 600,
    supportsThinking: true,
    supportsEffort: true,
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5.5',
    shortLabel: 'Sonnet 5.5',
    hintKey: 'settings.modelSonnet',
    maxTokens: 64000,
    maxTransactions: 600,
    supportsThinking: true,
    supportsEffort: true,
    // On a safety decline the API retries on Claude Sonnet 5 within the same
    // request. Haiku 5.5 has no server-side fallback, so it doesn't get this.
    serverFallback: true,
  },
];

export const DEFAULT_MODEL = AI_MODELS[0].id;

/** Ids retired from the list, and what a saved setting moves to. */
export const RETIRED_MODELS = {
  'claude-haiku-4-5': 'claude-haiku-5-5',
  'claude-sonnet-5': 'claude-sonnet-5-5',
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
};

/**
 * Reasoning effort for Claude when the user hasn't picked one. Medium is
 * thorough enough for adding up a month of transactions without the wait
 * and token spend of high.
 */
export const DEFAULT_EFFORT = 'medium';

export const EFFORT_LEVELS = [
  { id: 'low', labelKey: 'settings.effortLow' },
  { id: 'medium', labelKey: 'settings.effortMedium' },
  { id: 'high', labelKey: 'settings.effortHigh' },
];

export function getModelInfo(modelId) {
  return AI_MODELS.find((m) => m.id === modelId) || AI_MODELS[0];
}

export function getProviderInfo(providerId) {
  return AI_PROVIDERS.find((p) => p.id === providerId) || AI_PROVIDERS[0];
}

export function modelsFor(providerId) {
  return AI_MODELS.filter((m) => m.provider === providerId);
}

/** The key that unlocks `modelId`, or '' when its provider has none saved. */
export function keyForModel(aiSettings, modelId) {
  return aiSettings?.apiKeys?.[getModelInfo(modelId).provider] || '';
}
