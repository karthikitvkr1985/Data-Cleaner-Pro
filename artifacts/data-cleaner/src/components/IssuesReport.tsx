import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetIssuesReport } from '@workspace/api-client-react';
import type { IssueItem } from '@workspace/api-client-react';
import { exportIssuesReport } from '../api/client';
import { ShieldAlert, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export function IssuesReport() {
  const { sessionId } = useSessionStore();
  const { toast } = useToast();

  const { data: report, isLoading } = useGetIssuesReport(sessionId!, {
    query: { enabled: !!sessionId }
  } as any);

  const handleExport = async () => {
    try {
      await exportIssuesReport(sessionId!);
      toast({ title: 'Report Exported', description: 'JSON report downloaded successfully.' });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground border-l h-full">Generating comprehensive issues report...</div>;
  }

  const issues = report?.issues || [];

  return (
    <div className="flex flex-col h-full bg-card border-l">
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
            <ShieldAlert className="w-5 h-5 text-chart-2" />
            Data Issues Report
          </h2>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" /> Export Report
          </Button>
        </div>
        
        {report?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(report.summary).map(([key, val]) => (
              <div key={key} className="bg-muted p-2 rounded border">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{key.replace('_', ' ')}</div>
                <div className="text-xl font-semibold text-foreground">{String(val)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShieldAlert className="w-12 h-12 mb-4 text-chart-3 opacity-50" />
            <p>No critical issues detected in the dataset.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue: IssueItem, i: number) => (
              <div key={i} className="p-3 border rounded-lg shadow-sm bg-card hover:border-chart-2/50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-chart-2" />
                    <Badge variant="outline" className="text-xs uppercase bg-chart-2/10 text-chart-2 border-chart-2/20">
                      {issue.category}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {issue.column_name} {issue.row_index && `[Row ${issue.row_index}]`}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                    {issue.resolution}
                  </span>
                </div>
                <p className="text-sm text-foreground font-medium mb-2">{issue.description}</p>
                {(issue.original_value !== undefined || issue.proposed_value !== undefined) && (
                  <div className="flex items-center gap-3 text-sm font-mono bg-muted/50 p-2 rounded">
                    <span className="text-destructive line-through opacity-70">{issue.original_value || 'null'}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-chart-3 font-semibold">{issue.proposed_value || 'null'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}