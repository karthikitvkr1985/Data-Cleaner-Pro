import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetQualityScore, useGetOutliers, useGetAnomalies, useGetConsistencyIssues, useGetSchemaMeanings } from '@workspace/api-client-react';
import { Loader2, TrendingUp, AlertTriangle, CheckCircle, FileSearch } from 'lucide-react';

export function QualityDashboard() {
  const { sessionId } = useSessionStore();

  const { data: quality, isLoading: qLoading } = useGetQualityScore(sessionId!, { query: { enabled: !!sessionId } });
  const { data: outliers } = useGetOutliers(sessionId!, { query: { enabled: !!sessionId } });
  const { data: anomalies } = useGetAnomalies(sessionId!, { query: { enabled: !!sessionId } });
  const { data: consistency } = useGetConsistencyIssues(sessionId!, { query: { enabled: !!sessionId } });
  const { data: meanings } = useGetSchemaMeanings(sessionId!, { query: { enabled: !!sessionId } });

  if (qLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Computing quality scores...</span>
      </div>
    );
  }

  if (!quality) return null;

  const totalOutliers = outliers?.reduce((s, o) => s + o.outlier_count, 0) ?? 0;
  const totalAnomalies = anomalies?.reduce((s, a) => s + a.count, 0) ?? 0;
  const totalConsistency = consistency?.length ?? 0;

  const scoreColor = quality.overall_score >= 90 ? 'text-emerald-500' : quality.overall_score >= 70 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Data Quality Dashboard</h2>
      </div>

      <div className={`text-center p-6 rounded-xl border-2 ${quality.overall_score >= 90 ? 'border-emerald-500/30 bg-emerald-500/5' : quality.overall_score >= 70 ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
        <div className={`text-5xl font-black ${scoreColor}`}>{quality.overall_score}</div>
        <div className="text-sm text-muted-foreground mt-1">Overall Data Quality Score</div>
        {quality.before_after_improvement != null && (
          <div className="text-xs text-emerald-500 mt-2">
            +{quality.before_after_improvement}% improvement from original
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {quality.dimensions.map((dim) => (
          <div key={dim.name} className="bg-card border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{dim.name}</span>
              <span className={`text-lg font-bold ${dim.score != null && dim.score >= 90 ? 'text-emerald-500' : dim.score != null && dim.score >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                {dim.score != null ? dim.score.toFixed(0) : '-'}
              </span>
            </div>
            <div className="w-full bg-muted/50 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all bg-primary"
                style={{ width: `${dim.score ?? 0}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{dim.description}</p>
            {dim.total > 0 && (
              <p className="text-[10px] text-muted-foreground">{dim.passed}/{dim.total} passed</p>
            )}
          </div>
        ))}
      </div>

      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Issues Summary
        </h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xl font-bold text-amber-500">{totalOutliers}</div>
            <div className="text-[10px] text-muted-foreground">Statistical Outliers</div>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xl font-bold text-red-500">{totalAnomalies}</div>
            <div className="text-[10px] text-muted-foreground">Anomalies Detected</div>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xl font-bold text-blue-500">{totalConsistency}</div>
            <div className="text-[10px] text-muted-foreground">Consistency Issues</div>
          </div>
        </div>
      </div>

      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-primary" />
          Schema Meanings
        </h3>
        <div className="space-y-1.5">
          {meanings?.slice(0, 10).map((m) => (
            <div key={m.column_name} className="flex items-center justify-between bg-card border rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-foreground truncate">{m.column_name}</span>
                <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded capitalize">{m.inferred_meaning}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {m.is_primary_key && <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">PK</span>}
                {m.is_foreign_key && <span className="text-[9px] font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">FK</span>}
                <span className="text-[10px] text-muted-foreground">{Math.round(m.confidence * 100)}%</span>
              </div>
            </div>
          ))}
          {(meanings?.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground italic">No schema meanings available. Run analysis first.</p>
          )}
        </div>
      </div>

      <div className="border-t pt-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          Dataset Overview
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="bg-card border rounded-lg p-3">
            <span className="block font-semibold text-foreground">{quality.row_count}</span>
            Rows
          </div>
          <div className="bg-card border rounded-lg p-3">
            <span className="block font-semibold text-foreground">{quality.column_count}</span>
            Columns
          </div>
        </div>
      </div>
    </div>
  );
}
