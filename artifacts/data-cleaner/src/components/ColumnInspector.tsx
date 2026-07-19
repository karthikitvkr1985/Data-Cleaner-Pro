import React, { useMemo } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetSession, useBulkUpdateSuggestions, getGetSuggestionsQueryKey, getGetPreviewQueryKey } from '@workspace/api-client-react';
import type { ColumnProfile } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Database, Search, Type, ToggleLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export function ColumnInspector() {
  const { sessionId, selectedColumn } = useSessionStore();
  const queryClient = useQueryClient();

  const { data: sessionData } = useGetSession(sessionId!, {
    query: { enabled: !!sessionId }
  } as any);

  const bulkMutation = useBulkUpdateSuggestions({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSuggestionsQueryKey(sessionId!) });
        queryClient.invalidateQueries({ queryKey: getGetPreviewQueryKey(sessionId!) });
      }
    }
  } as any);

  const column = useMemo(() => {
    return sessionData?.columns?.find((c: ColumnProfile) => c.name === selectedColumn);
  }, [sessionData, selectedColumn]);

  if (!selectedColumn || !column) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center border-l bg-card">
        <Search className="w-12 h-12 mb-4 opacity-20" />
        <h3 className="text-lg font-medium text-foreground">Column Inspector</h3>
        <p className="text-sm mt-2">Click on a column header in the Data Grid to inspect its profile and apply column-wide transformations.</p>
      </div>
    );
  }

  const isNumeric = column.inferred_type === 'integer' || column.inferred_type === 'float';
  const isCategorical = column.inferred_type === 'categorical' || column.inferred_type === 'string';

  const chartData = useMemo(() => {
    if (column.stats?.top_values && typeof column.stats.top_values === 'object') {
      return Object.entries(column.stats.top_values).map(([name, count]) => ({ name, count })).slice(0, 10);
    }
    return [];
  }, [column.stats]);

  return (
    <div className="flex flex-col h-full bg-card border-l overflow-y-auto">
      <div className="p-4 border-b bg-muted/20">
        <h2 className="text-xl font-bold font-mono text-foreground flex items-center gap-2">
          {column.name}
          <span className="text-xs font-sans px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase tracking-wider">
            {column.inferred_type}
          </span>
        </h2>
      </div>

      <div className="p-4 space-y-6">
        {/* Profile Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Missing Values</div>
            <div className={`text-2xl font-semibold ${column.null_count > 0 ? 'text-chart-2' : 'text-foreground'}`}>
              {column.null_count} <span className="text-sm font-normal text-muted-foreground">({((column.null_count / (column.total_count || 1)) * 100).toFixed(1)}%)</span>
            </div>
          </div>
          <div className="bg-muted p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Unique Values</div>
            <div className="text-2xl font-semibold text-foreground">
              {column.unique_count}
            </div>
          </div>
        </div>

        {/* Stats */}
        {isNumeric && column.stats && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Database className="w-4 h-4 text-primary" /> Numeric Distribution</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Min</span> <span className="font-mono">{column.stats.min as number}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Max</span> <span className="font-mono">{column.stats.max as number}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Mean</span> <span className="font-mono">{(column.stats.mean as number)?.toFixed(2)}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Median</span> <span className="font-mono">{column.stats.median as number}</span></div>
            </div>
          </div>
        )}

        {isCategorical && chartData.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Database className="w-4 h-4 text-primary" /> Top Values</h3>
            <div className="h-48 border rounded-lg p-2 bg-muted/10">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="hsl(var(--primary))" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Sample Values</h3>
          <div className="flex flex-wrap gap-2">
            {column.sample_values.map((val: any, i: number) => (
              <span key={i} className="px-2 py-1 bg-muted rounded text-xs font-mono border text-muted-foreground">
                {val === null ? 'null' : String(val)}
              </span>
            ))}
          </div>
        </div>

        <hr />

        {/* Tools */}
        <div className="space-y-4 pt-2">
          <h3 className="text-sm font-semibold text-foreground">Column Actions</h3>
          
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Missing Value Strategy</Label>
            <div className="flex gap-2">
              <Select defaultValue="drop">
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drop">Drop Rows</SelectItem>
                  <SelectItem value="mean">Fill with Mean</SelectItem>
                  <SelectItem value="median">Fill with Median</SelectItem>
                  <SelectItem value="mode">Fill with Mode</SelectItem>
                  <SelectItem value="ffill">Forward Fill</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="secondary" onClick={() => {}}>Apply</Button>
            </div>
          </div>

          {isCategorical && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Text Casing</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="font-mono text-xs">UPPERCASE</Button>
                <Button variant="outline" size="sm" className="font-mono text-xs">lowercase</Button>
                <Button variant="outline" size="sm" className="font-mono text-xs">Title Case</Button>
                <Button variant="outline" size="sm" className="font-mono text-xs">Sentence case</Button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}