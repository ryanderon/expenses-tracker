import { create } from 'zustand';
import useStore from '@/store/useStore';
import { streamAnalysis, describeAiError } from '@/lib/ai';
import { DEFAULT_EFFORT, getModelInfo, keyForModel } from '@/lib/aiModels';
import { buildFinancialSnapshot, buildContextMessage } from '@/lib/aiContext';
import { generateId } from '@/lib/utils';
import { translate, categoryLabel, subcategoryLabel } from '@/lib/i18n';

/**
 * The AI chat on the Insights page.
 *
 * Lives outside the persisted store on purpose: a thread should survive
 * hopping to Transactions to check something and coming back, but it holds
 * the whole financial snapshot, which has no business being written to
 * IndexedDB or synced to Drive. A reload starts fresh.
 *
 * The request runs here rather than in the page, so an answer keeps streaming
 * in while the user is on another page, and Stop still works when they return.
 *
 * Each exchange is one question plus its answer:
 *   { id, question, apiContent, answer, blocks, status, error, model, usage, truncated }
 * `status` is pending → thinking → streaming → done, or stopped / error.
 * `blocks` is a finished Claude reply's content, thinking included, which goes
 * back verbatim on the next Claude request; other providers get `answer`.
 */

const ACTIVE = new Set(['pending', 'thinking', 'streaming']);

export const isActive = (exchange) => ACTIVE.has(exchange?.status);

let controller = null;

function defaultScope() {
  return { type: 'month', monthKey: null, year: String(new Date().getFullYear()) };
}

const useChatStore = create((set, get) => {
  const patch = (id, update) =>
    set((s) => ({
      exchanges: s.exchanges.map((e) =>
        e.id === id ? { ...e, ...(typeof update === 'function' ? update(e) : update) } : e
      ),
    }));

  /** Streams an answer into an exchange that's already in the list. */
  async function run(id) {
    const { exchanges, scope } = get();
    const index = exchanges.findIndex((e) => e.id === id);
    if (index < 0) return;

    const state = useStore.getState();
    const { aiSettings } = state;
    const t = (key, vars) => translate(state.locale, key, vars);
    const model = aiSettings.model;
    const info = getModelInfo(model);

    // Only answered turns go back to the model: a failed or empty one would
    // leave two user messages in a row, or an empty assistant message, and a
    // failed one's partial text is no answer at all.
    const prior = exchanges.slice(0, index).filter(
      (e) => e.answer && e.apiContent && (e.status === 'done' || e.status === 'stopped')
    );

    // The snapshot rides with the first question that gets through. Later
    // turns already have it in context; resending would double the bill.
    const question = exchanges[index].question;
    const apiContent = prior.length === 0
      ? buildContextMessage(
          buildFinancialSnapshot(state, {
            scope: scope.type,
            monthKey: scope.monthKey || undefined,
            year: scope.year,
            maxTransactions: info.maxTransactions,
            // The same category names the screens show, in the user's language.
            names: {
              category: (cat) => categoryLabel(cat, t),
              subcategory: (name) => subcategoryLabel(name, t),
            },
          }),
          question
        )
      : question;

    patch(id, {
      apiContent, answer: '', blocks: null, status: 'pending', error: null, model, usage: null,
      truncated: false,
    });

    const messages = [
      ...prior.flatMap((e) => [
        { role: 'user', content: e.apiContent },
        {
          role: 'assistant',
          content: info.provider === 'anthropic' && e.blocks ? e.blocks : e.answer,
        },
      ]),
      { role: 'user', content: apiContent },
    ];

    const current = new AbortController();
    controller = current;

    // Providers send a delta every few characters; coalescing them per frame
    // keeps a long answer from re-rendering the thread hundreds of times.
    let pending = '';
    let frame = 0;
    const flush = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!pending) return;
      const chunk = pending;
      pending = '';
      patch(id, (e) => ({ answer: e.answer + chunk, status: 'streaming' }));
    };

    try {
      const { text, content, usage, stopReason } = await streamAnalysis({
        apiKey: keyForModel(aiSettings, model),
        model,
        effort: aiSettings.effort || DEFAULT_EFFORT,
        messages,
        onStatus: (status) => patch(id, (e) => (e.status === 'pending' ? { status } : {})),
        onText: (delta) => {
          pending += delta;
          if (!frame) frame = requestAnimationFrame(flush);
        },
        signal: current.signal,
      });
      flush();
      patch(id, {
        answer: text,
        blocks: content || null,
        status: 'done',
        usage,
        truncated: stopReason === 'max_tokens',
      });
    } catch (err) {
      flush();
      if (err?.name === 'AbortError') {
        // Keep whatever had arrived — half an answer is still worth reading.
        patch(id, { status: 'stopped' });
      } else {
        patch(id, { status: 'error', error: describeAiError(err) });
      }
    } finally {
      if (controller === current) controller = null;
    }
  }

  return {
    tab: 'summary',
    scope: defaultScope(),
    exchanges: [],

    setTab: (tab) => set({ tab }),

    /** Changing what data the AI sees invalidates the thread built on it. */
    setScope: (scope) => {
      controller?.abort();
      set((s) => ({ scope: { ...s.scope, ...scope }, exchanges: [] }));
    },

    reset: () => {
      controller?.abort();
      set({ exchanges: [] });
    },

    stop: () => controller?.abort(),

    ask: (text) => {
      const question = text.trim();
      if (!question || get().exchanges.some(isActive)) return null;
      const id = generateId();
      set((s) => ({
        exchanges: [...s.exchanges, {
          id, question, apiContent: '', answer: '', blocks: null, status: 'pending', error: null,
          model: useStore.getState().aiSettings.model, usage: null, truncated: false,
        }],
      }));
      run(id);
      return id;
    },

    /** Re-asks the latest question — after an error, a stop, or for a fresh take. */
    retry: () => {
      const last = get().exchanges.at(-1);
      if (!last || isActive(last)) return null;
      run(last.id);
      return last.id;
    },
  };
});

export default useChatStore;
