import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Send, Square, KeyRound, RefreshCw, ChartNoAxesCombined, Target,
  PiggyBank, TrendingUp, HeartPulse, AlertTriangle, Settings as SettingsIcon,
  Copy, Check,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MonthField } from '@/components/ui/date-fields';
import { SegmentedTabs } from '@/components/ui/design';
import Markdown from '@/components/Markdown';
import useStore from '@/store/useStore';
import { streamAnalysis, describeAiError } from '@/lib/ai';
import { getModelInfo, AI_MODELS } from '@/lib/aiModels';
import { buildFinancialSnapshot, buildContextMessage, QUICK_PROMPTS } from '@/lib/aiContext';
import { generateId, getMonthKey } from '@/lib/utils';
import { useT, useDateFormat } from '@/hooks/useT';
import PageHeader from '@/components/PageHeader';
import InsightsSummary from '@/components/InsightsSummary';

const PROMPT_ICONS = {
  chart: ChartNoAxesCombined,
  target: Target,
  piggy: PiggyBank,
  trend: TrendingUp,
  heart: HeartPulse,
};

function SetupPrompt() {
  const t = useT();
  return (
    <Card className="mx-auto w-full max-w-xl border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <KeyRound className="text-primary size-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{t('insights.setupTitle')}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t('insights.setupBody')}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/settings">
            <SettingsIcon data-icon="inline-start" /> {t('insights.setupAction')}
          </Link>
        </Button>
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {t('insights.setupLink')}
        </a>
      </CardContent>
    </Card>
  );
}

function CopyButton({ text }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs text-muted-foreground"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? t('insights.copied') : t('insights.copy')}
    </Button>
  );
}

export default function Insights() {
  const t = useT();
  const dates = useDateFormat();
  const aiSettings = useStore((s) => s.aiSettings);
  const setAiSettings = useStore((s) => s.setAiSettings);
  const transactions = useStore((s) => s.transactions);

  const [mode, setMode] = useState('summary');
  const [scopeType, setScopeType] = useState('month');
  const [scopeMonth, setScopeMonth] = useState(getMonthKey(new Date()));
  const [scopeYear, setScopeYear] = useState(String(new Date().getFullYear()));

  const [turns, setTurns] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [input, setInput] = useState('');
  const [usage, setUsage] = useState(null);

  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  const hasKey = !!aiSettings.apiKey;
  const hasData = transactions.length > 0;

  const years = useMemo(() => {
    const yrs = [...new Set(transactions.map((t) => new Date(t.date).getFullYear()))];
    const current = new Date().getFullYear();
    if (!yrs.includes(current)) yrs.push(current);
    return yrs.sort((a, b) => b - a).map(String);
  }, [transactions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [streamingText, turns.length]);

  // Cancel any in-flight request if the user navigates away mid-stream.
  useEffect(() => () => abortRef.current?.abort(), []);

  const scopeLabel = scopeType === 'year' ? scopeYear : dates.monthShort(`${scopeMonth}-01`);

  const resetThread = useCallback(() => {
    abortRef.current?.abort();
    setTurns([]);
    setStreamingText('');
    setError(null);
    setUsage(null);
  }, []);

  const ask = useCallback(async (question) => {
    if (!question.trim() || isStreaming) return;

    setError(null);
    setInput('');

    // The snapshot only rides along with the first question — later turns
    // already have it in context, and resending would double the token bill.
    const isFirst = turns.length === 0;
    const apiContent = isFirst
      ? buildContextMessage(
          buildFinancialSnapshot(useStore.getState(), {
            scope: scopeType,
            monthKey: scopeMonth,
            year: scopeYear,
          }),
          question
        )
      : question;

    const nextTurns = [...turns, { id: generateId(), role: 'user', text: question, apiContent }];
    setTurns(nextTurns);
    setIsStreaming(true);
    setStreamingText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { text, usage: tokens } = await streamAnalysis({
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        effort: aiSettings.effort || 'high',
        messages: nextTurns.map((t) => ({
          role: t.role,
          content: t.role === 'user' ? t.apiContent : t.text,
        })),
        onText: (delta) => setStreamingText((prev) => prev + delta),
        signal: controller.signal,
      });

      setTurns((prev) => [...prev, { id: generateId(), role: 'assistant', text }]);
      setUsage(tokens);
    } catch (err) {
      if (err?.name !== 'AbortError') setError(t(describeAiError(err)));
      // Drop the unanswered question so a retry doesn't stack duplicates.
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      abortRef.current = null;
    }
  }, [aiSettings, isStreaming, turns, scopeType, scopeMonth, scopeYear, t]);

  const modelInfo = getModelInfo(aiSettings.model);

  return (
    <>
      <div data-tour="insights-header">
      <PageHeader
        actions={mode === 'summary' ? (
          <MonthField value={scopeMonth} onChange={(v) => { setScopeMonth(v); resetThread(); }} />
        ) : hasKey && (
          <div className="flex items-center gap-2">
            <SegmentedTabs
              value={scopeType}
              onChange={(v) => { setScopeType(v); resetThread(); }}
              options={[
                { value: 'month', label: t('common.month') },
                { value: 'year', label: t('common.year') },
              ]}
            />
            {scopeType === 'month' ? (
              <MonthField
                value={scopeMonth}
                onChange={(v) => { setScopeMonth(v); resetThread(); }}
              />
            ) : (
              <Select value={scopeYear} onValueChange={(v) => { setScopeYear(v); resetThread(); }}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      />
      </div>

      <div className="flex flex-col gap-4">
      <SegmentedTabs
        value={mode}
        onChange={setMode}
        options={[
          { value: 'summary', label: t('insights.tabSummary') },
          {
            value: 'ai',
            label: (
              <span className="flex items-center gap-1.5">
                {t('insights.tabAi')}
                <Badge variant="secondary" className="px-1.5 text-[9px]">{t('insights.beta')}</Badge>
              </span>
            ),
          },
        ]}
      />

      {mode === 'summary' && <InsightsSummary monthKey={scopeMonth} />}

      {mode === 'ai' && !hasKey && <SetupPrompt />}

      {mode === 'ai' && hasKey && !hasData && (
        <Card className="border-dashed">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('insights.noDataBody')}
            </p>
          </CardContent>
        </Card>
      )}

      {mode === 'ai' && hasKey && hasData && (
        <>
          {/* Quick prompts */}
          {turns.length === 0 && !isStreaming && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {t('insights.analysing', { period: scopeLabel })}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {QUICK_PROMPTS.map((p) => {
                  const Icon = PROMPT_ICONS[p.icon] || Sparkles;
                  return (
                    <button
                      key={p.id}
                      onClick={() => ask(t(p.promptKey))}
                      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-secondary/50"
                    >
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="text-primary size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t(p.labelKey)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {t(p.promptKey)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conversation */}
          {(turns.length > 0 || isStreaming) && (
            <div className="flex flex-col gap-4">
              {turns.map((turn) =>
                turn.role === 'user' ? (
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5">
                      <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
                    </div>
                  </div>
                ) : (
                  <Card key={turn.id}>
                    <CardContent className="pt-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Sparkles className="text-primary size-3" />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">
                            {modelInfo.label}
                          </span>
                        </div>
                        <CopyButton text={turn.text} />
                      </div>
                      <Markdown content={turn.text} />
                    </CardContent>
                  </Card>
                )
              )}

              {isStreaming && (
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Sparkles className="text-primary size-3 animate-pulse" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {streamingText ? modelInfo.label : `${t('insights.reading')}…`}
                      </span>
                    </div>
                    {streamingText
                      ? <Markdown content={streamingText} />
                      : (
                        <div className="flex flex-col gap-2">
                          <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                          <div className="h-3 w-full rounded bg-muted animate-pulse" />
                          <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
                        </div>
                      )}
                  </CardContent>
                </Card>
              )}

              <div ref={bottomRef} />
            </div>
          )}

          {error && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="pt-4 pb-4 flex items-start gap-2">
                <AlertTriangle className="text-destructive size-4 mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Composer */}
          <div className="flex flex-col gap-2 sticky bottom-0 bg-background pt-2 pb-1">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                placeholder={
                  turns.length
                    ? t('insights.followUpPlaceholder')
                    : t('insights.askPlaceholder', { period: scopeLabel })
                }
                rows={2}
                disabled={isStreaming}
                className="flex-1"
              />
              {isStreaming ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Square data-icon="inline-start" /> {t('insights.stop')}
                </Button>
              ) : (
                <Button onClick={() => ask(input)} disabled={!input.trim()}>
                  <Send data-icon="inline-start" />
                  <span className="hidden sm:inline">{t('insights.ask')}</span>
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Select
                  value={aiSettings.model}
                  onValueChange={(v) => setAiSettings({ model: v })}
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {AI_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {turns.length > 0 && !isStreaming && (
                  <Button variant="ghost" size="sm" onClick={resetThread}>
                    <RefreshCw data-icon="inline-start" /> {t('insights.newAnalysis')}
                  </Button>
                )}
              </div>

              {usage && !isStreaming && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {t('insights.tokensUsed', {
                    input: usage.input_tokens?.toLocaleString() ?? 0,
                    output: usage.output_tokens?.toLocaleString() ?? 0,
                  })}
                </p>
              )}
            </div>
          </div>
        </>
      )}
      </div>
    </>
  );
}
