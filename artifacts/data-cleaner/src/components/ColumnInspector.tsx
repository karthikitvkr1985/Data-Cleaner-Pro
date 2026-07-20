/**
 * Column Details — formerly "Column Inspector"
 *
 * Click any column header in the data table to see:
 *   • What type of data is in this column (numbers, dates, text…)
 *   • How many values are missing
 *   • The spread of values (chart for categories, min/max for numbers)
 *   • Issues found in this column with one-click fixes
 *   • Actions: fill missing values, standardize text casing
 */
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
import { MousePointerClick, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const TYPE_COLORS: Record<string, string> = {
  integer: '#6366f1', float: '#8b5cf6', string: '#0ea5e9', datetime: '#10b981',
  boolean: '#f59e0b', categorical: '#3b82f6',
};

const TYPE_PLAIN: Record<string, string> = {
  integer:    'Whole number',
  float:      'Decimal number',
  string:     'Text',
  datetime:   'Date / Time',
  boolean:    'True / False',
  categorical:'Category (limited set of values)',
};

export function ColumnInspector() {
  const { sessionId, selectedColumn } = useSessionStore();
  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const [missingStrategy, setMissingStrategy] = useState('drop');
  const [nlPreview,       setNlPreview]       = useState<NLCommandPreview | null>(null);
  const [pendingLabel,    setPendingLabel]     = useState('');

  // ── data ──────────────────────────────────────────────────────────────────
  const { data: sessionData } = useGetSession(sessionId!, {
    query: { enabled: !!sessionId },
  } as any);

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

  const updateMutation  = useUpdateSuggestion({ mutation: { onSuccess: invalidate } } as any);
  const submitMutation  = useSubmitNLCommand();
  const confirmMutation = useConfirmNLCommand({
    mutation: {
      onSuccess: () => {
        invalidate();
        setNlPreview(null);
        setPendingLabel('');
        toast({ title: 'Change applied', description: `"${selectedColumn}" column updated.` });
      },
    },
  } as any);

  // ── derived ───────────────────────────────────────────────────────────────
  const column = useMemo(
    () => sessionData?.columns?.find((c: ColumnProfile) => c.name === selectedColumn),
    [sessionData, selectedColumn],
  );

  const colSuggestions: Suggestion[] = useMemo(
    () => (suggestionsData?.suggestions ?? []).filter(
      (s: Suggestion) => s.column_name === selectedColumn,
    ),
    [suggestionsData, selectedColumn],
  );
  const pendingFixes = colSuggestions.filter(s => s.status === 'pending');

  const chartData = useMemo(() => {
    if (!column?.stats?.top_values || typeof column.stats.top_values !== 'object') return [];
    return Object.entries(column.stats.top_values as Record<string, number>)
      .map(([name, count]) => ({ name: String(name).slice(0, 16), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [column?.stats]);

  // ── action helper ─────────────────────────────────────────────────────────
  const runAction = async (instruction: string, label: string) => {
    if (!sessionId) return;
    try {
      setPendingLabel(label);
      const result = await submitMutation.mutateAsync({ sessionId, data: { instruction } });
      setNlPreview(result);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Something went wrong', variant: 'destructive' });
      setPendingLabel('');
    }
  };

  // ── empty state ───────────────────────────────────────────────────────────
  if (!selectedColumn || !column) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-4 border-l bg-card">
        <MousePointerClick className="w-10 h-10 opacity-15" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Column Details</h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-[200px] leading-relaxed">
            Click on any <strong>column header</strong> in the data table to inspect it here.
          </p>
        </div>
      </div>
    );
  }

  const isNumeric     = ['integer', 'float'].includes(column.inferred_type);
  const isCategorical = ['categorical', 'string'].includes(column.inferred_type);
  const nullPct       = column.total_count > 0 ? (column.null_count / column.total_count) * 100 : 0;
  const fillPct       = 100 - nullPct;
  const typeColor     = TYPE_COLORS[column.inferred_type] ?? '#94a3b8';
  const typePlain     = TYPE_PLAIN[column.inferred_type] ?? column.inferred_type;

  return (
    <>
      <div className="flex flex-col h-full bg-card border-l overflow-y-auto">

        {/* ── Column header ── */}
        <div className="p-4 border-b shrink-0">
          <div className="flex items-start gap-3">
            <div className="rounded-lg p-2 shrink-0" style={{ background: typeColor + '20' }}>
              <div className="text-xs font-mono font-bold" style={{ color: typeColor }}>
                {column.inferred_type === 'integer' ? '123' :
                 column.inferred_type === 'float' ? '1.2' :
                 column.inferred_type === 'datetime' ? '📅' :
                 column.inferred_type === 'boolean' ? 'T/F' : 'Aa'}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-foreground font-mono truncate">{column.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{typePlain}</p>
              {pendingFixes.length > 0 && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  {pendingFixes.length} issue{pendingFixes.length > 1 ? 's' : ''} waiting for your review
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto flex-1">

          {/* ── At-a-glance stats ── */}
          <Section title="At a Glance">
            <div className="grid grid-cols-2 gap-2">
              <Tile label="Total rows" value={column.total_count.toLocaleString()} />
              <Tile
                label="Data filled"
                value={`${fillPct.toFixed(0)}%`}
                note={column.null_count > 0 ? `${column.null_count} empty cells` : 'No empty cells'}
                accent={fillPct < 80 ? 'warn' : 'ok'}
              />
              <Tile label="Unique values" value={column.unique_count.toLocaleString()} />
              {isNumeric && column.stats?.mean != null && (
                <Tile label="Average" value={Number(column.stats.mean).toFixed(2)} />
              )}
            </div>
          </Section>

          {/* ── Numeric range ── */}
          {isNumeric && column.stats && (
            <Section title="Value Range">
              <div className="flex items-center gap-2">
                <Tile label="Lowest" value={column.stats.min != null ? String(column.stats.min) : '—'} />
                <div className="text-muted-foreground text-sm">–</div>
                <Tile label="Highest" value={column.stats.max != null ? String(column.stats.max) : '—'} />
              </div>
              {column.stats.std_dev != null && (
                <p className="text-[11px] text-muted-foreground bg-muted rounded px-2 py-1 mt-1.5">
                  Standard deviation: <span className="font-mono font-medium text-foreground">{Number(column.stats.std_dev).toFixed(3)}</span>
                  <span className="ml-1.5 opacity-60">(how spread-out the numbers are)</span>
                </p>
              )}
            </Section>
          )}

          {/* ── Top values chart ── */}
          {chartData.length > 0 && (
            <Section title="Most Common Values">
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -28 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {chartData.map((_: any, i: number) => (
                        <Cell key={i} fill={typeColor} fillOpacity={1 - i * 0.08} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {/* ── Sample values ── */}
          {column.sample_values?.length > 0 && (
            <Section title="Sample Values (first 8)">
              <div className="flex flex-wrap gap-1">
                {column.sample_values.slice(0, 8).map((val: any, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-muted rounded text-[11px] font-mono border border-border/50 text-muted-foreground">
                    {val === null || val === undefined ? <em className="not-italic text-muted-foreground/40">empty</em> : String(val).slice(0, 20)}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* ── Issues found in this column ── */}
          {colSuggestions.length > 0 && (
            <Section title={`Issues Found in This Column (${colSuggestions.length})`}>
              <div className="space-y-2">
                {colSuggestions.map(s => (
                  <div
                    key={s.id}
                    className={`rounded-lg border p-2.5 text-xs transition-colors ${
                      s.status === 'accepted' ? 'border-emerald-500/20 bg-emerald-500/5 opacity-80' :
                      s.status === 'rejected' ? 'border-border bg-muted/20 opacity-50' :
                      'border-border/60 bg-muted/20'
                    }`}
                  >
                    <p className="text-muted-foreground mb-2 leading-relaxed">{s.reason}</p>
                    <div className="flex items-center gap-2 font-mono text-[11px] bg-muted rounded px-2 py-1.5 mb-2">
                      <span className="text-red-400 line-through truncate max-w-[38%]">{s.original_value ?? 'empty'}</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="text-emerald-400 font-semibold truncate max-w-[48%]">{s.proposed_value ?? 'remove'}</span>
                      {s.row_index != null && <span className="ml-auto text-[9px] text-muted-foreground/50 shrink-0">row {s.row_index}</span>}
                    </div>
                    {s.status === 'pending' ? (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline"
                          className="flex-1 h-6 text-[10px] text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 gap-1"
                          onClick={() => updateMutation.mutate({ sessionId: sessionId!, suggestionId: s.id, data: { status: 'accepted' } })}
                          disabled={updateMutation.isPending}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />Apply Fix
                        </Button>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-6 text-[10px] text-muted-foreground border-border hover:bg-muted gap-1"
                          onClick={() => updateMutation.mutate({ sessionId: sessionId!, suggestionId: s.id, data: { status: 'rejected' } })}
                          disabled={updateMutation.isPending}
                        >
                          <XCircle className="w-2.5 h-2.5" />Keep As Is
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-semibold flex items-center gap-1 ${s.status === 'accepted' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          {s.status === 'accepted' ? <><CheckCircle2 className="w-3 h-3" />Applied</> : <>Kept original</>}
                        </span>
                        <button className="text-[10px] text-primary/60 hover:text-primary underline"
                          onClick={() => updateMutation.mutate({ sessionId: sessionId!, suggestionId: s.id, data: { status: s.status === 'accepted' ? 'rejected' : 'accepted' } })}>
                          undo
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Actions ── */}
          <Section title="Column Actions">
            <p className="text-[11px] text-muted-foreground -mt-1 mb-2 leading-relaxed">
              These actions transform the entire column. You'll see a preview before anything changes.
            </p>

            {/* Fill missing values */}
            {column.null_count > 0 && (
              <div className="space-y-1.5 mb-3">
                <label className="text-xs font-medium text-foreground">
                  Fill {column.null_count} empty cell{column.null_count !== 1 ? 's' : ''} with:
                </label>
                <div className="flex gap-2">
                  <Select value={missingStrategy} onValueChange={setMissingStrategy}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drop">Remove those rows entirely</SelectItem>
                      <SelectItem value="mean">The column average</SelectItem>
                      <SelectItem value="median">The middle value</SelectItem>
                      <SelectItem value="mode">The most common value</SelectItem>
                      <SelectItem value="zero">Zero (0)</SelectItem>
                      <SelectItem value="ffill">Copy value from row above</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm" className="h-8 text-xs shrink-0"
                    onClick={() => runAction(`Fill missing values in column "${selectedColumn}" using ${missingStrategy}`, 'Fill missing')}
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending && pendingLabel === 'Fill missing'
                      ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Previewing…</>
                      : 'Preview'}
                  </Button>
                </div>
              </div>
            )}

            {/* Text casing — only for text columns */}
            {isCategorical && (
              <div className="space-y-1.5 mb-3">
                <label className="text-xs font-medium text-foreground">Standardize text capitalisation:</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'UPPERCASE',     cmd: 'uppercase' },
                    { label: 'lowercase',     cmd: 'lowercase' },
                    { label: 'Title Case',    cmd: 'title case' },
                    { label: 'Sentence case', cmd: 'sentence case' },
                  ].map(({ label, cmd }) => (
                    <Button
                      key={cmd} variant="outline" size="sm"
                      className="h-7 text-xs font-mono"
                      onClick={() => runAction(`Convert column "${selectedColumn}" to ${cmd}`, cmd)}
                      disabled={submitMutation.isPending}
                    >
                      {submitMutation.isPending && pendingLabel === cmd
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Trim whitespace */}
            {isCategorical && (
              <Button
                variant="outline" size="sm" className="w-full h-7 text-xs"
                onClick={() => runAction(`Trim whitespace from column "${selectedColumn}"`, 'trim')}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending && pendingLabel === 'trim'
                  ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Previewing…</>
                  : 'Remove extra spaces from all cells'}
              </Button>
            )}
          </Section>

        </div>
      </div>

      {/* ── Preview dialog ── */}
      <Dialog open={!!nlPreview} onOpenChange={open => { if (!open) { setNlPreview(null); setPendingLabel(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Preview Change</DialogTitle>
          </DialogHeader>

          {nlPreview && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">{nlPreview.description}</p>

              {nlPreview.clarification_needed ? (
                <div className="flex gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{nlPreview.clarification_needed}</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    This will change <span className="font-semibold text-foreground">{nlPreview.affected_count} cells</span>.
                    Here's a sample of what will change:
                  </p>
                  <div className="border rounded-lg overflow-hidden text-xs font-mono">
                    <div className="grid grid-cols-2 bg-muted/50 border-b text-[10px] text-muted-foreground">
                      <div className="p-2 text-center border-r">Current value</div>
                      <div className="p-2 text-center">New value</div>
                    </div>
                    {nlPreview.sample_before.slice(0, 5).map((before: any, i: number) => {
                      const after = nlPreview.sample_after[i];
                      const col   = selectedColumn ?? '';
                      const bv    = String(before?.[col] ?? before ?? '');
                      const av    = String(after?.[col] ?? after ?? '');
                      return (
                        <div key={i} className="grid grid-cols-2 border-b last:border-b-0">
                          <div className="p-2 border-r text-red-400/80 truncate bg-red-500/5">{bv || '(empty)'}</div>
                          <div className="p-2 text-emerald-400 truncate bg-emerald-500/5">{av || '(empty)'}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => { setNlPreview(null); setPendingLabel(''); }}>
                  Cancel — don't change anything
                </Button>
                {!nlPreview.clarification_needed && (
                  <Button
                    size="sm"
                    onClick={() => confirmMutation.mutate({ sessionId: sessionId!, data: { preview_id: nlPreview.preview_id } })}
                    disabled={confirmMutation.isPending}
                  >
                    {confirmMutation.isPending
                      ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Applying…</>
                      : 'Yes, apply this change'}
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

// ── Small helpers ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  );
}

function Tile({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: 'ok' | 'warn' }) {
  return (
    <div className="bg-muted rounded-lg p-2.5 border border-border/50 flex-1">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${accent === 'ok' ? 'text-emerald-400' : accent === 'warn' ? 'text-yellow-400' : 'text-foreground'}`}>
        {value}
      </div>
      {note && <div className="text-[10px] text-muted-foreground mt-0.5">{note}</div>}
    </div>
  );
}
