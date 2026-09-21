/**
 * The model list, kept apart from `lib/ai.js` because that module pulls in the
 * Anthropic SDK. The store needs to know which model ids are valid; it must not
 * drag ~165 kB of SDK into the main bundle to find out.
 *
 * Haiku first, and the default: the snapshot handed to the model is a page of
 * pre-aggregated numbers, so the work is summarising and comparing, not
 * reasoning through anything hard. Sonnet is there for when a question needs
 * more than that.
 */
export const AI_MODELS = [
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    hintKey: 'settings.modelHaiku',
    supportsThinking: false,
    supportsEffort: false,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    hintKey: 'settings.modelSonnet',
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
