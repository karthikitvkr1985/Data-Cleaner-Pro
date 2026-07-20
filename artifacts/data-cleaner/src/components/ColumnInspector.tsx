import React, { useMemo, useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import {
  useGetSession,
  useGetSuggestions,
  useUpdateSuggestion,
  useSubmitNLCommand,
  useConfirmNLCommand,
  getGetSuggestionsQueryKey,
  getGetPreviewQueryKey,
  getGetRecipeQueryKey,
} from '@workspace/api-client-react';
import type { ColumnProfile, Suggestion, NLCommandPreview } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Search, Check, X, ChevronDown, Zap, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const TYPE_COLORS: Record<string, string> = {
  integer: '#6366f1', float: '#8b5cf6', string: '#0ea5e9', date: '#10b981',
  boolean: '#f59e0b', email: '#ec4899', url: '#14b8a6', phone: '#f97316',
  categorical: '#3b82f6',
};

export function ColumnInspector() {
  const { sessionId, selectedColumn } = useSessionStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [missingStrategy, setMissingStrategy] = useState('drop');
  const [nlPreview, setNlPreview]   = useState<NLCommandPreview | null>(null);
  const [pendingCmd, setPendingCmd] = useState('');

  // ── data ──
  const { data: sessionData } = useGetSession(sessionId!, {
    query: { enabled: !!sessionId },
  } as any);

  // ✅ FIXED: useGetSuggestions(sessionId, params?, options?) — correct 3-arg form
  const { data: suggestionsData } = useGetSuggestions(
    sessionId!,
    undefined,
    { query: { enabled: !!sessionId } },
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetSuggestionsQueryKey(sessionId!) });
    queryClient.invalidateQueries({ queryKey: getGetPreviewQueryKey(sessionId!) });
    queryClient.invalidateQueries({ queryKey: getGetRecipeQueryKey(sessionId!) });
  };

  const updateMutation = useUpdateSuggestion({
    mutation: { onSuccess: invalidate },
  } as any);

  const submitMutation  = useSubmitNLCommand();
  const confirmMutation = useConfirmNLCommand({
    mutation: {
      onSuccess: () => {
        invalidate();
        setNlPreview(null);
        setPendingCmd('');
        toast({ title: 'Transformation applied', description: `Column "${selectedColumn}" updated.` });
      },
    },
  } as any);

  // ── derived ──
  const column = useMemo(() =>
    sessionData?.columns?.find((c: ColumnProfile) => c.name === selectedColumn),
    [sessionData, selectedColumn],
  );

  const columnSuggestions = useMemo(() =>
    (suggestionsData?.suggestions ?? []).filter(
      (s: Suggestion) => s.column_name === selectedColumn,
    ),
    [suggestionsData, selectedColumn],
  );

  const pendingSuggestions  = columnSuggestions.filter((s: Suggestion) => s.status === 'pending');
  const resolvedSuggestions = columnSuggestions.filter((s: Suggestion) => s.status !== 'pending');

  const chartData = useMemo(() => {
    if (!column?.stats?.top_values || typeof column.stats.top_values !== 'object') return [];
    return Object.entries(column.stats.top_values as Record<string, number>)
      .map(([name, count]) => ({ name: String(name).slice(0, 18), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [column?.stats]);

  // ── action helpers ──
  const runNlCommand = async (instruction: string) => {
    if (!sessionId) return;
    try {
      setPendingCmd(instruction);
      const result = await submitMutation.mutateAsync({ sessionId, data: { instruction } });
      setNlPreview(result);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setPendingCmd('');
    }
  };

  const applyMissingStrategy = () =>
    runNlCommand(`Fill missing values in column "${selectedColumn}" using ${missingStrategy}`);

  const applyTextCasing = (casing: string) =>
    runNlCommand(`Convert column "${selectedColumn}" to ${casing}`);

  // ── empty state ──
  if (!selectedColumn || !column) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center border-l bg-card gap-4">
        <Search className="w-12 h-12 opacity-15" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Column Inspector</h3>
          <p className="text-xs mt-1.5 max-w-[220px] leading-relaxed">
            Click any column header in the Data Grid to see its profile, quality issues, and one-click fixes.
          </p>
        </div>
      </div>
    );
  }

  const isNumeric     = ['integer', 'float'].includes(column.inferred_type);
  const isCategorical = ['categorical', 'string'].includes(column.inferred_type);
  const nullPct       = column.total_count > 0 ? (column.null_count / column.total_count) * 100 : 0;
  const typeColor     = TYPE_COLORS[column.inferred_type] ?? '#94a3b8';

  return (
    <>
      <div className="flex flex-col h-full bg-card border-l overflow-y-auto">

        {/* ── Header ── */}
        <div className="p-4 border-b bg-muted/20 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold font-mono text-foreground leading-tight">{column.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ background: typeColor + '20', color: typeColor }}
                >
                  {column.inferred_type}
                </span>
                {pendingSuggestions.length > 0 && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">
                    {pendingSuggestions.length} issue{pendingSuggestions.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-5 flex-1 overflow-y-auto">

          {/* ── Stats grid ── */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Total Rows" value={column.total_count.toLocaleString()} />
            <Stat
              label="Missing"
              value={`${column.null_count} (${nullPct.toFixed(1)}%)`}
              highlight={column.null_count > 0 ? 'warn' : 'ok'}
            />
            <Stat label="Unique Values" value={column.unique_count.toLocaleString()} />
            <Stat label="Fill Rate" value={`${(100 - nullPct).toFixed(1)}%`} highlight={nullPct > 20 ? 'warn' : 'ok'} />
          </div>

          {/* ── Numeric stats ── */}
          {isNumeric && column.stats && (
            <div className="space-y-2">
              <SectionTitle>Distribution</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                {column.stats.min != null && <Stat label="Min" value={String(column.stats.min)} />}
                {column.stats.mean != null && <Stat label="Mean" value={Number(column.stats.mean).toFixed(2)} />}
                {column.stats.max != null && <Stat label="Max" value={String(column.stats.max)} />}
              </div>
              {column.stats.std_dev != null && (
                <div className="text-[11px] text-muted-foreground bg-muted rounded px-2 py-1">
                  Std dev: <span className="font-mono font-medium text-foreground">{Number(column.stats.std_dev).toFixed(3)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Categorical chart ── */}
          {chartData.length > 0 && (
            <div className="space-y-2">
              <SectionTitle>Top Values</SectionTitle>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                      labelStyle={{ color: '#94a3b8' }}
                      itemStyle={{ color: typeColor }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {chartData.map((_: any, i: number) => (
                        <Cell key={i} fill={typeColor} fillOpacity={1 - i * 0.07} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Sample values ── */}
          {column.sample_values?.length > 0 && (
            <div className="space-y-1.5">
              <SectionTitle>Sample Values</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {column.sample_values.slice(0, 8).map((val: any, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-muted rounded text-[11px] font-mono border border-border/60 text-muted-foreground">
                    {val === null || val === undefined ? <em>null</em> : String(val).slice(0, 24)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Pending suggestions for this column ── */}
          {columnSuggestions.length > 0 && (
            <div className="space-y-2">
              <SectionTitle>
                Issues in This Column
                <span className="ml-2 text-[10px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded-full">{pendingSuggestions.length} pending</span>
              </SectionTitle>
              <div className="space-y-1.5">
                {columnSuggestions.map((s: Suggestion) => (
                  <div
                    key={s.id}
                    className={`rounded border p-2.5 text-xs transition-colors ${
                      s.status === 'accepted' ? 'border-emerald-500/20 bg-emerald-500/5 opacity-70' :
                      s.status === 'rejected' ? 'border-red-500/15 opacity-40' :
                      'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{s.category.replace('_', ' ')}</span>
                      {s.row_index != null && <span className="text-[10px] font-mono text-muted-foreground">row {s.row_index}</span>}
                    </div>
                    <p className="text-muted-foreground mb-1.5">{s.reason}</p>
                    <div className="flex items-center gap-2 font-mono text-[11px] bg-muted rounded px-2 py-1 mb-2">
                      <span className="text-red-400 line-through truncate max-w-[40%]">{s.original_value ?? 'null'}</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="text-emerald-400 font-semibold truncate max-w-[50%]">{s.proposed_value ?? 'null'}</span>
                    </div>
                    {s.status === 'pending' ? (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline"
                          className="flex-1 h-6 text-[10px] text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                          onClick={() => updateMutation.mutate({ sessionId: sessionId!, suggestionId: s.id, data: { status: 'accepted' } })}
                          disabled={updateMutation.isPending}
                        ><Check className="w-2.5 h-2.5 mr-1" />Accept</Button>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-6 text-[10px] text-red-400 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => updateMutation.mutate({ sessionId: sessionId!, suggestionId: s.id, data: { status: 'rejected' } })}
                          disabled={updateMutation.isPending}
                        ><X className="w-2.5 h-2.5 mr-1" />Reject</Button>
                      </div>
                    ) : (
                      <span className={`text-[10px] font-semibold ${s.status === 'accepted' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Column Actions (wired up) ── */}
          <div className="space-y-3 pt-1 border-t">
            <SectionTitle>Column Actions</SectionTitle>

            {/* Missing value strategy */}
            {column.null_count > 0 && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground font-medium">
                  Handle {column.null_count} Missing Values
                </label>
                <div className="flex gap-2">
                  <Select value={missingStrategy} onValueChange={setMissingStrategy}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drop">Drop rows</SelectItem>
                      <SelectItem value="mean">Fill with mean</SelectItem>
                      <SelectItem value="median">Fill with median</SelectItem>
                      <SelectItem value="mode">Fill with mode</SelectItem>
                      <SelectItem value="zero">Fill with 0</SelectItem>
                      <SelectItem value="ffill">Forward fill</SelectItem>
                      <SelectItem value="bfill">Backward fill</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm" className="h-8 text-xs"
                    onClick={applyMissingStrategy}
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending && pendingCmd.includes('missing') ? 'Running…' : 'Apply'}
                  </Button>
                </div>
              </div>
            )}

            {/* Text casing */}
            {isCategorical && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground font-medium">Standardize Text Casing</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'UPPERCASE',      cmd: 'uppercase' },
                    { label: 'lowercase',      cmd: 'lowercase' },
                    { label: 'Title Case',     cmd: 'title case' },
                    { label: 'Sentence case',  cmd: 'sentence case' },
                  ].map(({ label, cmd }) => (
                    <Button
                      key={cmd} variant="outline" size="sm"
                      className="h-7 text-xs font-mono"
                      onClick={() => applyTextCasing(cmd)}
                      disabled={submitMutation.isPending}
                    >
                      {submitMutation.isPending && pendingCmd.includes(cmd) ? '…' : label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Trim whitespace */}
            {isCategorical && (
              <Button
                variant="outline" size="sm" className="w-full h-7 text-xs"
                onClick={() => runNlCommand(`Trim whitespace from column "${selectedColumn}"`)}
                disabled={submitMutation.isPending}
              >
                <Zap className="w-3 h-3 mr-1.5" />
                Trim Whitespace
              </Button>
            )}
          </div>

        </div>
      </div>

      {/* ── NL preview confirmation dialog ── */}
      <Dialog open={!!nlPreview} onOpenChange={open => { if (!open) { setNlPreview(null); setPendingCmd(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Zap className="w-4 h-4 text-primary" /> Preview Transformation
            </DialogTitle>
          </DialogHeader>
          {nlPreview && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{nlPreview.description}</p>

              {nlPreview.clarification_needed ? (
                <div className="flex gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded p-3 text-xs text-yellow-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {nlPreview.clarification_needed}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Sample rows affected</span>
                    <span className="font-semibold text-foreground">{nlPreview.affected_count} total</span>
                  </div>
                  <div className="border rounded overflow-hidden text-xs font-mono">
                    <div className="grid grid-cols-2 bg-muted/50 border-b">
                      <div className="p-2 text-center border-r text-muted-foreground">Before</div>
                      <div className="p-2 text-center text-primary">After</div>
                    </div>
                    {nlPreview.sample_before.slice(0, 5).map((before: any, i: number) => {
                      const after = nlPreview.sample_after[i];
                      const col   = selectedColumn ?? '';
                      return (
                        <div key={i} className="grid grid-cols-2 border-b last:border-b-0">
                          <div className="p-2 border-r text-red-400/80 truncate bg-red-500/5">{String(before?.[col] ?? before ?? '')}</div>
                          <div className="p-2 text-emerald-400 truncate bg-emerald-500/5">{String(after?.[col] ?? after ?? '')}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => { setNlPreview(null); setPendingCmd(''); }}>Cancel</Button>
                {!nlPreview.clarification_needed && (
                  <Button
                    size="sm"
                    onClick={() => confirmMutation.mutate({ sessionId: sessionId!, data: { preview_id: nlPreview.preview_id } })}
                    disabled={confirmMutation.isPending}
                  >
                    {confirmMutation.isPending ? 'Applying…' : 'Confirm & Apply'}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: 'ok' | 'warn' }) {
  return (
    <div className="bg-muted rounded-lg p-2.5 border border-border/60">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${
        highlight === 'ok' ? 'text-emerald-400' :
        highlight === 'warn' ? 'text-yellow-400' :
        'text-foreground'
      }`}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">{children}</div>;
}
