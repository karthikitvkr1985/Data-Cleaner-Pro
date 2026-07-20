import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetCleaningReport } from '@workspace/api-client-react';
import { Loader2, FileText, CheckCircle, AlertTriangle, BarChart3, Download } from 'lucide-react';

export function CleaningReportViewer() {
  const { sessionId } = useSessionStore();

  const { data: report, isLoading } = useGetCleaningReport(sessionId!, { query: { enabled: !!sessionId } });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Generating report...</span>
      </div>
    );
  }

  if (!report) return null;

  const summary = report.workflow_summary;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Cleaning Report</h2>
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date(report.generated_at).toLocaleString()}
        </span>
      </div>

      <div className="bg-card border rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Workflow Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox label="Suggestions" value={summary.total_suggestions} />
          <StatBox label="Applied" value={summary.applied_count} color="text-emerald-500" />
          <StatBox label="Rejected" value={summary.rejected_count} color="text-red-500" />
          <StatBox label="Pending" value={summary.pending_count} color="text-amber-500" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <StatBox label="Operations" value={summary.total_operations} />
          <StatBox label="Outliers" value={summary.outlier_count} color="text-amber-500" />
          <StatBox label="Anomalies" value={summary.anomaly_count} color="text-red-500" />
          <StatBox label="Consistency Issues" value={summary.consistency_issue_count} color="text-blue-500" />
        </div>
        {summary.data_quality_score > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Data Quality Score</span>
            <span className={`text-lg font-bold ${summary.data_quality_score >= 90 ? 'text-emerald-500' : summary.data_quality_score >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
              {summary.data_quality_score.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {report.sections.map((section, i) => (
        <div key={i} className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b pb-1.5">
            {i === 1 && <BarChart3 className="w-4 h-4 text-primary" />}
            {i === 2 && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            {i === 3 && <CheckCircle className="w-4 h-4 text-emerald-500" />}
            {section.title}
          </h3>
          <RenderSectionContent section={section} />
        </div>
      ))}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-2.5 text-center">
      <div className={`text-lg font-bold ${color ?? 'text-foreground'}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function RenderSectionContent({ section }: { section: { title: string; content: Record<string, unknown> } }) {
  try {
    const content = section.content;

    if (section.title === 'Object' || typeof content !== 'object') {
      return <pre className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 overflow-x-auto">{JSON.stringify(content, null, 2)}</pre>;
    }

    const entries = Object.entries(content);

    return (
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="bg-card border rounded-lg p-3">
            <div className="text-xs font-medium text-foreground capitalize mb-1">{key.replace(/_/g, ' ')}</div>
            <div className="text-xs text-muted-foreground">
              {typeof value === 'object' ? (
                <pre className="text-[10px] bg-muted/20 rounded p-2 overflow-x-auto max-h-40">
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                String(value)
              )}
            </div>
          </div>
        ))}
      </div>
    );
  } catch {
    return <pre className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">{JSON.stringify(section.content, null, 2)}</pre>;
  }
}
