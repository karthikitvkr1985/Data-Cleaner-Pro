import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetCleaningReport } from '@workspace/api-client-react';
import { FileText, CheckCircle, AlertTriangle, BarChart3, Download, ChevronDown, ChevronRight, Eye, EyeOff, ClipboardList, RefreshCw } from 'lucide-react';

export function CleaningReportViewer() {
  const { sessionId } = useSessionStore();
  const [rawJson, setRawJson] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});

  const { data: report, isLoading, isError, error } = useGetCleaningReport(sessionId!, { query: { enabled: !!sessionId } });

  const toggleSection = (i: number) => {
    setExpandedSections(prev => ({ ...prev, [i]: !prev[i] }));
  };

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleaning-report-${sessionId?.slice(0, 8) || 'report'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <div className="rounded-full bg-muted/30 p-4 mb-4">
          <FileText className="w-10 h-10 text-muted-foreground/40" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">No Report Available</h3>
        <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
          Upload and analyze a file to generate a comprehensive cleaning report.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm text-muted-foreground animate-pulse">Generating report...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <FileText className="w-8 h-8 text-red-500/60 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Failed to load cleaning report.</p>
        <p className="text-[10px] text-muted-foreground/50 mt-1 max-w-[280px] leading-relaxed">{errMsg}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <RefreshCw className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No report data. Analyze a file first.</p>
      </div>
    );
  }

  const summary = report.workflow_summary;
  const scoreColor = summary.data_quality_score >= 90 ? 'text-emerald-500'
    : summary.data_quality_score >= 70 ? 'text-amber-500'
    : 'text-red-500';
  const scoreBg = summary.data_quality_score >= 90 ? 'bg-emerald-500/5 border-emerald-500/20'
    : summary.data_quality_score >= 70 ? 'bg-amber-500/5 border-amber-500/20'
    : 'bg-red-500/5 border-red-500/20';

  const sectionIcons = [FileText, BarChart3, AlertTriangle, CheckCircle, AlertTriangle, BarChart3, BarChart3, ClipboardList];

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-5">
      {/* Header + download */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="w-5 h-5 text-primary shrink-0" />
          <h2 className="text-lg font-bold text-foreground truncate">Cleaning Report</h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setRawJson(v => !v)}
            className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors"
            title={rawJson ? 'Show formatted view' : 'Show raw JSON'}
          >
            {rawJson ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={downloadJson}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Download className="w-3 h-3" />
            JSON
          </button>
          <span className="text-[10px] text-muted-foreground/50 ml-1">
            {new Date(report.generated_at).toLocaleString()}
          </span>
        </div>
      </div>

      {rawJson ? (
        <pre className="text-[10px] text-muted-foreground/70 bg-muted/20 rounded-lg p-4 overflow-x-auto leading-relaxed font-mono">
          {JSON.stringify(report, null, 2)}
        </pre>
      ) : (
        <>
          {/* Workflow Summary */}
          <div className={`rounded-xl border-2 p-4 space-y-3 ${scoreBg}`}>
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              Workflow Summary
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Suggestions" value={summary.total_suggestions} />
              <StatBox label="Applied" value={summary.applied_count} color="text-emerald-500" />
              <StatBox label="Rejected" value={summary.rejected_count} color="text-red-500" />
              <StatBox label="Pending" value={summary.pending_count} color="text-amber-500" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Operations" value={summary.total_operations} />
              <StatBox label="Outliers" value={summary.outlier_count} color="text-amber-500" />
              <StatBox label="Anomalies" value={summary.anomaly_count} color="text-red-500" />
              <StatBox label="Consistency" value={summary.consistency_issue_count} color="text-blue-500" />
            </div>
            {summary.data_quality_score > 0 && (
              <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Data Quality Score</span>
                <span className={`text-lg font-bold ${scoreColor}`}>
                  {summary.data_quality_score.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Sections */}
          {report.sections.map((section, i) => {
            const Icon = sectionIcons[i % sectionIcons.length];
            const isExpanded = expandedSections[i] !== false;
            const entries = Object.entries(section.content || {});
            return (
              <div key={i} className="space-y-2">
                <button
                  onClick={() => toggleSection(i)}
                  className="w-full flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 hover:text-primary transition-colors group"
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />}
                  <Icon className="w-4 h-4 text-primary/70" />
                  {section.title}
                  <span className="text-[10px] text-muted-foreground/40 font-normal ml-auto">{entries.length} items</span>
                </button>
                {isExpanded && (
                  <RenderSectionContent section={section} />
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-2 text-center">
      <div className={`text-base font-bold ${color ?? 'text-foreground'}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5 truncate">{label}</div>
    </div>
  );
}

function RenderSectionContent({ section }: { section: { title: string; content: Record<string, unknown> } }) {
  try {
    const content = section.content;
    const entries = Object.entries(content);

    if (entries.length === 0) {
      return <p className="text-xs text-muted-foreground/50 italic py-2">No data in this section.</p>;
    }

    return (
      <div className="space-y-2">
        {entries.map(([key, value]) => {
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            return (
              <div key={key} className="bg-card border rounded-lg p-3">
                <div className="text-xs font-semibold text-foreground capitalize mb-2 flex items-center gap-2">
                  {key.replace(/_/g, ' ')}
                  <span className="text-[10px] text-muted-foreground/50 font-normal">({value.length})</span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {value.slice(0, 50).map((item, idx) => (
                    <div key={idx} className="text-[10px] text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed font-mono">
                      {JSON.stringify(item, null, 2)}
                    </div>
                  ))}
                  {value.length > 50 && (
                    <p className="text-[10px] text-muted-foreground/40 italic">... and {value.length - 50} more items</p>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div key={key} className="bg-card border rounded-lg p-3">
              <div className="text-xs font-semibold text-foreground capitalize mb-1.5">{key.replace(/_/g, ' ')}</div>
              <RenderValue value={value} depth={0} />
            </div>
          );
        })}
      </div>
    );
  } catch {
    return (
      <pre className="text-[10px] text-muted-foreground/60 bg-muted/20 rounded-lg p-3 overflow-x-auto leading-relaxed font-mono">
        {JSON.stringify(section.content, null, 2)}
      </pre>
    );
  }
}

function RenderValue({ value, depth }: { value: unknown; depth: number }) {
  if (value == null) {
    return <span className="text-xs text-muted-foreground/50 italic">null</span>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-xs text-muted-foreground">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-xs text-muted-foreground/50 italic">none</span>;
    }
    const isSimple = value.every((v) => typeof v === 'string' || typeof v === 'number');
    if (isSimple) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.slice(0, 30).map((item, i) => (
            <span key={i} className="text-[10px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded">
              {String(item)}
            </span>
          ))}
          {value.length > 30 && <span className="text-[10px] text-muted-foreground/50">+{value.length - 30} more</span>}
        </div>
      );
    }
    if (depth < 2) {
      return (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {value.slice(0, 15).map((item, i) => (
            <div key={i} className="bg-muted/20 rounded p-2">
              {typeof item === 'object' && item !== null
                ? Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[10px]">
                      <span className="font-medium text-muted-foreground/70 w-24 shrink-0 truncate">{k.replace(/_/g, ' ')}:</span>
                      <RenderValue value={v} depth={depth + 1} />
                    </div>
                  ))
                : <span className="text-xs text-muted-foreground">{String(item)}</span>}
            </div>
          ))}
          {value.length > 15 && <div className="text-[10px] text-muted-foreground/50 italic pl-2">... and {value.length - 15} more</div>}
        </div>
      );
    }
    return <pre className="text-[10px] text-muted-foreground/60 bg-muted/20 rounded p-2 overflow-x-auto max-h-32 font-mono">{JSON.stringify(value, null, 2)}</pre>;
  }

  if (typeof value === 'object') {
    if (depth < 2) {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.every(k => typeof obj[k] === 'number' || typeof obj[k] === 'string' || obj[k] == null)) {
        return (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {keys.map(k => (
              <div key={k} className="flex gap-2 text-[11px]">
                <span className="font-medium text-muted-foreground/60">{k.replace(/_/g, ' ')}:</span>
                <span className="text-muted-foreground">{String(obj[k] ?? '—')}</span>
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className="space-y-1">
          {keys.map(k => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="font-medium text-muted-foreground/70 w-28 shrink-0 truncate">{k.replace(/_/g, ' ')}:</span>
              <RenderValue value={obj[k]} depth={depth + 1} />
            </div>
          ))}
        </div>
      );
    }
    return <pre className="text-[10px] text-muted-foreground/60 bg-muted/20 rounded p-2 overflow-x-auto max-h-32 font-mono">{JSON.stringify(value, null, 2)}</pre>;
  }

  return <span className="text-xs text-muted-foreground">{String(value)}</span>;
}
