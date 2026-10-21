import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, Target, ListChecks, FolderKanban, CalendarDays, Briefcase, HeartPulse, Users, PenLine, Library, Wallet, Sparkles, Trophy,
  Settings, Search, Plus, Bell, Moon, Sun, PanelLeftClose, PanelLeft, Menu, LogOut, NotebookPen, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/Auth";
import { useGet } from "@/lib/api";
import { todayStr } from "@/lib/fmt";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import CommandMenu from "./CommandMenu";
import QuickCapture from "./QuickCapture";

export const NAV = [
  { group: "Command", items: [["/", "Home", Home], ["/plan", "Plan", Target], ["/tasks", "Tasks", ListChecks], ["/projects", "Projects", FolderKanban], ["/calendar", "Calendar", CalendarDays]] },
  { group: "Workspaces", items: [["/business", "Business", Briefcase], ["/personal", "Personal", HeartPulse], ["/people", "People", Users], ["/finance", "Finance", Wallet], ["/content", "Content Studio", PenLine], ["/knowledge", "Knowledge", Library], ["/notes", "Notes & Decisions", NotebookPen]] },
  { group: "Intelligence", items: [["/chief", "AI Chief of Staff", Sparkles], ["/reviews", "Reviews & Achievements", Trophy], ["/settings", "Settings", Settings]] },
];

function SideNav({ collapsed, onNavigate }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((g) => (
        <div key={g.group}>
          {!collapsed && <div className="eyebrow mb-1.5 px-2">{g.group}</div>}
          {g.items.map(([to, label, Icon, soon]) => (
            <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate} title={label} data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={({ isActive }) => cn("group flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] font-medium transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground", collapsed && "justify-center")}>
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {!collapsed && soon && <span className="rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground">Soon</span>}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

const Brand = ({ collapsed }) => (
  <div className={cn("flex h-[60px] items-center gap-2.5 border-b px-4", collapsed && "justify-center px-0")}>
    <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[13px] font-extrabold text-primary-foreground">F</div>
    {!collapsed && <div className="leading-tight"><div className="text-sm font-bold">Founder OS</div><div className="text-[11px] text-muted-foreground">Business · Life</div></div>}
  </div>
);

function Notifications() {
  const { perspective } = useAuth();
  const nav = useNavigate();
  const d = useGet("/dashboard", { date: todayStr(), perspective }).data;
  const items = d?.insights || [];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notifications-btn" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {items.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-risk" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="notifications-panel">
        <div className="border-b px-4 py-3 text-sm font-semibold">Attention</div>
        <div className="max-h-96 overflow-y-auto p-2">
          {items.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">Nothing needs your attention right now.</div>}
          {items.map((i, k) => (
            <button key={k} onClick={() => nav(i.link)} className="flex w-full gap-2.5 rounded-lg p-2.5 text-left hover:bg-muted" data-testid={`notification-${k}`}>
              {i.severity === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" /> : <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", i.severity === "risk" ? "text-risk" : "text-warn")} />}
              <div><div className="text-[13px] font-medium">{i.title}</div><div className="text-xs text-muted-foreground">{i.detail}</div></div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Topbar({ onMenu, onSearch, onCapture }) {
  const { user, logout, perspective, setPerspective, theme, setTheme } = useAuth();
  const nav = useNavigate();
  const score = useGet("/dashboard", { date: todayStr(), perspective }).data?.score?.value;
  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} data-testid="mobile-menu-btn" aria-label="Open menu"><Menu className="h-4 w-4" /></Button>
      <button onClick={onSearch} data-testid="global-search-btn"
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 sm:max-w-sm">
        <Search className="h-4 w-4 shrink-0" /><span className="truncate">Search or jump to…</span>
        <kbd className="num ml-auto hidden rounded border bg-muted px-1.5 text-[10px] sm:inline">⌘K</kbd>
      </button>
      <div className="hidden items-center rounded-lg border bg-card p-0.5 md:flex" data-testid="perspective-switch">
        {["combined", "business", "personal"].map((p) => (
          <button key={p} onClick={() => setPerspective(p)} data-testid={`perspective-${p}`}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors", perspective === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{p}</button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {score != null && (
          <button onClick={() => nav("/")} className="num hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold sm:flex" data-testid="topbar-score" title="Today's execution score">
            <span className="h-2 w-2 rounded-full bg-ok" />{score}%
          </button>
        )}
        <Button size="sm" onClick={onCapture} className="h-8 gap-1" data-testid="quick-capture-btn"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Capture</span></Button>
        <Notifications />
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} data-testid="theme-toggle" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold" data-testid="profile-menu-btn">
              {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" /> : (user?.name || "?")[0].toUpperCase()}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel><div className="text-sm">{user?.name}</div><div className="text-xs font-normal text-muted-foreground">{user?.email}</div></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => nav("/settings")} data-testid="profile-settings">Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={logout} data-testid="logout-btn"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

const MOBILE = [["/", "Home", Home], ["/tasks", "Tasks", ListChecks], [null, "Capture", Plus], ["/calendar", "Calendar", CalendarDays], ["/chief", "AI", Sparkles]];

export default function Shell() {
  const [collapsed, setCollapsed] = useState(localStorage.getItem("fos_sidebar") === "1");
  const [mobile, setMobile] = useState(false);
  const [cmd, setCmd] = useState(false);
  const [capture, setCapture] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((o) => !o); }
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.target.isContentEditable;
      if (!typing && !e.metaKey && !e.ctrlKey && e.key === "c" && !document.querySelector("[role=dialog]")) { e.preventDefault(); setCapture(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const toggle = () => { localStorage.setItem("fos_sidebar", collapsed ? "0" : "1"); setCollapsed(!collapsed); };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-200 lg:flex", collapsed ? "w-[68px]" : "w-64")} data-testid="sidebar">
        <Brand collapsed={collapsed} />
        <SideNav collapsed={collapsed} />
        <button onClick={toggle} className="flex items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground hover:text-foreground" data-testid="sidebar-collapse-btn">
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" />Collapse</>}
        </button>
      </aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="flex w-72 flex-col p-0"><Brand /><SideNav onNavigate={() => setMobile(false)} /></SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobile(true)} onSearch={() => setCmd(true)} onCapture={() => setCapture(true)} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10"><Outlet /></main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 backdrop-blur lg:hidden" data-testid="mobile-nav">
        {MOBILE.map(([to, label, Icon]) => to ? (
          <NavLink key={label} to={to} end={to === "/"} data-testid={`mobile-nav-${label.toLowerCase()}`}
            className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" />{label}
          </NavLink>
        ) : (
          <button key={label} onClick={() => setCapture(true)} className="flex flex-col items-center py-1.5" data-testid="mobile-nav-capture">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"><Icon className="h-5 w-5" /></span>
          </button>
        ))}
      </nav>
      <CommandMenu open={cmd} onOpenChange={setCmd} onCapture={() => { setCmd(false); setCapture(true); }} />
      <QuickCapture open={capture} onOpenChange={setCapture} />
    </div>
  );
}
