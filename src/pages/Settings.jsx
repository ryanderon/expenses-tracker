import { useState, useRef, useEffect } from 'react';
import {
  Eye, EyeOff, Check, X, Loader2, Cloud, CloudOff, RefreshCw,
  Upload, HardDriveDownload, Download, Database, User, ExternalLink,
  AlertTriangle, Sparkles, ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import useStore from '@/store/useStore';
import { useBackup } from '@/hooks/useGoogleBackup';
import { verifyApiKey, describeAiError } from '@/lib/ai';
import { AI_MODELS, EFFORT_LEVELS } from '@/lib/aiModels';
import { PRICE_BUDGET } from '@/lib/prices';
import { getStorageSize } from '@/lib/idbStorage';
import { exportToExcel } from '@/lib/excel';
import { cn, getMonthKey } from '@/lib/utils';
import { useT, useDateFormat } from '@/hooks/useT';
import { usePeriodLabel } from '@/hooks/useCycle';
import { LOCALE_OPTIONS } from '@/lib/i18n';
import PageHeader from '@/components/PageHeader';
import { Languages, LineChart, CalendarRange } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function useTimeAgo() {
  const t = useT();
  const dates = useDateFormat();
  return (iso) => {
    if (!iso) return t('common.never');
    try {
      return t('common.ago', { time: dates.distance(iso) });
    } catch {
      return t('common.never');
    }
  };
}

/** Language is first because it changes every other word on the page. */
function LanguageSection() {
  const t = useT();
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);

  return (
    <Section
      icon={Languages}
      title={t('settings.languageTitle')}
      description={t('settings.languageBody')}
    >
      <div className="flex flex-wrap gap-2">
        {LOCALE_OPTIONS.map((option) => (
          <Button
            key={option.id}
            variant={locale === option.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLocale(option.id)}
          >
            {locale === option.id && <Check data-icon="inline-start" />}
            {option.label}
          </Button>
        ))}
      </div>
    </Section>
  );
}

/**
 * Which day the budget period starts on.
 *
 * Offered as the common paydays plus a free entry rather than a 1–28 dropdown:
 * nobody is looking for "the 17th", they're looking for the day their salary
 * lands, and that is almost always the 1st, 25th, or the end of the month.
 */
function CycleSection() {
  const t = useT();
  const startDay = useStore((s) => s.budgetSettings?.cycleStartDay) || 1;
  const setBudgetSetting = useStore((s) => s.setBudgetSetting);
  const periodLabel = usePeriodLabel();

  const apply = (day) => setBudgetSetting('cycleStartDay', day);

  return (
    <Section
      icon={CalendarRange}
      title={t('settings.cycleTitle')}
      description={t('settings.cycleBody')}
    >
      <div className="flex flex-wrap gap-2">
        {[1, 20, 25, 28].map((day) => (
          <Button
            key={day}
            variant={startDay === day ? 'default' : 'outline'}
            size="sm"
            onClick={() => apply(day)}
          >
            {startDay === day && <Check data-icon="inline-start" />}
            {day === 1 ? t('settings.cycleCalendar') : t('settings.cycleDay', { day })}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-xs">{t('settings.cycleCustom')}</Label>
        <Input
          type="number"
          min="1"
          max="28"
          value={startDay}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 1 && n <= 28) apply(n);
          }}
          className="h-9 w-20"
        />
        <p className="text-xs text-muted-foreground">{t('settings.cycleMax')}</p>
      </div>

      <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        {t('settings.cycleCurrent')}{' '}
        <span className="font-semibold text-foreground">
          {periodLabel(getMonthKey(new Date()))}
        </span>
      </div>
    </Section>
  );
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function AiSection() {
  const aiSettings = useStore((s) => s.aiSettings);
  const setAiSettings = useStore((s) => s.setAiSettings);

  const [draft, setDraft] = useState(aiSettings.apiKey || '');
  const [show, setShow] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const t = useT();

  const save = async () => {
    const key = draft.trim();
    setResult(null);

    if (!key) {
      setAiSettings({ apiKey: '' });
      return;
    }

    setVerifying(true);
    try {
      await verifyApiKey(key);
      setAiSettings({ apiKey: key });
      setResult({ ok: true, message: t('settings.keySaved') });
    } catch (err) {
      setResult({ ok: false, message: t(describeAiError(err)) });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Section
      icon={Sparkles}
      title={t('settings.aiTitle')}
      description={t('settings.aiBody')}
    >
      <div className="flex flex-col gap-2">
        <Label className="text-xs">{t('settings.apiKey')}</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={show ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
              spellCheck={false}
              className="pr-9 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? t('settings.hideKey') : t('settings.showKey')}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button onClick={save} disabled={verifying || draft.trim() === (aiSettings.apiKey || '')}>
            {verifying ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
            {verifying ? t('settings.verifying') : t('common.save')}
          </Button>
        </div>

        {result && (
          <p className={cn('text-xs flex items-center gap-1', result.ok ? 'text-chart-1' : 'text-destructive')}>
            {result.ok ? <Check className="size-3" /> : <X className="size-3" />}
            {result.message}
          </p>
        )}

        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <ShieldCheck className="size-3.5 mt-0.5 shrink-0 text-chart-1" />
          {t('settings.keyPrivacy')}
        </p>

        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 w-fit"
        >
          {t('settings.getKey')} <ExternalLink className="size-3" />
        </a>
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs">{t('settings.model')}</Label>
          <Select value={aiSettings.model} onValueChange={(v) => setAiSettings({ model: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {AI_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {t(AI_MODELS.find((m) => m.id === aiSettings.model)?.hintKey ?? '')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs">{t('settings.effort')}</Label>
          <Select
            value={aiSettings.effort || 'high'}
            onValueChange={(v) => setAiSettings({ effort: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {EFFORT_LEVELS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{t(e.labelKey)}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {t('settings.effortHint')}
          </p>
        </div>
      </div>
    </Section>
  );
}

function PricesSection() {
  const t = useT();
  const priceMeta = useStore((s) => s.priceMeta);
  const setPriceSettings = useStore((s) => s.setPriceSettings);
  const [draft, setDraft] = useState(priceMeta.apiKey || '');
  const [show, setShow] = useState(false);

  return (
    <Section
      icon={LineChart}
      title={t('settings.pricesTitle')}
      description={t('settings.pricesBody')}
    >
      <div className="flex flex-col gap-2">
        <Label className="text-xs">{t('settings.pricesKey')}</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={show ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="pr-9 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? t('settings.hideKey') : t('settings.showKey')}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button
            onClick={() => setPriceSettings({ apiKey: draft.trim() })}
            disabled={draft.trim() === (priceMeta.apiKey || '')}
          >
            <Check data-icon="inline-start" /> {t('common.save')}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <ShieldCheck className="size-3.5 mt-0.5 shrink-0 text-chart-1" />
          {t('settings.keyPrivacy')}
        </p>

        <p className="text-xs text-muted-foreground">
          {t('settings.pricesBudget', { perDay: PRICE_BUDGET.autoPerDay })}
        </p>

        <a
          href="https://twelvedata.com/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 w-fit"
        >
          {t('settings.pricesGetKey')} <ExternalLink className="size-3" />
        </a>
      </div>
    </Section>
  );
}

function GoogleSection() {
  const t = useT();
  const timeAgo = useTimeAgo();
  const backup = useBackup();
  const syncSettings = useStore((s) => s.syncSettings);
  const setSyncSettings = useStore((s) => s.setSyncSettings);
  const [busy, setBusy] = useState(null);

  const run = async (name, fn) => {
    setBusy(name);
    try {
      await fn();
    } catch {
      // Errors surface through backup.error.
    } finally {
      setBusy(null);
    }
  };

  let statusLabel = t('settings.upToDate');
  if (backup.status === 'syncing') statusLabel = t('app.syncing');
  else if (backup.status === 'error') statusLabel = t('settings.error');
  else if (backup.pendingChanges) statusLabel = t('settings.pending');

  if (!backup.configured) {
    return (
      <Section icon={CloudOff} title={t('settings.backupTitle')}>
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="size-4 text-chart-2 shrink-0 mt-0.5" />
          <div>
            <p className="text-foreground font-medium mb-1">{t('settings.notConfigured')}</p>
            <p>
            {t('settings.notConfiguredBody')}
            </p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section
      icon={backup.enabled ? Cloud : CloudOff}
      title={t('settings.backupTitle')}
      description={t('settings.backupBody')}
    >
      {backup.enabled ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-8 rounded-lg bg-chart-1/15 flex items-center justify-center shrink-0">
                <Cloud className="text-chart-1 size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{backup.account || t('settings.connected')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.lastBackup', { time: timeAgo(backup.lastSyncedAt) })}
                  {backup.pendingChanges && ` · ${t('settings.pendingChanges')}`}
                </p>
              </div>
            </div>
            <Badge
              variant={backup.status === 'error' ? 'destructive' : 'secondary'}
              className="shrink-0"
            >
              {statusLabel}
            </Badge>
          </div>

          {backup.error && (
            <p className="text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {backup.error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy}
              onClick={() => run('backup', () => backup.backupNow({ interactive: true }))}
            >
              {busy === 'backup'
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <HardDriveDownload data-icon="inline-start" />}
              {t('settings.backupNow')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy}
              onClick={() => {
                if (!window.confirm(t('settings.restoreConfirm'))) return;
                run('restore', () => backup.restoreNow());
              }}
            >
              {busy === 'restore'
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <RefreshCw data-icon="inline-start" />}
              {t('settings.restoreFromDrive')}
            </Button>
            <Button
              variant={syncSettings.autoBackup ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSyncSettings({ autoBackup: !syncSettings.autoBackup })}
            >
              <Cloud data-icon="inline-start" />
              {t('settings.autoBackup')} · {syncSettings.autoBackup ? t('budget.on') : t('budget.off')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onClick={() => run('disconnect', () => backup.disconnect())}
            >
              <CloudOff data-icon="inline-start" /> {t('settings.disconnect')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t('settings.backupScope')}
          </p>
          {backup.error && (
            <p className="text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {backup.error}
            </p>
          )}
          <Button
            size="sm"
            className="w-fit"
            disabled={!!busy}
            onClick={() => run('connect', () => backup.connect())}
          >
            {busy === 'connect'
              ? <Loader2 className="animate-spin" data-icon="inline-start" />
              : <Cloud data-icon="inline-start" />}
            {t('settings.connect')}
          </Button>
        </>
      )}
    </Section>
  );
}

function ConflictDialog() {
  const t = useT();
  const timeAgo = useTimeAgo();
  const backup = useBackup();
  const conflict = backup.conflict;
  const [busy, setBusy] = useState(false);

  if (!conflict) return null;

  const choose = async (action) => {
    setBusy(true);
    try {
      if (action === 'restore') await backup.restoreNow();
      else {
        backup.dismissConflict();
        await backup.backupNow({ interactive: false });
      }
    } catch {
      // Surfaced via backup.error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={backup.dismissConflict}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.conflictTitle')}</DialogTitle>
          <DialogDescription>{t('settings.conflictBody')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('settings.conflictDrive')}</p>
            <p className="font-semibold">{t('settings.conflictTransactions', { count: conflict.remoteTransactions })}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {conflict.remoteUpdatedAt
                ? timeAgo(new Date(conflict.remoteUpdatedAt).toISOString())
                : t('settings.unknownDate')}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('settings.conflictLocal')}</p>
            <p className="font-semibold">{t('settings.conflictTransactions', { count: conflict.localTransactions })}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {conflict.localUpdatedAt
                ? timeAgo(new Date(conflict.localUpdatedAt).toISOString())
                : t('settings.unknownDate')}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => choose('overwrite')}>
            {t('settings.keepLocal')}
          </Button>
          <Button disabled={busy} onClick={() => choose('restore')}>
            {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {t('settings.useDrive')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DataSection() {
  const t = useT();
  const { transactions, accounts, exportData, importData, userName, setUserName } = useStore();
  const [size, setSize] = useState(0);
  const [nameDraft, setNameDraft] = useState(userName);
  const fileRef = useRef(null);

  useEffect(() => { getStorageSize().then(setSize); }, [transactions]);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `penny-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!window.confirm(
          t('settings.importConfirm', { count: data.transactions?.length ?? 0 })
        )) return;
        importData(data);
        alert(t('settings.importSuccess'));
      } catch {
        alert(t('settings.importInvalid'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <Section icon={User} title={t('settings.profileTitle')}>
        <div className="flex flex-col gap-2">
          <Label className="text-xs">{t('settings.yourName')}</Label>
          <div className="flex gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={t('settings.namePlaceholder')}
              className="flex-1"
            />
            <Button onClick={() => setUserName(nameDraft.trim())} disabled={nameDraft === userName}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Section>

      <Section
        icon={Database}
        title={t('settings.dataTitle')}
        description={t('settings.dataBody')}
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('settings.transactionsCount'), value: transactions.length },
            { label: t('settings.accountsCount'), value: accounts.length },
            { label: t('settings.storageUsed'), value: formatBytes(size) },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className="text-lg font-bold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportJson}>
            <HardDriveDownload data-icon="inline-start" /> {t('settings.exportJson')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload data-icon="inline-start" /> {t('settings.importJson')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToExcel(transactions, accounts, 'penny-all-transactions')}
          >
            <Download data-icon="inline-start" /> {t('app.exportExcel')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </Section>
    </>
  );
}

export default function Settings() {
  return (
    <>
      <PageHeader />
      <div className="flex max-w-3xl flex-col gap-4">

      <LanguageSection />
      <CycleSection />
      <AiSection />
      <PricesSection />
      <GoogleSection />
      <DataSection />
      <ConflictDialog />
      </div>
    </>
  );
}
