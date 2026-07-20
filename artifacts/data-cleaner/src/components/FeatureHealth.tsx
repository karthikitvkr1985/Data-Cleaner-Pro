/**
 * FeatureHealth — Transparent KPI dashboard.
 *
 * Shows every built feature with a live working-indicator (Green / Yellow / Red)
 * and the concrete value it produces for the user.  This panel communicates
 * "what work this tool just did on your behalf" so the user understands
 * what they're paying for.
 */
import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import {
  useGetSession,
  useGetSuggestions,
  useGetValidationRules,
  useGetRecipe,
  useGetIssuesReport,
} from '@workspace/api-client-react';
import type { ColumnProfile, Suggestion, ValidationRule, RecipeStep } from '@workspace/api-client-react';
import {
  CheckCircle2, XCircle, Loader2, Minus,
  UploadCloud, Braces, Sparkles, Copy, AlertTriangle,
  ShieldCheck, ClipboardList, FileCode2, Zap, Clock,
} from 'lucide-react';

// ── Indicator ─────────────────────────────────────────────────────────────────
type Status = 'ok' | 'warn' | 'error' | 'loading' | 'idle';

function Indicator({ status }: { status: Status }) {
  if (status === 'ok')      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (status === 'warn')    return <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />;
  if (status === 'error')   return <XCircle       className="w-4 h-4 text-red-400 shrink-0" />;
  if (status === 'loading') return <Loader2       className="w-4 h-4 text-primary shrink-0 animate-spin" />;
  return                           <Minus         className="w-4 h-4 text-muted-foreground/40 shrink-0" />;
}

// ── KPI row ───────────────────────────────────────────────────────────────────
function KpiRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/30 last:border-b-0">
      <span className="text-xs text-muted-foreground leading-tight">{label}</span>
      <div className="text-right">
        <div className="text-xs font-semibold text-foreground tabular-nums">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({
  icon: Icon, title, tagline, status, statusLabel, children, value,
}: {
  icon: React.ElementType;
  title: string;
  tagline: string;
  status: Status;
  statusLabel: string;
  children?: React.ReactNode;
  value?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
      status === 'ok'      ? 'border-emerald-500/20 bg-emerald-500/5' :
      status === 'warn'    ? 'border-yellow-500/20 bg-yellow-500/5' :
      status === 'error'   ? 'border-red-500/20 bg-red-500/5' :
      status === 'loading' ? 'border-primary/20 bg-primary/5' :
      'border-border bg-card/50 opacity-60'
    }`}>
      {/* header */}
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${
          status === 'ok'    ? 'bg-emerald-500/15' :
          status === 'warn'  ? 'bg-yellow-500/15' :
          status === 'error' ? 'bg-red-500/15' :
          'bg-muted'
        }`}>
          <Icon className={`w-4 h-4 ${
            status === 'ok'    ? 'text-emerald-400' :
            status === 'warn'  ? 'text-yellow-400' :
            status === 'error' ? 'text-red-400' :
            'text-muted-foreground'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              <Indicator status={status} />
              <span className={`text-[10px] font-medium ${
                status === 'ok'      ? 'text-emerald-400' :
                status === 'warn'    ? 'text-yellow-400' :
                status === 'error'   ? 'text-red-400' :
                status === 'loading' ? 'text-primary' :
                'text-muted-foreground'
              }`}>{statusLabel}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{tagline}</p>
        </div>
      </div>

      {/* kpis */}
      {children && <div className="space-y-0 bg-muted/40 rounded-lg px-3 py-1">{children}</div>}

      {/* user-value note */}
      {value && (
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-background/60 rounded px-2.5 py-1.5 border border-border/40">
          <Zap className="w-3 h-3 shrink-0 mt-0.5 text-primary/60" />
          <span>{value}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function FeatureHealth() {
  const { sessionId } = useSessionStore();
  const enabled = { query: { enabled: !!sessionId } } as any;

  const { data: session,     isLoading: loadingSession }     = useGetSession(sessionId!,    enabled);
  const { data: sugsData,    isLoading: loadingSugs }        = useGetSuggestions(sessionId!, undefined, { query: { enabled: !!sessionId } });
  const { data: rulesData,   isLoading: loadingRules }       = useGetValidationRules(sessionId!, enabled);
  const { data: recipeData,  isLoading: loadingRecipe }      = useGetRecipe(sessionId!,     enabled);
  const { data: issuesData,  isLoading: loadingIssues }      = useGetIssuesReport(sessionId!, enabled);

  // ── computed values ──────────────────────────────────────────────────────
  const columns: ColumnProfile[]   = session?.columns   ?? [];
  const suggestions: Suggestion[]  = sugsData?.suggestions ?? [];
  const rules: ValidationRule[]    = rulesData?.rules    ?? [];
  const steps: RecipeStep[]        = recipeData?.steps   ?? [];
  const issues                     = issuesData?.issues  ?? [];

  const typeMap     = columns.reduce((acc, c) => { acc[c.inferred_type] = (acc[c.inferred_type] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const withMissing = columns.filter(c => c.null_count > 0).length;
  const totalMissing = columns.reduce((s, c) => s + c.null_count, 0);

  const sugsByCategory = suggestions.reduce((acc, s) => { acc[s.category] = (acc[s.category] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const pending   = suggestions.filter(s => s.status === 'pending').length;
  const accepted  = suggestions.filter(s => s.status === 'accepted').length;
  const rejected  = suggestions.filter(s => s.status === 'rejected').length;
  const minutesSaved = accepted * 0.5;

  const activeRules  = rules.filter(r => r.enabled).length;
  const issuesByType = issues.reduce((acc: Record<string, number>, iss: any) => { acc[iss.category] = (acc[iss.category] ?? 0) + 1; return acc; }, {});

  // ── helper: status derivation ────────────────────────────────────────────
  const s = (loading: boolean, hasData: boolean, hasSession: boolean): Status => {
    if (!hasSession) return 'idle';
    if (loading)     return 'loading';
    if (hasData)     return 'ok';
    return 'warn';
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Banner ── */}
      <div className="p-4 border-b bg-gradient-to-r from-primary/10 to-transparent shrink-0">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Feature Health & KPIs
        </h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Every indicator below shows whether a feature is working and what value it produced on your data.
          Green = working & produced results · Yellow = working but nothing found · Grey = no file loaded yet.
        </p>
      </div>

      {/* ── Overall score ── */}
      {sessionId && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-muted/60 border border-border flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="text-xs text-muted-foreground">Estimated time saved on this file</div>
            <div className="text-2xl font-bold text-primary tabular-nums mt-0.5">{minutesSaved.toFixed(0)} min</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Auto-detected issues</div>
            <div className="text-2xl font-bold text-foreground tabular-nums mt-0.5">{suggestions.length}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Columns profiled</div>
            <div className="text-2xl font-bold text-foreground tabular-nums mt-0.5">{columns.length}</div>
          </div>
        </div>
      )}

      {/* ── Feature cards ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* 1 — File Upload & Structure Detection */}
        <FeatureCard
          icon={UploadCloud}
          title="File Upload & Structure Detection"
          tagline="Auto-detects header row, merged cells, and multi-table layouts"
          status={s(loadingSession, columns.length > 0, !!sessionId)}
          statusLabel={!sessionId ? 'No file' : loadingSession ? 'Detecting…' : columns.length > 0 ? 'Working' : 'No data'}
          value="Replaces manual 'find where the table starts' scanning — works even on messy exported reports."
        >
          <KpiRow label="Sheets found" value={session?.sheets?.length ?? '—'} />
          <KpiRow label="Selected sheet" value={session?.selected_sheet ?? '—'} />
          <KpiRow label="Columns detected" value={columns.length > 0 ? columns.length : '—'} />
        </FeatureCard>

        {/* 2 — Column Type Inference */}
        <FeatureCard
          icon={Braces}
          title="Column Type Inference"
          tagline="Assigns integer, float, date, email, URL, boolean, categorical types per column"
          status={s(loadingSession, columns.length > 0, !!sessionId)}
          statusLabel={!sessionId ? 'No file' : loadingSession ? 'Profiling…' : columns.length > 0 ? 'Working' : 'No columns'}
          value="Eliminates manual column-by-column schema review in Excel."
        >
          {Object.entries(typeMap).map(([type, count]) => (
            <KpiRow key={type} label={type} value={`${count} col${count !== 1 ? 's' : ''}`} />
          ))}
          {columns.length === 0 && <KpiRow label="Types detected" value="—" />}
        </FeatureCard>

        {/* 3 — Missing Value Analysis */}
        <FeatureCard
          icon={AlertTriangle}
          title="Missing Value Detection"
          tagline="Identifies empty cells and suggests the right fill strategy per column type"
          status={s(loadingSession, withMissing > 0, !!sessionId)}
          statusLabel={!sessionId ? 'No file' : loadingSession ? 'Scanning…' : withMissing > 0 ? `${withMissing} columns` : 'Clean'}
          value="No more manual COUNTBLANK or Ctrl+G → Go To Special → Blanks."
        >
          <KpiRow label="Columns with missing values" value={withMissing > 0 ? withMissing : '—'} />
          <KpiRow label="Total missing cells" value={totalMissing > 0 ? totalMissing.toLocaleString() : '—'} />
          <KpiRow label="Strategies suggested" value={sugsByCategory['missing_value'] ?? 0} />
        </FeatureCard>

        {/* 4 — Auto Suggestions (Review Queue) */}
        <FeatureCard
          icon={ClipboardList}
          title="Review Queue — Auto Suggestions"
          tagline="Generates fix suggestions for formatting, types, duplicates, missing values, validation"
          status={s(loadingSugs, suggestions.length > 0, !!sessionId)}
          statusLabel={!sessionId ? 'No file' : loadingSugs ? 'Generating…' : suggestions.length > 0 ? `${suggestions.length} found` : 'None found'}
          value="Each suggestion = one manual fix you don't have to make. Accept or reject with one click."
        >
          <KpiRow label="Total suggestions" value={suggestions.length > 0 ? suggestions.length : '—'} />
          <KpiRow label="Pending review" value={pending > 0 ? pending : '—'} />
          <KpiRow label="Accepted" value={accepted > 0 ? accepted : '—'} />
          <KpiRow label="Rejected" value={rejected > 0 ? rejected : '—'} />
          {Object.entries(sugsByCategory).map(([cat, count]) => (
            <KpiRow key={cat} label={`  ↳ ${cat.replace('_', ' ')}`} value={count} />
          ))}
          {minutesSaved > 0 && (
            <KpiRow
              label="Estimated time saved"
              value={<span className="text-emerald-400">{minutesSaved.toFixed(0)} min</span>}
              sub="(0.5 min per accepted fix)"
            />
          )}
        </FeatureCard>

        {/* 5 — Duplicate Detection */}
        <FeatureCard
          icon={Copy}
          title="Duplicate Detection"
          tagline="Finds exact duplicates and near-duplicates (fuzzy matching with rapidfuzz)"
          status={s(loadingSugs, (sugsByCategory['duplicate'] ?? 0) > 0, !!sessionId)}
          statusLabel={!sessionId ? 'No file' : loadingSugs ? 'Checking…' : (sugsByCategory['duplicate'] ?? 0) > 0 ? `${sugsByCategory['duplicate']} found` : 'None found'}
          value="Catches duplicates even when they differ by whitespace, capitalisation, or a single typo."
        >
          <KpiRow label="Duplicate suggestions" value={sugsByCategory['duplicate'] ?? 0} />
        </FeatureCard>

        {/* 6 — Validation Rules */}
        <FeatureCard
          icon={ShieldCheck}
          title="Validation Rules (Auto-generated)"
          tagline="Generates not_null, range, isin, max_length, datetime rules from observed patterns"
          status={s(loadingRules, rules.length > 0, !!sessionId)}
          statusLabel={!sessionId ? 'No file' : loadingRules ? 'Generating…' : rules.length > 0 ? `${activeRules} active` : 'None'}
          value="No manual schema writing — rules are inferred from your actual data, toggleable per column."
        >
          <KpiRow label="Rules generated" value={rules.length > 0 ? rules.length : '—'} />
          <KpiRow label="Active rules" value={activeRules > 0 ? activeRules : '—'} />
          <KpiRow label="Columns covered" value={rules.length > 0 ? new Set(rules.map(r => r.column_name)).size : '—'} />
        </FeatureCard>

        {/* 7 — Issues Report */}
        <FeatureCard
          icon={AlertTriangle}
          title="Issues Report"
          tagline="Comprehensive report of every data quality problem with descriptions and resolutions"
          status={s(loadingIssues, issues.length > 0, !!sessionId)}
          statusLabel={!sessionId ? 'No file' : loadingIssues ? 'Compiling…' : issues.length > 0 ? `${issues.length} issues` : 'Clean'}
          value="Export as JSON — hand to a data engineer or share with stakeholders in one click."
        >
          <KpiRow label="Total issues" value={issues.length > 0 ? issues.length : '—'} />
          {Object.entries(issuesByType).map(([cat, count]) => (
            <KpiRow key={cat} label={`  ↳ ${cat}`} value={count as number} />
          ))}
        </FeatureCard>

        {/* 8 — Cleaning Recipe */}
        <FeatureCard
          icon={FileCode2}
          title="Cleaning Recipe (Audit Trail)"
          tagline="Every accepted change is recorded as a replayable step — apply to next month's export"
          status={s(loadingRecipe, steps.length > 0, !!sessionId)}
          statusLabel={!sessionId ? 'No file' : loadingRecipe ? 'Recording…' : steps.length > 0 ? `${steps.length} steps` : 'Empty'}
          value="Run the same cleaning pipeline on any future file without repeating a single step."
        >
          <KpiRow label="Steps recorded" value={steps.length > 0 ? steps.length : '—'} />
          <KpiRow label="Exportable as JSON" value={sessionId ? '✓ Yes' : '—'} />
          <KpiRow label="Apply to new file" value={sessionId ? '✓ Ready' : '—'} />
        </FeatureCard>

        {/* 9 — NL Command Bar */}
        <FeatureCard
          icon={Sparkles}
          title="Natural Language Commands"
          tagline="Type any instruction in plain English — AI or rule-based parser executes it on the data"
          status={sessionId ? 'ok' : 'idle'}
          statusLabel={sessionId ? 'Ready' : 'No file'}
          value='Try: "Remove duplicates from Email column" or "Fill missing Revenue with 0".'
        >
          <KpiRow label="Commands available" value={sessionId ? 'Unlimited' : '—'} />
          <KpiRow label="Anthropic AI fallback" value="Rule-based parser (no key needed)" />
          <KpiRow label="Changes go into recipe" value={sessionId ? '✓ Yes' : '—'} />
        </FeatureCard>

      </div>

      {/* ── Footer legend ── */}
      <div className="p-3 border-t bg-muted/20 shrink-0 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Working & produced results</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-yellow-400" /> Working but nothing found</span>
        <span className="flex items-center gap-1"><Minus className="w-3 h-3 text-muted-foreground/40" /> No file loaded yet</span>
      </div>
    </div>
  );
}
