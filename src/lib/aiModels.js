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
    label: 'Groq (Llama)',
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
 */
export const AI_MODELS = [
  {
    id: 'gemini-3.8-flash',
    provider: 'google',
    label: 'Gemini 3.8 Flash',
    hintKey: 'settings.modelGeminiFlash',
    maxTokens: 8192,
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'google',
    label: 'Gemini 3.5 Flash-Lite',
    hintKey: 'settings.modelGeminiLite',
    maxTokens: 8192,
  },
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    label: 'Llama 3.3 70B',
    hintKey: 'settings.modelLlama70',
    maxTokens: 4096,
  },
  {
    id: 'llama-3.1-8b-instant',
    provider: 'groq',
    label: 'Llama 3.1 8B',
    hintKey: 'settings.modelLlama8',
    maxTokens: 2048,
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    hintKey: 'settings.modelHaiku',
    maxTokens: 16000,
    supportsThinking: false,
    supportsEffort: false,
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5',
    hintKey: 'settings.modelSonnet',
    maxTokens: 16000,
    supportsThinking: true,
    supportsEffort: true,
  },
];

export const DEFAULT_MODEL = AI_MODELS[0].id;

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
