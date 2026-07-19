import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { 
  useGetSuggestions, 
  useUpdateSuggestion, 
  useBulkUpdateSuggestions,
  getGetSuggestionsQueryKey,
  getGetPreviewQueryKey
} from '@workspace/api-client-react';
import type { Suggestion, SuggestionStatus, SuggestionCategory, BulkApplyResult, SuggestionUpdateInputStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X, Edit2, ListChecks, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export function ReviewQueue() {
  const { sessionId } = useSessionStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('pending');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data, isLoading } = useGetSuggestions(sessionId!, {
    query: {
      queryKey: ['suggestions', sessionId],
      enabled: !!sessionId,
    }
  } as any);

  const updateMutation = useUpdateSuggestion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSuggestionsQueryKey(sessionId!) });
        queryClient.invalidateQueries({ queryKey: getGetPreviewQueryKey(sessionId!) });
      }
    }
  } as any);

  const bulkUpdateMutation = useBulkUpdateSuggestions({
    mutation: {
      onSuccess: (res: BulkApplyResult) => {
        queryClient.invalidateQueries({ queryKey: getGetSuggestionsQueryKey(sessionId!) });
        queryClient.invalidateQueries({ queryKey: getGetPreviewQueryKey(sessionId!) });
        toast({
          title: "Bulk update applied",
          description: `Updated ${res.updated_count} suggestions.`,
        });
      }
    }
  } as any);

  const handleUpdate = (id: string, status: SuggestionUpdateInputStatus) => {
    updateMutation.mutate({
      sessionId: sessionId!,
      suggestionId: id,
      data: { status }
    });
  };

  const handleBulkUpdate = (status: 'accepted' | 'rejected') => {
    bulkUpdateMutation.mutate({
      sessionId: sessionId!,
      data: {
        status,
        category: categoryFilter !== 'all' ? categoryFilter : undefined
      }
    });
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading suggestions...</div>;
  }

  const suggestions = data?.suggestions || [];
  
  const filteredSuggestions = suggestions.filter((s: Suggestion) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-card border-l">
      <div className="p-4 border-b space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
          <ListChecks className="w-5 h-5 text-primary" />
          Review Queue
          <Badge variant="secondary" className="ml-2 bg-chart-2/20 text-chart-2 hover:bg-chart-2/30">
            {suggestions.filter((s: Suggestion) => s.status === 'pending').length} pending
          </Badge>
        </h2>

        <Tabs value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="accepted">Accepted</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {['all', 'type_fix', 'format', 'duplicate', 'missing_value', 'validation', 'structure'].map(cat => (
            <Badge 
              key={cat} 
              variant={categoryFilter === cat ? 'default' : 'outline'}
              className="cursor-pointer whitespace-nowrap"
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'all' ? 'All Categories' : cat.replace('_', ' ')}
            </Badge>
          ))}
        </div>

        {statusFilter === 'pending' && filteredSuggestions.length > 0 && (
          <div className="flex gap-2 pt-2 border-t mt-2">
            <Button size="sm" variant="default" className="w-full bg-primary hover:bg-primary/90" onClick={() => handleBulkUpdate('accepted')} disabled={bulkUpdateMutation.isPending}>
              Accept All {categoryFilter !== 'all' && categoryFilter.replace('_', ' ')}
            </Button>
            <Button size="sm" variant="outline" className="w-full text-destructive hover:bg-destructive/10" onClick={() => handleBulkUpdate('rejected')} disabled={bulkUpdateMutation.isPending}>
              Reject All
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredSuggestions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No suggestions found matching filters.
            </div>
          ) : (
            filteredSuggestions.map((s: Suggestion) => (
              <div key={s.id} className="border rounded-lg p-3 bg-card shadow-sm hover:border-primary/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="text-xs uppercase bg-muted">
                    {s.category.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">{s.column_name} {s.row_index !== null && `(Row ${s.row_index})`}</span>
                </div>
                
                <p className="text-sm font-medium mb-3 text-foreground">{s.reason}</p>
                
                <div className="flex items-center gap-3 mb-4 bg-muted/50 p-2 rounded text-sm font-mono">
                  <span className="text-destructive line-through opacity-70">{s.original_value || 'null'}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-chart-3 font-semibold">{s.proposed_value || 'null'}</span>
                </div>

                {s.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-chart-3 border-chart-3/20 hover:bg-chart-3/10" onClick={() => handleUpdate(s.id, 'accepted')} disabled={updateMutation.isPending}>
                      <Check className="w-4 h-4 mr-1" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => handleUpdate(s.id, 'rejected')} disabled={updateMutation.isPending}>
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                ) : (
                  <div className={`text-xs font-medium px-2 py-1 rounded inline-flex items-center ${s.status === 'accepted' ? 'bg-chart-3/10 text-chart-3' : 'bg-destructive/10 text-destructive'}`}>
                    {s.status === 'accepted' ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                    {s.status.toUpperCase()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}