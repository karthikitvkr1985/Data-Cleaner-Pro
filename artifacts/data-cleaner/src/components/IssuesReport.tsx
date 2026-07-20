/**
 * Problems Found — formerly "Issues Report"
 *
 * A complete, exportable list of every data quality issue DataClean detected.
 * Unlike the Fix Suggestions panel (where you review one-by-one), this is a
 * summary you can share with stakeholders or hand to a data engineer.
 */
import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetIssuesReport } from '@workspace/api-client-react';
import type { IssueItem } from '@workspace/api-client-react';
import { exportIssuesReport } from '../api/client';
import { AlertOctagon, Download, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

const CATEGORY_PLAIN: Record<string, string> = {
  type_fix:      'Wrong data type',
  format:        'Bad formatting',
  duplicate:     'Duplicate row',
  missing_value: 'Empty cell',
  validation:    'Rule violation',
  structure:     'Structure issue',
};

const CATEGORY_ICON: Record<string, string> = {
  type_fix:      '🔢',
  format:        '✏️',
  duplicate:     '👯',
  missing_value: '⬜',
  validation:    '🚨',
  structure:     '🏗',
};

export function IssuesReport() {
  const { sessionId } = useSessionStore();
  const { toast }     = useToast();

  const { data: report, isLoading } = useGetIssuesReport(sessionId!, {
    query: { enabled: !!sessionId },
  } as any);

  const handleExport = async () => {
    try {
      await exportIssuesReport(sessionId!);
      toast({ title: 'Report downloaded', description: 'JSON file saved — share it or attach to a ticket.' });
    } catch (e: any) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-card border-l items-center justify-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Compiling issues report…</p>
      </div>
    );
  }

  const issues: IssueItem[] = report?.issues ?? [];
  const summary             = report?.summary ?? {};

  // Group by category for the summary
  const byCategory = issues.reduce((acc, iss) => {
    acc[iss.category] = (acc[iss.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full bg-card border-l">

      {/* ── Header ── */}
      <div className="p-4 border-b space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-primary" />
              Problems Found
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Every data issue in one list — ready to share, export, or use for debugging.
            </p>
          </div>
          {issues.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 text-xs gap-1.5 shrink-0">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
          )}
        </div>

        {/* Category breakdown */}
        {issues.length > 0 && (
          <div className="space-y-1">
            {Object.entries(byCategory).map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span>{CATEGORY_ICON[cat] ?? '•'}</span>
                  {CATEGORY_PLAIN[cat] ?? cat}
                </span>
                <span className="font-semibold text-foreground tabular-nums">{count}</span>
              </div>
            ))}
            <div className="border-t pt-1 flex items-center justify-between text-xs font-semibold">
              <span className="text-foreground">Total issues</span>
              <span className="text-foreground">{issues.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Issue list ── */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 opacity-60" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">No problems found</p>
                <p className="text-xs mt-1">Your dataset looks clean on this scan.</p>
              </div>
            </div>
          ) : (
            issues.map((issue: IssueItem, i: number) => (
              <div
                key={i}
                className="p-3 border border-border/60 rounded-xl bg-card space-y-1.5"
              >
                {/* Category + location */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {CATEGORY_ICON[issue.category] ?? '•'} {CATEGORY_PLAIN[issue.category] ?? issue.category}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {issue.column_name}{issue.row_index != null ? ` · row ${issue.row_index}` : ''}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-foreground leading-snug">{issue.description}</p>

                {/* Before → after */}
                {(issue.original_value || issue.proposed_value) && (
                  <div className="flex items-center gap-2 font-mono text-[11px] bg-muted/60 rounded px-2 py-1.5">
                    <span className="text-red-400/80 line-through truncate max-w-[38%]">{issue.original_value ?? 'empty'}</span>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <span className="text-emerald-400 truncate max-w-[48%]">{issue.proposed_value ?? 'remove'}</span>
                  </div>
                )}

                {/* Resolution hint */}
                <p className="text-[10px] text-muted-foreground/70 italic">{issue.resolution}</p>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
