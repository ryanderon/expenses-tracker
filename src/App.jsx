import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
} from "react-router-dom";
import { useState, useRef } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  Target,
  FileText,
  Menu,
  Download,
  Upload,
  HardDriveDownload,
  Wallet,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import AnalyticsPage from "@/pages/Analytics";
import Budget from "@/pages/Budget";
import Reports from "@/pages/Reports";
import Accounts from "@/pages/Accounts";
import useStore from "@/store/useStore";
import { exportToExcel } from "@/lib/excel";
import { cn } from "@/lib/utils";
import Tour, { TourTrigger } from "@/components/Tour";
import useTheme from "@/hooks/useTheme";
import { Analytics  } from "@vercel/analytics/react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/analytics", label: "Analytics", icon: PieChart },
  { to: "/budget", label: "Budget", icon: Target },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/accounts", label: "Accounts", icon: Wallet },
];

const PAGE_TITLES = {
  "/": "Dashboard",
  "/transactions": "Transactions",
  "/analytics": "Analytics",
  "/budget": "Budget",
  "/reports": "Reports",
  "/accounts": "Accounts",
};

function SidebarNav({ onNavigate }) {
  const location = useLocation();

  return (
    <nav className="flex flex-col gap-1 flex-1 p-3">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
        const isActive = location.pathname === to;
        return (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
            )}
          >
            <Icon />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-background">
      <div className="flex items-center gap-3 p-5">
        <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">P</span>
        </div>
        <span className="text-lg font-bold tracking-tight font-serif">
          Penny
        </span>
      </div>
      <Separator />
      <SidebarNav />
      <div className="mt-auto p-4">
        <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-center">
          <p className="text-[11px] text-muted-foreground/70">
            made with ☕ by
          </p>
          <a
            href="https://github.com/ryanderon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            ryanderon
          </a>
        </div>
      </div>
    </aside>
  );
}

function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu data-icon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex items-center gap-3 p-5">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">P</span>
          </div>
          <span className="text-lg font-bold tracking-tight font-serif">
            Penny
          </span>
        </div>
        <Separator />
        <SidebarNav onNavigate={() => setOpen(false)} />
        <div className="mt-auto p-4">
          <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-center">
            <p className="text-[11px] text-muted-foreground/70">
              made with ☕ by
            </p>
            <a
              href="https://github.com/ryanderon"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              ryanderon
            </a>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AppShell() {
  const location = useLocation();
  const { transactions, accounts, exportData, importData } = useStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const title = PAGE_TITLES[location.pathname] || "Penny";
  const fileInputRef = useRef(null);

  const handleExport = () =>
    exportToExcel(transactions, accounts, "penny-all-transactions");

  const handleExportData = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
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
        if (
          !Array.isArray(data.transactions) ||
          !Array.isArray(data.accounts)
        ) {
          alert("Invalid backup file format.");
          return;
        }
        if (
          window.confirm(
            `This will replace all your current data with the backup (${data.transactions.length} transactions, ${data.accounts.length} accounts). Continue?`,
          )
        ) {
          importData(data);
          alert("Data imported successfully!");
        }
      } catch {
        alert("Failed to read file. Make sure it is a valid Penny backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <DesktopSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 lg:px-6 border-b border-border bg-background/90 backdrop-blur-sm sticky top-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <MobileSidebar />
            <h1 className="hidden lg:block text-lg font-bold">{title}</h1>
          </div>
          <div
            data-tour="header-actions"
            className="flex items-center gap-1 sm:gap-2"
          >
            <TourTrigger />
            <Button
              variant="outline"
              size="icon"
              className="size-8 sm:hidden"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun data-icon /> : <Moon data-icon />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              className="gap-1.5 hidden sm:inline-flex"
            >
              {theme === "dark" ? (
                <Sun data-icon="inline-start" />
              ) : (
                <Moon data-icon="inline-start" />
              )}
              <span className="hidden md:inline">
                {theme === "dark" ? "Light" : "Dark"}
              </span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8 sm:hidden"
              onClick={handleExportData}
            >
              <HardDriveDownload data-icon />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportData}
              className="hidden sm:inline-flex"
            >
              <HardDriveDownload data-icon="inline-start" />
              <span className="hidden md:inline">Backup</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8 sm:hidden"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload data-icon />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="hidden sm:inline-flex"
            >
              <Upload data-icon="inline-start" />
              <span className="hidden md:inline">Restore</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportData}
            />
            <Button
              variant="outline"
              size="icon"
              className="size-8 sm:hidden"
              onClick={handleExport}
            >
              <Download data-icon />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="hidden sm:inline-flex"
            >
              <Download data-icon="inline-start" />
              <span className="hidden md:inline">Export Excel</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/accounts" element={<Accounts />} />
            </Routes>
          </div>
        </main>
      </div>

      <MobileBottomNav />
      <Tour />
    </div>
  );
}

function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around">
        {NAV_ITEMS.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center py-2.5 px-3 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <Icon />
            <span className="text-[10px] mt-0.5 font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <>
      <Analytics />
      <BrowserRouter>
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </BrowserRouter>
    </>
  );
}
