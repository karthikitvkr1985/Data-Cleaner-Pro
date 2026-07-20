import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import {
  useGetSuggestions,
  useUpdateSuggestion,
  useBulkUpdateSuggestions,
  getGetSuggestionsQueryKey,
  getGetPreviewQueryKey,
} from '@workspace/api-client-react';
import type { Suggestion, BulkApplyResult } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X, ListChecks, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

// ─── Category labels ──────────────────────────────────────────────────────────
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  type_fix:      { label: 'Type Fix',       color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  format:        { label: 'Format',         color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  duplicate:     { label: 'Duplicate',      color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  missing_value: { label: 'Missing Value',  color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  validation:    { label: 'Validation',     color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  structure:     { label: 'Structure',      color: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
};

// Estimated minutes saved per accepted suggestion (manual lookup + edit)
const MINUTES_PER_FIX = 0.5;

export function ReviewQueue() {
  const { sessionId } = useSessionStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('pending');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // ✅ FIXED: useGetSuggestions(sessionId, params?, options?) — params is 2nd arg, not options
  const { data, isLoading } = useGetSuggestions(
    sessionId!,
    undefined,
    { query: { enabled: !!sessionId } },
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetSuggestionsQueryKey(sessionId!) });
    queryClient.invalidateQueries({ queryKey: getGetPreviewQueryKey(sessionId!) });
  };

  const updateMutation = useUpdateSuggestion({
    mutation: { onSuccess: invalidate },
  } as any);

  const bulkUpdateMutation = useBulkUpdateSuggestions({
    mutation: {
      onSuccess: (res: BulkApplyResult) => {
        invalidate();
        toast({ title: 'Bulk update applied', description: `Updated ${res.updated_count} suggestion${res.updated_count !== 1 ? 's' : ''}.` });
      },
    },
  } as any);

  const handleUpdate = (id: string, status: 'accepted' | 'rejected') => {
    updateMutation.mutate({ sessionId: sessionId!, suggestionId: id, data: { status } });
  };

  const handleBulkUpdate = (status: 'accepted' | 'rejected') => {
    bulkUpdateMutation.mutate({
      sessionId: sessionId!,
      data: { status, category: categoryFilter !== 'all' ? categoryFilter : undefined },
    });
  };

  const suggestions = data?.suggestions ?? [];
  const pending   = suggestions.filter((s: Suggestion) => s.status === 'pending');
  const accepted  = suggestions.filter((s: Suggestion) => s.status === 'accepted');
  const rejected  = suggestions.filter((s: Suggestion) => s.status === 'rejected');
  const minutesSaved = accepted.length * MINUTES_PER_FIX;

  const filteredSuggestions = suggestions.filter((s: Suggestion) => {
    if (statusFilter !== 'all'  && s.status !== statusFilter)     return false;
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-card border-l items-center justify-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm">Loading suggestions…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-l">
      {/* ── Header ── */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2 text-foreground">
            <ListChecks className="w-5 h-5 text-primary" />
            Review Queue
          </h2>
          {/* Time-saved KPI */}
          {minutesSaved > 0 && (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full text-xs font-medium">
              <Zap className="w-3 h-3" />
              {minutesSaved.toFixed(0)} min saved
            </div>
          )}
        </div>

        {/* Summary counts */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted rounded-lg p-2">
            <div className="text-lg font-bold text-yellow-400">{pending.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</div>
          </div>
          <div className="bg-muted rounded-lg p-2">
            <div className="text-lg font-bold text-emerald-400">{accepted.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Accepted</div>
          </div>
          <div className="bg-muted rounded-lg p-2">
            <div className="text-lg font-bold text-red-400">{rejected.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Rejected</div>
          </div>
        </div>

        {/* Status filter */}
        <Tabs value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="accepted">Accepted</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Category chips */}
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'type_fix', 'format', 'duplicate', 'missing_value', 'validation', 'structure'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors ${
                categoryFilter === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              {cat === 'all' ? 'All' : (CATEGORY_META[cat]?.label ?? cat)}
            </button>
          ))}
        </div>

        {/* Bulk actions */}
        {statusFilter === 'pending' && filteredSuggestions.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm" variant="default" className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              onClick={() => handleBulkUpdate('accepted')}
              disabled={bulkUpdateMutation.isPending}
            >
              <Check className="w-3 h-3 mr-1" /> Accept All
            </Button>
            <Button
              size="sm" variant="outline" className="flex-1 h-8 text-red-400 border-red-500/30 hover:bg-red-500/10 text-xs"
              onClick={() => handleBulkUpdate('rejected')}
              disabled={bulkUpdateMutation.isPending}
            >
              <X className="w-3 h-3 mr-1" /> Reject All
            </Button>
          </div>
        )}
      </div>

      {/* ── Suggestion cards ── */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {filteredSuggestions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">
                {statusFilter === 'pending'
                  ? 'No pending suggestions — all reviewed!'
                  : 'No suggestions match the current filters.'}
              </p>
            </div>
          ) : (
            filteredSuggestions.map((s: Suggestion) => {
              const meta = CATEGORY_META[s.category] ?? { label: s.category, color: 'bg-muted text-muted-foreground border-border' };
              return (
                <div
                  key={s.id}
                  className={`rounded-lg border p-3 transition-all ${
                    s.status === 'accepted' ? 'border-emerald-500/20 bg-emerald-500/5' :
                    s.status === 'rejected' ? 'border-red-500/20 bg-red-500/5 opacity-60' :
                    'border-border bg-card hover:border-primary/40'
                  }`}
                >
                  {/* Category + location */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {s.column_name}{s.row_index != null ? ` · row ${s.row_index}` : ''}
                    </span>
                  </div>

                  {/* Reason */}
                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{s.reason}</p>

                  {/* Before → After */}
                  <div className="flex items-center gap-2 bg-muted/60 rounded px-2 py-1.5 text-xs font-mono mb-2">
                    <span className="text-red-400 line-through max-w-[35%] truncate">{s.original_value ?? 'null'}</span>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <span className="text-emerald-400 font-semibold max-w-[55%] truncate">{s.proposed_value ?? 'null'}</span>
                  </div>

                  {/* Actions */}
                  {s.status === 'pending' ? (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 h-7 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        onClick={() => handleUpdate(s.id, 'accepted')}
                        disabled={updateMutation.isPending}
                      >
                        <Check className="w-3 h-3 mr-1" /> Accept
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                        onClick={() => handleUpdate(s.id, 'rejected')}
                        disabled={updateMutation.isPending}
                      >
                        <X className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-semibold uppercase flex items-center gap-1 ${s.status === 'accepted' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.status === 'accepted' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {s.status}
                      </span>
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        onClick={() => handleUpdate(s.id, s.status === 'accepted' ? 'rejected' : 'accepted')}
                      >
                        undo
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* ── Footer: value prop ── */}
      {suggestions.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/20 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3 shrink-0" />
          {suggestions.length} data issues found automatically — each one replaced a manual cell-by-cell review.
        </div>
      )}
    </div>
  );
}
