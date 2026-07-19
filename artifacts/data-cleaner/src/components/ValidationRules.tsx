import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetValidationRules, useUpdateValidationRule } from '@workspace/api-client-react';
import type { ValidationRule } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ToggleLeft, ToggleRight, Edit3 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export function ValidationRules() {
  const { sessionId } = useSessionStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useGetValidationRules(sessionId!, {
    query: { enabled: !!sessionId }
  } as any);

  const updateMutation = useUpdateValidationRule({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['validationRules', sessionId] });
        toast({ title: 'Rule Updated', description: 'Validation rule configuration saved.' });
      }
    }
  } as any);

  const handleToggle = (ruleId: string, currentEnabled: boolean) => {
    updateMutation.mutate({
      sessionId: sessionId!,
      ruleId,
      data: { enabled: !currentEnabled }
    });
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading rules...</div>;
  }

  const rules = data?.rules || [];

  return (
    <div className="flex flex-col h-full bg-card border-l">
      <div className="p-4 border-b space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Validation Rules
        </h2>
        <p className="text-sm text-muted-foreground">
          Rules run continuously. Rows violating active rules appear in the Review Queue.
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        {rules.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No rules generated yet.
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule: ValidationRule) => (
              <div key={rule.rule_id} className={`p-4 border rounded-lg shadow-sm transition-all ${rule.enabled ? 'bg-card border-primary/30' : 'bg-muted/30 border-border opacity-70'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="font-mono text-xs bg-muted">{rule.column_name}</Badge>
                      <Badge variant="secondary" className="text-[10px] uppercase bg-primary/10 text-primary">{rule.rule_type}</Badge>
                    </div>
                    <h3 className="text-sm font-medium text-foreground">{rule.description}</h3>
                  </div>
                  <Switch 
                    checked={rule.enabled} 
                    onCheckedChange={() => handleToggle(rule.rule_id, rule.enabled)}
                    disabled={updateMutation.isPending}
                  />
                </div>
                
                {rule.params && Object.keys(rule.params).length > 0 && (
                  <div className="bg-muted p-2 rounded text-xs font-mono text-muted-foreground flex justify-between items-center">
                    <span>{JSON.stringify(rule.params).replace(/[{}"]/g, '')}</span>
                    <Edit3 className="w-3 h-3 cursor-pointer hover:text-primary transition-colors" />
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