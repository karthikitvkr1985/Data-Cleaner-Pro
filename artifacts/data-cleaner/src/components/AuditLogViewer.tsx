import React, { useMemo, useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetAuditLog } from '@workspace/api-client-react';
import { ClipboardList, Database, CheckSquare, AlertTriangle, Search, Filter } from 'lucide-react';

const ACTION_ICONS: Record<string, React.ElementType> = {
  recipe_step: Database,
  suggestion: CheckSquare,
  data_summary: AlertTriangle,
};

const ACTION_COLORS: Record<string, string> = {
  recipe_step: 'text-primary',
  suggestion: 'text-emerald-500',
  data_summary: 'text-amber-500',
};

const ACTION_BG: Record<string, string> = {
  recipe_step: 'bg-primary/10',
  suggestion: 'bg-emerald-500/10',
  data_summary: 'bg-amber-500/10',
};

type ActionFilter = 'all' | 'recipe_step' | 'suggestion' | 'data_summary';

export function AuditLogViewer() {
  const { sessionId } = useSessionStore();
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: entries, isLoading, isError, error } = useGetAuditLog(sessionId!, { query: { enabled: !!sessionId } });

  const filtered = useMemo(() => {
    if (!entries) return [];
    let result = entries;
    if (actionFilter !== 'all') {
      result = result.filter(e => e.action_type === actionFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.module.toLowerCase().includes(q) ||
        e.action_type.toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, actionFilter, searchQuery]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const entry of filtered) {
      const date = new Date(entry.timestamp).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    }
    return groups;
  }, [filtered]);

  const actionCounts = useMemo(() => {
    if (!entries) return { recipe_step: 0, suggestion: 0, data_summary: 0 };
    return {
      recipe_step: entries.filter(e => e.action_type === 'recipe_step').length,
      suggestion: entries.filter(e => e.action_type === 'suggestion').length,
      data_summary: entries.filter(e => e.action_type === 'data_summary').length,
    };
  }, [entries]);

  if (!sessionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <div className="rounded-full bg-muted/30 p-4 mb-4">
          <ClipboardList className="w-10 h-10 text-muted-foreground/40" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">No Session Active</h3>
        <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
          Upload a file and start working — every operation will be recorded here.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm text-muted-foreground animate-pulse">Building audit log...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <ClipboardList className="w-8 h-8 text-red-500/60 mb-2" />
        <p className="text-sm text-muted-foreground">Failed to load audit log.</p>
        <p className="text-[10px] text-muted-foreground/50 mt-1 max-w-[280px] leading-relaxed">{errMsg}</p>
      </div>
    );
  }

  const dateGroups = Object.entries(groupedByDate);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ClipboardList className="w-5 h-5 text-primary shrink-0" />
        <h2 className="text-lg font-bold text-foreground">Audit Log</h2>
        {entries && (
          <span className="text-xs text-muted-foreground ml-auto">{entries.length} entries</span>
        )}
      </div>

      {/* Summary bar */}
      {entries && entries.length > 0 && (
        <div className="flex gap-2 text-[10px]">
          {(['recipe_step', 'suggestion', 'data_summary'] as const).map(type => {
            const count = actionCounts[type];
            const Icon = ACTION_ICONS[type] || ClipboardList;
            const color = ACTION_COLORS[type] || 'text-muted-foreground';
            const bg = ACTION_BG[type] || 'bg-muted/30';
            return (
              <button
                key={type}
                onClick={() => setActionFilter(actionFilter === type ? 'all' : type)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-colors ${
                  actionFilter === type ? `${bg} ${color}` : 'bg-muted/20 text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span className="font-medium">{type.replace(/_/g, ' ')}</span>
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      {entries && entries.length > 0 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search audit log..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-muted/30 border rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      )}

      {/* Entry list */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="w-8 h-8 text-muted-foreground/30 mb-2" />
          {entries && entries.length > 0 ? (
            <p className="text-xs text-muted-foreground">No entries match your filter.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No audit entries yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Changes will be recorded here automatically.</p>
            </>
          )}
        </div>
      )}

      {/* Grouped by date */}
      <div className="space-y-4">
        {dateGroups.map(([date, group]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">{date}</span>
              <span className="text-[10px] text-muted-foreground/40">({group.length})</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <div className="space-y-1">
              {[...group].reverse().map(entry => {
                const Icon = ACTION_ICONS[entry.action_type] || ClipboardList;
                const iconColor = ACTION_COLORS[entry.action_type] || 'text-muted-foreground';
                const time = new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return (
                  <div key={entry.entry_id} className="bg-card border rounded-lg p-3 space-y-1 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded ${ACTION_BG[entry.action_type] || 'bg-muted/30'}`}>
                        <Icon className={`w-3 h-3 ${iconColor}`} />
                      </div>
                      <span className="text-xs font-medium text-foreground capitalize">{entry.action_type.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto">{time}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed ml-7">{entry.description}</p>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <details className="ml-7 mt-1">
                        <summary className="text-[10px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground transition-colors">
                          View details
                        </summary>
                        <pre className="mt-1 text-[9px] text-muted-foreground/50 bg-muted/20 rounded p-2 overflow-x-auto max-h-32 leading-relaxed">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
