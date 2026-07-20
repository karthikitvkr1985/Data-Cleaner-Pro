import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetAuditLog } from '@workspace/api-client-react';
import { Loader2, ClipboardList, Database, CheckSquare, AlertTriangle } from 'lucide-react';

export function AuditLogViewer() {
  const { sessionId } = useSessionStore();

  const { data: entries, isLoading } = useGetAuditLog(sessionId!, { query: { enabled: !!sessionId } });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Building audit log...</span>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <ClipboardList className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No audit entries yet. Changes will be recorded here.</p>
      </div>
    );
  }

  const getIcon = (actionType: string) => {
    switch (actionType) {
      case 'recipe_step': return <Database className="w-3.5 h-3.5 text-primary" />;
      case 'suggestion': return <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />;
      case 'data_summary': return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
      default: return <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <ClipboardList className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Audit Log</h2>
        <span className="text-xs text-muted-foreground ml-auto">{entries.length} entries</span>
      </div>

      <div className="space-y-1">
        {[...entries].reverse().map((entry) => (
          <div key={entry.entry_id} className="bg-card border rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              {getIcon(entry.action_type)}
              <span className="text-xs font-medium text-foreground capitalize">{entry.action_type.replace(/_/g, ' ')}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{entry.description}</p>
            {entry.details && Object.keys(entry.details).length > 0 && (
              <details className="mt-1">
                <summary className="text-[10px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">Details</summary>
                <pre className="mt-1 text-[9px] text-muted-foreground/40 bg-muted/30 rounded p-2 overflow-x-auto max-h-32">
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
