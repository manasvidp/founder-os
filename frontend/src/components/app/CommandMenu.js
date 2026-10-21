import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Sparkles, CalendarClock, FileSearch } from "lucide-react";
import { http } from "@/lib/api";
import { REF_ROUTES } from "@/lib/fmt";
import { NAV } from "./Shell";

export default function CommandMenu({ open, onOpenChange, onCapture }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => { http.get("/search", { params: { q } }).then((r) => setResults(r.data)).catch(() => setResults([])); }, 180);
    return () => clearTimeout(t);
  }, [q]);
  const go = (to) => { onOpenChange(false); setQ(""); nav(to); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tasks, goals, projects, people, notes…" value={q} onValueChange={setQ} data-testid="command-input" />
      <CommandList data-testid="command-list">
        <CommandEmpty>No results.</CommandEmpty>
        {results.length > 0 && (
          <CommandGroup heading="Records">
            {results.map((r) => (
              <CommandItem key={`${r.type}-${r.id}`} value={`${r.type} ${r.title} ${r.id}`} onSelect={() => go(REF_ROUTES[r.type](r.id))} data-testid={`search-result-${r.id}`}>
                <FileSearch className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{r.title}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{r.type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={onCapture} data-testid="cmd-capture"><Plus className="mr-2 h-4 w-4" />Quick capture</CommandItem>
          <CommandItem onSelect={() => go("/calendar?planner=1")} data-testid="cmd-plan-day"><CalendarClock className="mr-2 h-4 w-4" />Plan my day</CommandItem>
          <CommandItem onSelect={() => go("/chief")} data-testid="cmd-ai"><Sparkles className="mr-2 h-4 w-4" />Ask the Chief of Staff</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Go to">
          {NAV.flatMap((g) => g.items).map(([to, label, Icon]) => (
            <CommandItem key={to} onSelect={() => go(to)} value={`go ${label}`}><Icon className="mr-2 h-4 w-4" />{label}</CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
