/**
 * Quality Rules — formerly "Validation Rules"
 *
 * DataClean automatically generates rules from your data's own patterns:
 *  • "This column should never be empty"
 *  • "Values in Revenue should be between 0 and 50000"
 *  • "Status must be one of: Active, Inactive, Pending"
 *
 * Toggle rules on or off. When a rule is ON, any row that breaks it
 * appears automatically in Fix Suggestions.
 */
import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import {
  useGetValidationRules,
  useUpdateValidationRule,
  getGetValidationRulesQueryKey,
} from '@workspace/api-client-react';
import type { ValidationRule } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

const RULE_PLAIN: Record<string, (rule: ValidationRule) => string> = {
  not_null:   () => 'This column must not have empty cells',
  range:      (r) => {
    const { min, max } = r.params as any ?? {};
    if (min != null && max != null) return `Values must be between ${min} and ${max}`;
    if (min != null) return `Values must be ≥ ${min}`;
    if (max != null) return `Values must be ≤ ${max}`;
    return 'Values must be within a numeric range';
  },
  isin:       (r) => {
    const vals = (r.params as any)?.values ?? [];
    const shown = vals.slice(0, 4).join(', ');
    return `Values must be one of: ${shown}${vals.length > 4 ? ` (+${vals.length - 4} more)` : ''}`;
  },
  max_length: (r) => `Text must be ${(r.params as any)?.max ?? '?'} characters or shorter`,
  datetime:   (r) => `Must match date format: ${(r.params as any)?.format ?? 'auto-detected'}`,
  regex:      (r) => `Must match pattern: ${(r.params as any)?.pattern ?? ''}`,
};

const RULE_TYPE_LABEL: Record<string, string> = {
  not_null:   'Must be filled',
  range:      'Number range',
  isin:       'Allowed values',
  max_length: 'Max length',
  datetime:   'Date format',
  regex:      'Pattern',
};

export function QualityRules() {
  const { sessionId } = useSessionStore();
  const queryClient   = useQueryClient();
  const { toast }     = useToast();

  const { data, isLoading } = useGetValidationRules(sessionId!, {
    query: { enabled: !!sessionId },
  } as any);

  const updateMutation = useUpdateValidationRule({
    mutation: {
      onSuccess: (_: any, vars: any) => {
        queryClient.invalidateQueries({ queryKey: getGetValidationRulesQueryKey(sessionId!) });
        toast({
          title: vars.data.enabled ? 'Rule turned on' : 'Rule turned off',
          description: vars.data.enabled
            ? 'Violations will now appear in Fix Suggestions.'
            : 'This rule is paused — violations will be hidden.',
        });
      },
    },
  } as any);

  const rules: ValidationRule[] = data?.rules ?? [];
  const onCount  = rules.filter(r => r.enabled).length;
  const offCount = rules.length - onCount;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-card border-l items-center justify-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Generating rules from your data…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-l">

      {/* ── Header ── */}
      <div className="p-4 border-b space-y-3 shrink-0">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Quality Rules
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            DataClean created these rules automatically by studying your data.
            When a rule is <strong className="text-foreground">ON</strong>, any row that breaks it
            is flagged in <em>Fix Suggestions</em>.
          </p>
        </div>

        {/* Help box */}
        <div className="bg-muted/40 border border-border/60 rounded-lg p-3 text-[11px] text-muted-foreground space-y-1">
          <p><span className="text-foreground font-medium">Toggle ON</span> — violations appear in Fix Suggestions so you can review them.</p>
          <p><span className="text-foreground font-medium">Toggle OFF</span> — rule is paused; violations are hidden. Your data is unchanged either way.</p>
        </div>

        {rules.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted rounded-lg py-2">
              <div className="text-base font-bold text-foreground">{rules.length}</div>
              <div className="text-[10px] text-muted-foreground">Generated</div>
            </div>
            <div className="bg-muted rounded-lg py-2">
              <div className="text-base font-bold text-emerald-400">{onCount}</div>
              <div className="text-[10px] text-muted-foreground">Active</div>
            </div>
            <div className="bg-muted rounded-lg py-2">
              <div className="text-base font-bold text-muted-foreground/50">{offCount}</div>
              <div className="text-[10px] text-muted-foreground">Paused</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Rules ── */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <ShieldAlert className="w-9 h-9 opacity-20" />
              <div className="text-center">
                <p className="text-sm font-medium">No rules yet</p>
                <p className="text-xs mt-1 max-w-[200px]">Upload and analyze a file — DataClean will infer rules automatically.</p>
              </div>
            </div>
          ) : (
            rules.map((rule: ValidationRule) => {
              const plainFn   = RULE_PLAIN[rule.rule_type];
              const plainText = plainFn ? plainFn(rule) : rule.description;
              const typeLabel = RULE_TYPE_LABEL[rule.rule_type] ?? rule.rule_type;
              return (
                <div
                  key={rule.rule_id}
                  className={`p-3 border rounded-xl transition-all ${
                    rule.enabled
                      ? 'border-primary/25 bg-card shadow-sm'
                      : 'border-border bg-muted/20 opacity-55'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Column + rule type */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-semibold bg-muted px-1.5 py-0.5 rounded border border-border/50 text-foreground">
                          {rule.column_name}
                        </span>
                        <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded">
                          {typeLabel}
                        </span>
                      </div>

                      {/* Plain-English description */}
                      <p className="text-xs text-foreground leading-snug">{plainText}</p>

                      {/* Status line */}
                      <p className="text-[10px] text-muted-foreground">
                        {rule.enabled
                          ? '✅ Violations flagged in Fix Suggestions'
                          : '⏸ Paused — violations hidden'}
                      </p>
                    </div>

                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => updateMutation.mutate({
                        sessionId: sessionId!,
                        ruleId: rule.rule_id,
                        data: { enabled: !rule.enabled },
                      })}
                      disabled={updateMutation.isPending}
                      className="shrink-0 mt-0.5"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {rules.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/20 text-[11px] text-muted-foreground shrink-0">
          All {rules.length} rules were created automatically — no manual setup needed.
        </div>
      )}
    </div>
  );
}

// Export under old name for backwards-compat import in Workspace
export { QualityRules as ValidationRules };
