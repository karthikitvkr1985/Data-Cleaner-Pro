import React, { useMemo, useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetQualityScore, useGetOutliers, useGetAnomalies, useGetConsistencyIssues, useGetSchemaMeanings } from '@workspace/api-client-react';
import { AlertTriangle, TrendingUp, ChevronDown, ChevronRight, FileSearch, BarChart3, Database, CheckCircle, Search } from 'lucide-react';

const DIM_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500',
];

export function QualityDashboard() {
  const { sessionId } = useSessionStore();
  const [showAllMeanings, setShowAllMeanings] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState('');

  const { data: quality, isLoading: qLoading, isError } = useGetQualityScore(sessionId!, { query: { enabled: !!sessionId } });
  const { data: outliers } = useGetOutliers(sessionId!, { query: { enabled: !!sessionId } });
  const { data: anomalies } = useGetAnomalies(sessionId!, { query: { enabled: !!sessionId } });
  const { data: consistency } = useGetConsistencyIssues(sessionId!, { query: { enabled: !!sessionId } });
  const { data: meanings } = useGetSchemaMeanings(sessionId!, { query: { enabled: !!sessionId } });

  const totalOutliers = useMemo(() => outliers?.reduce((s, o) => s + o.outlier_count, 0) ?? 0, [outliers]);
  const totalAnomalies = useMemo(() => anomalies?.reduce((s, a) => s + a.count, 0) ?? 0, [anomalies]);
  const totalConsistency = consistency?.length ?? 0;

  const filteredMeanings = useMemo(() => {
    if (!meanings) return [];
    if (!schemaSearch.trim()) return meanings;
    const q = schemaSearch.toLowerCase();
    return meanings.filter(m => m.column_name.toLowerCase().includes(q) || m.inferred_meaning.toLowerCase().includes(q));
  }, [meanings, schemaSearch]);

  const scoreColor = quality?.overall_score != null
    ? quality.overall_score >= 90 ? 'text-emerald-500'
      : quality.overall_score >= 70 ? 'text-amber-500'
      : 'text-red-500'
    : 'text-muted-foreground';

  if (!sessionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <div className="rounded-full bg-muted/30 p-4 mb-4">
          <TrendingUp className="w-10 h-10 text-muted-foreground/40" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">No Data Analyzed</h3>
        <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
          Upload a file and run analysis to see quality scores, dimensions, and column-level insights.
        </p>
      </div>
    );
  }

  if (qLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm text-muted-foreground animate-pulse">Computing quality scores...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load quality data. Please re-analyze your file.</p>
        </div>
      </div>
    );
  }

  if (!quality) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <BarChart3 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No quality data yet. Run analysis first.</p>
        </div>
      </div>
    );
  }

  const improvement = quality.before_after_improvement;
  const improvementColor = improvement != null
    ? improvement > 0 ? 'text-emerald-500'
      : improvement < 0 ? 'text-red-500'
      : 'text-muted-foreground'
    : 'text-muted-foreground';
  const improvementIcon = improvement != null
    ? improvement > 0 ? '▲' : improvement < 0 ? '▼' : '─'
    : '─';

  const displayedMeanings = showAllMeanings ? filteredMeanings : filteredMeanings.slice(0, 6);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="w-5 h-5 text-primary shrink-0" />
        <h2 className="text-lg font-bold text-foreground">Data Quality Dashboard</h2>
      </div>

      {/* Overall Score Card */}
      <div className={`relative overflow-hidden rounded-xl border-2 p-6 text-center transition-colors ${
        quality.overall_score >= 90 ? 'border-emerald-500/30 bg-emerald-500/5'
          : quality.overall_score >= 70 ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-red-500/30 bg-red-500/5'
      }`}>
        <div className={`text-6xl font-black tracking-tight ${scoreColor}`}>
          {quality.overall_score.toFixed(1)}
        </div>
        <div className="text-sm text-muted-foreground mt-1">Overall Data Quality Score</div>
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
          <span>{quality.row_count} rows</span>
          <span className="text-border">·</span>
          <span>{quality.column_count} columns</span>
          <span className="text-border">·</span>
          <span>{quality.dimensions.length} dimensions</span>
        </div>
        {improvement != null && (
          <div className={`mt-3 pt-3 border-t border-border/50 flex items-center justify-center gap-1.5 text-xs font-medium ${improvementColor}`}>
            <span>{improvementIcon}</span>
            <span>{improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}% from original</span>
          </div>
        )}
      </div>

      {/* Dimension Scores - Bar Chart */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5" />
          Dimension Scores
        </h3>
        <div className="space-y-2">
          {quality.dimensions.map((dim, i) => {
            const score = dim.score ?? 0;
            const barColor = DIM_COLORS[i % DIM_COLORS.length];
            const textColor = score >= 90 ? 'text-emerald-500' : score >= 70 ? 'text-amber-500' : 'text-red-500';
            return (
              <div key={dim.name} className="bg-card border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${barColor.replace('bg-', 'bg-')}`} />
                    <span className="text-xs font-medium text-foreground truncate">{dim.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-bold ${textColor}`}>{score.toFixed(0)}</span>
                    {dim.total > 0 && (
                      <span className="text-[10px] text-muted-foreground/60 w-14 text-right">{dim.passed}/{dim.total} passed</span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-muted/50 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                {dim.description && (
                  <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{dim.description}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Issues Summary */}
      {(totalOutliers > 0 || totalAnomalies > 0 || totalConsistency > 0) && (
        <div className="border-t pt-4 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Issues Summary
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-amber-500">{totalOutliers}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Outliers</div>
            </div>
            <div className="bg-card border rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-red-500">{totalAnomalies}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Anomalies</div>
            </div>
            <div className="bg-card border rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-blue-500">{totalConsistency}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Consistency</div>
            </div>
          </div>
        </div>
      )}

      {/* Schema Meanings */}
      {meanings && meanings.length > 0 && (
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileSearch className="w-3.5 h-3.5 text-primary" />
              Schema Meanings
              <span className="text-[10px] text-muted-foreground/50 font-normal">({meanings.length})</span>
            </h3>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search columns..."
              value={schemaSearch}
              onChange={e => setSchemaSearch(e.target.value)}
              className="w-full bg-muted/30 border rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="space-y-1">
            {displayedMeanings.map(m => (
              <div key={m.column_name} className="flex items-center justify-between bg-card border rounded-lg px-3 py-2 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate">{m.column_name}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded capitalize">{m.inferred_meaning.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {m.is_primary_key && <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">PK</span>}
                  {m.is_foreign_key && <span className="text-[9px] font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">FK</span>}
                  <div className="flex items-center gap-1">
                    <div className="w-12 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round(m.confidence * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(m.confidence * 100)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filteredMeanings.length > 6 && (
            <button
              onClick={() => setShowAllMeanings(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors mx-auto"
            >
              {showAllMeanings ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {showAllMeanings ? 'Show less' : `Show all ${filteredMeanings.length} columns`}
            </button>
          )}
          {filteredMeanings.length === 0 && schemaSearch && (
            <p className="text-xs text-muted-foreground italic text-center">No columns match "{schemaSearch}"</p>
          )}
        </div>
      )}

      {/* Dataset Overview */}
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-emerald-500" />
          Dataset Overview
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-foreground">{quality.row_count}</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Rows</div>
          </div>
          <div className="bg-card border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-foreground">{quality.column_count}</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Columns</div>
          </div>
          <div className="bg-card border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-foreground">{quality.dimensions.length}</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Dimensions</div>
          </div>
        </div>
      </div>
    </div>
  );
}
