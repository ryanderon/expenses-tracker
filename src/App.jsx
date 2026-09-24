import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
} from "react-router-dom";
import { useState, useRef, lazy, Suspense } from "react";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Icon } from "@/components/ui/design";
import Logo from "@/components/Logo";
import Dashboard from "@/pages/Dashboard";
import Today from "@/pages/Today";
import Transactions from "@/pages/Transactions";
import Budget from "@/pages/Budget";
import Accounts from "@/pages/Accounts";
import Categories from "@/pages/Categories";
import SplitBill from "@/pages/SplitBill";
import useStore from "@/store/useStore";
import { exportToExcel } from "@/lib/excel";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, MOBILE_NAV } from "@/lib/nav";
import Tour, { TourTrigger } from "@/components/Tour";
import UserNameModal from "@/components/UserNameModal";
import { BackupProvider } from "@/components/BackupProvider";
import { useBackup } from "@/hooks/useGoogleBackup";
import { useT } from "@/hooks/useT";
import useTheme from "@/hooks/useTheme";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

// Recharts and the Anthropic SDK are heavy; keep them out of the first paint.
const Analytics = lazy(() => import("@/pages/Analytics"));
const Reports = lazy(() => import("@/pages/Reports"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));
const Insights = lazy(() => import("@/pages/Insights"));
const SettingsPage = lazy(() => import("@/pages/Settings"));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Icon name="progress_activity" className="animate-spin text-muted-foreground" size={22} />
    </div>
  );
}

function SidebarNav({ onNavigate }) {
  const t = useT();
  const { pathname } = useLocation();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
      {NAV_ITEMS.map(({ to, labelKey, icon }) => {
        const active = pathname === to;
        return (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] transition-colors",
              active
                ? "bg-[var(--primary-soft)] font-bold text-primary"
                : "font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon name={icon} size={20} />
            {t(labelKey)}
          </NavLink>
        );
      })}
    </nav>
  );
}

function SidebarBrand({ onEditName, onNavigate }) {
  const t = useT();
  const userName = useStore((s) => s.userName);

  return (
    <div className="flex items-center gap-3 px-5 pb-[18px] pt-[22px]">
      <Logo size={38} className="shrink-0 drop-shadow-[0_4px_12px_var(--primary-soft)]" />
      <div className="min-w-0">
        <div className="text-[17px] font-extrabold tracking-[-0.02em]">Penny</div>
        {userName && (
          <button
            onClick={() => {
              onEditName();
              onNavigate?.();
            }}
            className="-mt-px block max-w-35 truncate text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("app.greeting", { name: userName })}
          </button>
        )}
      </div>
    </div>
  );
}

/** A signature, not interface copy — it reads the same in every language. */
function SidebarFooter() {
  return (
    <div className="mt-auto p-4">
      <div className="rounded-[14px] bg-[var(--primary-soft)] px-3.5 py-3 text-center">
        <div className="text-[10px] tracking-[0.03em] text-muted-foreground">
          made with ☕ by
        </div>
        <a
          href="https://github.com/ryanderon"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 block text-xs font-bold hover:text-primary"
        >
          ryanderon
        </a>
      </div>
    </div>
  );
}

function SidebarBody({ onEditName, onNavigate }) {
  return (
    <>
      <SidebarBrand onEditName={onEditName} onNavigate={onNavigate} />
      <div className="mx-5 mb-3 h-px bg-border" />
      <SidebarNav onNavigate={onNavigate} />
      <SidebarFooter />
    </>
  );
}

function DesktopSidebar({ onEditName }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar lg:flex">
      <SidebarBody onEditName={onEditName} />
    </aside>
  );
}

function MobileSidebar({ onEditName }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-card lg:hidden"
          aria-label="Menu"
        >
          <Icon name="menu" size={19} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[264px] flex-col bg-sidebar p-0">
        <SheetTitle className="sr-only">Penny</SheetTitle>
        <SidebarBody onEditName={onEditName} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function SyncIndicator() {
  const t = useT();
  const backup = useBackup();
  if (!backup.enabled) return null;

  const { status, pendingChanges, error, lastSyncedAt } = backup;

  let icon = "cloud_done";
  if (status === "syncing") icon = "cloud_sync";
  else if (status === "error") icon = "cloud_off";

  let tone = "text-[var(--teal)]";
  if (status === "error") tone = "text-[var(--danger)]";
  else if (pendingChanges) tone = "text-muted-foreground";

  let message;
  if (status === "error") message = error || t("app.syncFailed");
  else if (status === "syncing") message = t("app.syncing");
  else if (pendingChanges) message = t("app.syncPending");
  else if (lastSyncedAt)
    message = t("app.syncedAt", { time: new Date(lastSyncedAt).toLocaleString() });
  else message = t("app.syncConnected");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("hidden size-9 items-center justify-center rounded-[10px] sm:inline-flex", tone)}>
          <Icon name={icon} size={19} className={cn(status === "syncing" && "animate-pulse")} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  );
}

function HeaderActions() {
  const t = useT();
  const { transactions, accounts, exportData, importData, userName } = useStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const fileInputRef = useRef(null);

  const handleExportExcel = () =>
    exportToExcel(transactions, accounts, "penny-all-transactions");

  const handleExportData = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `penny-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts)) {
          alert(t("settings.importBadFormat"));
          return;
        }
        if (window.confirm(t("settings.importConfirm", { count: data.transactions.length }))) {
          importData(data);
          alert(t("settings.importSuccess"));
        }
      } catch {
        alert(t("settings.importInvalid"));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div data-tour="header-actions" className="flex items-center gap-2.5">
      <SyncIndicator />
      <TourTrigger />

      <button
        onClick={toggleTheme}
        aria-label={t("app.toggleTheme")}
        className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-card text-foreground transition-colors hover:text-primary"
      >
        <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} size={19} />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("app.moreActions")}
            className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-card text-foreground transition-colors hover:text-primary"
          >
            <Icon name="more_vert" size={19} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t("app.data")}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={handleExportData}>
            <Icon name="save" size={17} /> {t("app.backupToFile")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <Icon name="upload" size={17} /> {t("app.restoreFromFile")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleExportExcel}>
            <Icon name="download" size={17} /> {t("app.exportExcel")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Avatar, as in the design's header. */}
      <NavLink
        to="/settings"
        aria-label={t("nav.settings")}
        className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[var(--violet)] text-[13px] font-bold text-primary-foreground"
      >
        {(userName || "P").charAt(0).toUpperCase()}
      </NavLink>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportData}
      />
    </div>
  );
}

/** Bottom bar for phones — the design is desktop-only, so this is additive. */
function MobileBottomNav({ onOpenMenu }) {
  const t = useT();
  const { pathname } = useLocation();
  const inBar = MOBILE_NAV.some((i) => i.to === pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="flex justify-around">
        {MOBILE_NAV.map(({ to, labelKey, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center px-2 py-2.5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <Icon name={icon} size={21} />
            <span className="mt-0.5 text-[10px] font-semibold">{t(labelKey)}</span>
          </NavLink>
        ))}
        <button
          onClick={onOpenMenu}
          className={cn(
            "flex flex-col items-center px-2 py-2.5 transition-colors",
            inBar ? "text-muted-foreground" : "text-primary",
          )}
        >
          <Icon name="apps" size={21} />
          <span className="mt-0.5 text-[10px] font-semibold">{t("nav.more")}</span>
        </button>
      </div>
    </nav>
  );
}

function AppShell() {
  const t = useT();
  const { pathname } = useLocation();
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const current = NAV_ITEMS.find((i) => i.to === pathname);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DesktopSidebar onEditName={() => setEditNameOpen(true)} />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <MobileSidebar onEditName={() => setEditNameOpen(true)} />
            <span className="text-[15px] font-bold">
              {current ? t(current.labelKey) : "Penny"}
            </span>
          </div>
          <HeaderActions />
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-16 lg:pt-7">
          <div className="mx-auto w-full max-w-[1240px]">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/today" element={<Today />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/budget" element={<Budget />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/split-bill" element={<SplitBill />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* The previous build's catch-all page is gone. */}
                <Route path="/more" element={<Navigate to="/settings" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>

      <MobileBottomNav onOpenMenu={() => setMenuOpen(true)} />

      {/* Full nav for phones, opened from the bottom bar's menu button. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex w-[264px] flex-col bg-sidebar p-0">
          <SheetTitle className="sr-only">Penny</SheetTitle>
          <SidebarBody
            onEditName={() => setEditNameOpen(true)}
            onNavigate={() => setMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <Tour />
      <UserNameModal editOpen={editNameOpen} onEditClose={() => setEditNameOpen(false)} />
    </div>
  );
}

/**
 * IndexedDB reads are async, so the store starts empty for a beat. Rendering
 * before hydration would flash an empty dashboard and let the name modal fire
 * for an existing user.
 */
function HydrationGate({ children }) {
  const hasHydrated = useStore((s) => s._hasHydrated);

  if (!hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Logo size={48} />
          <Icon name="progress_activity" size={18} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <>
      <VercelAnalytics />
      <BrowserRouter>
        <TooltipProvider>
          <HydrationGate>
            <BackupProvider>
              <AppShell />
            </BackupProvider>
          </HydrationGate>
        </TooltipProvider>
      </BrowserRouter>
    </>
  );
}
