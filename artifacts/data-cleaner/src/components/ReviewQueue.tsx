/**
 * Fix Suggestions — formerly "Review Queue"
 *
 * DataClean scanned your data and found issues it can fix automatically.
 * Each card shows one problem with an original value → proposed fix.
 *
 * ✅ "Apply Fix"  — DataClean rewrites that cell in your data with the proposed value.
 * ❌ "Keep As Is" — DataClean ignores this suggestion; your data stays unchanged.
 *
 * These actions are reversible via the Change History panel until you export.
 */
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
import { CheckCircle2, XCircle, ListChecks, Clock, ChevronDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type StatusFilter = 'pending' | 'applied' | 'skipped' | 'all';

const CATEGORY_INFO: Record<string, { label: string; plain: string; color: string }> = {
  type_fix:      { label: 'Wrong Type',     plain: 'A number or date is stored as text',                       color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  format:        { label: 'Bad Format',     plain: 'Inconsistent spacing, casing, or symbols',                color: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  duplicate:     { label: 'Duplicate Row',  plain: 'This row appears more than once',                         color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  missing_value: { label: 'Missing Value',  plain: 'This cell is empty — a fill strategy was suggested',      color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  validation:    { label: 'Rule Violation', plain: 'This value breaks a quality rule for this column',        color: 'bg-red-500/15 text-red-300 border-red-500/30' },
  structure:     { label: 'Structure',      plain: 'A structural issue was found (extra row, wrong header…)', color: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
};

export function ReviewQueue() {
  const { sessionId, bumpDataGeneration } = useSessionStore();
  const queryClient   = useQueryClient();
  const { toast }     = useToast();

  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('pending');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showHelp,       setShowHelp]       = useState(false);

  const { data, isLoading } = useGetSuggestions(
    sessionId!,
    undefined,
    { query: { enabled: !!sessionId } },
  );

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: getGetSuggestionsQueryKey(sessionId!) });
    queryClient.refetchQueries({ queryKey: getGetPreviewQueryKey(sessionId!) });
  };

  const onError = (err: any) => {
    toast({
      title: 'Something went wrong',
      description: err?.message ?? 'Could not reach the server. Please try again.',
      variant: 'destructive',
    });
  };

  const updateMutation = useUpdateSuggestion({
    mutation: { onSuccess: () => { refreshData(); bumpDataGeneration(); }, onError },
  } as any);

  const bulkMutation = useBulkUpdateSuggestions({
    mutation: {
      onSuccess: (res: BulkApplyResult, vars: any) => {
        refreshData();
        bumpDataGeneration();
        const action = vars.data.status === 'accepted' ? 'applied' : 'skipped';
        // Switch filter so user SEES the items that were just processed — not an empty list
        setStatusFilter(vars.data.status === 'accepted' ? 'applied' : 'skipped');
        toast({
          title: vars.data.status === 'accepted'
            ? `✅ ${res.updated_count} fix${res.updated_count !== 1 ? 'es' : ''} applied to your data`
            : `⏭ ${res.updated_count} suggestion${res.updated_count !== 1 ? 's' : ''} skipped`,
          description: `Switch to "Pending" tab to see what's still waiting.`,
        });
      },
      onError,
    },
  } as any);

  const handle = (id: string, status: 'accepted' | 'rejected') =>
    updateMutation.mutate({ sessionId: sessionId!, suggestionId: id, data: { status } });

  const handleBulk = (status: 'accepted' | 'rejected') =>
    bulkMutation.mutate({
      sessionId: sessionId!,
      data: { status, category: categoryFilter !== 'all' ? categoryFilter : undefined },
    });

  const suggestions: Suggestion[] = data?.suggestions ?? [];
  const pending  = suggestions.filter(s => s.status === 'pending');
  const applied  = suggestions.filter(s => s.status === 'accepted');
  const skipped  = suggestions.filter(s => s.status === 'rejected');

  // Display label mapping: backend uses accepted/rejected, UI shows applied/skipped
  const backendStatus = statusFilter === 'applied' ? 'accepted' : statusFilter === 'skipped' ? 'rejected' : statusFilter;

  const visible = suggestions.filter(s => {
    if (statusFilter !== 'all' && s.status !== backendStatus) return false;
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
    return true;
  });

  const minutesSaved = applied.length * 0.5;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-card border-l items-center justify-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Scanning your data for issues…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-l">

      {/* ── Header ── */}
      <div className="p-4 border-b space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-primary" />
              Fix Suggestions
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              DataClean found {suggestions.length} issue{suggestions.length !== 1 ? 's' : ''} in your data.
              Review each one and decide: apply the fix or leave it.
            </p>
          </div>
          <button
            onClick={() => setShowHelp(v => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="How does this work?"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* Help box */}
        {showHelp && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground space-y-1.5">
            <p><span className="text-emerald-400 font-semibold">✅ Apply Fix</span> — DataClean rewrites the cell with the suggested value. You'll see the change in the data table immediately.</p>
            <p><span className="text-red-400 font-semibold">❌ Keep As Is</span> — DataClean ignores this suggestion. Your original value stays untouched.</p>
            <p><span className="text-foreground font-semibold">Apply All / Skip All</span> — Apply or skip every suggestion in the current category filter at once.</p>
            <p className="text-muted-foreground/70">All changes are recorded in <em>Change History</em> and can be re-applied to future files.</p>
          </div>
        )}

        {/* Summary counts */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Waiting',  count: pending.length,  tab: 'pending' as StatusFilter, color: 'text-yellow-400' },
            { label: 'Applied',  count: applied.length,  tab: 'applied' as StatusFilter, color: 'text-emerald-400' },
            { label: 'Skipped',  count: skipped.length,  tab: 'skipped' as StatusFilter, color: 'text-muted-foreground' },
          ].map(({ label, count, tab, color }) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`rounded-lg p-2 border transition-colors ${
                statusFilter === tab ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted hover:bg-muted/80'
              }`}
            >
              <div className={`text-lg font-bold ${color}`}>{count}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 flex-wrap">
          {(['all', ...Object.keys(CATEGORY_INFO)] as string[]).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors ${
                categoryFilter === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
              }`}
            >
              {cat === 'all' ? 'All types' : CATEGORY_INFO[cat]?.label ?? cat}
            </button>
          ))}
        </div>

        {/* Bulk actions — only when viewing pending */}
        {statusFilter === 'pending' && visible.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm" className="flex-1 h-8 text-xs bg-emerald-700 hover:bg-emerald-600 text-white gap-1"
              onClick={() => handleBulk('accepted')}
              disabled={bulkMutation.isPending}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Apply All {categoryFilter !== 'all' ? `"${CATEGORY_INFO[categoryFilter]?.label}"` : ''}
            </Button>
            <Button
              size="sm" variant="outline"
              className="flex-1 h-8 text-xs text-muted-foreground border-border hover:bg-muted gap-1"
              onClick={() => handleBulk('rejected')}
              disabled={bulkMutation.isPending}
            >
              <XCircle className="w-3.5 h-3.5" />
              Skip All
            </Button>
          </div>
        )}
      </div>

      {/* ── Cards ── */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {visible.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <ListChecks className="w-9 h-9 mx-auto opacity-20" />
              <p className="text-sm text-muted-foreground">
                {statusFilter === 'pending'
                  ? suggestions.length === 0
                    ? 'No issues found — your data looks clean!'
                    : 'All suggestions have been reviewed. 🎉'
                  : `No ${statusFilter} suggestions yet.`}
              </p>
              {statusFilter !== 'pending' && pending.length > 0 && (
                <button
                  className="text-xs text-primary underline"
                  onClick={() => setStatusFilter('pending')}
                >
                  {pending.length} suggestion{pending.length !== 1 ? 's' : ''} still waiting →
                </button>
              )}
            </div>
          ) : (
            visible.map(s => {
              const meta = CATEGORY_INFO[s.category] ?? { label: s.category, plain: '', color: 'bg-muted text-muted-foreground border-border' };
              const isPending = s.status === 'pending';
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border p-3 transition-all space-y-2 ${
                    s.status === 'accepted' ? 'border-emerald-500/25 bg-emerald-500/5' :
                    s.status === 'rejected' ? 'border-border bg-muted/30 opacity-70' :
                    'border-border bg-card'
                  }`}
                >
                  {/* Category chip + location */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      {s.column_name}{s.row_index != null ? ` · row ${s.row_index}` : ' · whole column'}
                    </span>
                  </div>

                  {/* Plain-English reason */}
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.reason}</p>

                  {/* Before → After */}
                  <div className="rounded-lg bg-muted/60 px-3 py-2 flex items-center gap-2 text-xs font-mono overflow-hidden">
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] text-muted-foreground/60 mb-0.5 uppercase tracking-wider">Current value</div>
                      <div className="text-red-400 line-through truncate">{s.original_value ?? <em className="not-italic text-muted-foreground/50">empty</em>}</div>
                    </div>
                    <div className="text-muted-foreground shrink-0 text-base">→</div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-[9px] text-muted-foreground/60 mb-0.5 uppercase tracking-wider">Proposed fix</div>
                      <div className="text-emerald-400 font-semibold truncate">{s.proposed_value ?? <em className="not-italic text-muted-foreground/50">remove cell</em>}</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {isPending ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 h-8 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 gap-1.5"
                        onClick={() => handle(s.id, 'accepted')}
                        disabled={updateMutation.isPending}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Apply Fix
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 h-8 text-xs text-muted-foreground border-border hover:bg-muted gap-1.5"
                        onClick={() => handle(s.id, 'rejected')}
                        disabled={updateMutation.isPending}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Keep As Is
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-1">
                      <span className={`text-[11px] font-semibold flex items-center gap-1 ${
                        s.status === 'accepted' ? 'text-emerald-400' : 'text-muted-foreground'
                      }`}>
                        {s.status === 'accepted' ? <><CheckCircle2 className="w-3 h-3" /> Fix applied to data</> : <><XCircle className="w-3 h-3" /> Kept original</>}
                      </span>
                      <button
                        className="text-[10px] text-primary/60 hover:text-primary underline"
                        onClick={() => handle(s.id, s.status === 'accepted' ? 'rejected' : 'accepted')}
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

      {/* ── Footer KPI ── */}
      {applied.length > 0 && (
        <div className="px-4 py-2.5 border-t bg-emerald-500/5 flex items-center gap-2 text-[11px] text-emerald-400 shrink-0">
          <Clock className="w-3 h-3 shrink-0" />
          {applied.length} fix{applied.length !== 1 ? 'es' : ''} applied — saved ~{minutesSaved < 1 ? '<1' : minutesSaved.toFixed(0)} min of manual editing
        </div>
      )}
    </div>
  );
}
