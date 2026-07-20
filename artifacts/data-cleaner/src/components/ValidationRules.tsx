import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import {
  useGetValidationRules,
  useUpdateValidationRule,
  getGetValidationRulesQueryKey,
} from '@workspace/api-client-react';
import type { ValidationRule } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, ToggleLeft, ToggleRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const RULE_TYPE_META: Record<string, { label: string; desc: string; color: string }> = {
  not_null:    { label: 'Not Null',     desc: 'Flags rows where this column is empty',         color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  range:       { label: 'Range',        desc: 'Flags values outside the min/max range',        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  isin:        { label: 'Allowed Set',  desc: 'Flags values not in the expected set',          color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  max_length:  { label: 'Max Length',   desc: 'Flags strings longer than the allowed limit',  color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  datetime:    { label: 'Date Format',  desc: 'Flags values that don\'t match the date format', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  regex:       { label: 'Regex',        desc: 'Flags values not matching the pattern',         color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
};

export function ValidationRules() {
  const { sessionId } = useSessionStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ✅ Correct — useGetValidationRules(sessionId, options?) — no params arg
  const { data, isLoading } = useGetValidationRules(sessionId!, {
    query: { enabled: !!sessionId },
  } as any);

  const updateMutation = useUpdateValidationRule({
    mutation: {
      onSuccess: (_: any, vars: any) => {
        // ✅ FIXED: use the generated query-key helper, not a hand-crafted array
        queryClient.invalidateQueries({ queryKey: getGetValidationRulesQueryKey(sessionId!) });
        toast({
          title: vars.data.enabled ? 'Rule enabled' : 'Rule disabled',
          description: 'Validation rule updated.',
        });
      },
    },
  } as any);

  const handleToggle = (ruleId: string, currentEnabled: boolean) => {
    updateMutation.mutate({
      sessionId: sessionId!,
      ruleId,
      data: { enabled: !currentEnabled },
    });
  };

  const rules: ValidationRule[] = data?.rules ?? [];
  const activeCount = rules.filter(r => r.enabled).length;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-card border-l items-center justify-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm">Generating rules…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-l">
      {/* ── Header ── */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2 text-foreground">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Validation Rules
          </h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            {activeCount} / {rules.length} active
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Rules are <strong className="text-foreground">auto-generated</strong> from your data's observed patterns.
          Toggle any rule on or off — violations surface immediately in the Review Queue.
        </p>

        {/* Summary stats */}
        {rules.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted rounded-lg py-2">
              <div className="text-base font-bold text-foreground">{rules.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Generated</div>
            </div>
            <div className="bg-muted rounded-lg py-2">
              <div className="text-base font-bold text-emerald-400">{activeCount}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</div>
            </div>
            <div className="bg-muted rounded-lg py-2">
              <div className="text-base font-bold text-yellow-400">
                {new Set(rules.map(r => r.column_name)).size}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Columns</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Rule cards ── */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <ShieldAlert className="w-10 h-10 opacity-20" />
              <div className="text-center">
                <p className="text-sm font-medium">No rules generated yet</p>
                <p className="text-xs mt-1 max-w-[200px]">Run analysis on a file to auto-generate rules from the data's patterns.</p>
              </div>
            </div>
          ) : (
            rules.map((rule: ValidationRule) => {
              const meta = RULE_TYPE_META[rule.rule_type] ?? {
                label: rule.rule_type,
                desc: rule.description,
                color: 'text-muted-foreground bg-muted border-border',
              };
              return (
                <div
                  key={rule.rule_id}
                  className={`p-3 border rounded-lg transition-all ${
                    rule.enabled
                      ? 'border-primary/20 bg-card shadow-sm'
                      : 'border-border bg-muted/20 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Column + type */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <span className="text-[10px] font-mono font-semibold bg-muted px-1.5 py-0.5 rounded border border-border/60 text-foreground">
                          {rule.column_name}
                        </span>
                        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-foreground font-medium leading-snug mb-1.5">{rule.description}</p>

                      {/* Params */}
                      {rule.params && Object.keys(rule.params).length > 0 && (
                        <div className="text-[10px] font-mono text-muted-foreground bg-muted/60 border border-border/40 rounded px-2 py-1 leading-relaxed">
                          {Object.entries(rule.params as Record<string, any>).map(([k, v]) => (
                            <span key={k} className="mr-3">
                              <span className="text-primary/70">{k}</span>
                              <span className="text-muted-foreground/60">:</span>{' '}
                              <span className="text-foreground">{JSON.stringify(v)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Toggle */}
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => handleToggle(rule.rule_id, rule.enabled)}
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

      {/* ── Footer ── */}
      {rules.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/20 text-[11px] text-muted-foreground">
          These rules were inferred automatically — no manual schema writing required.
        </div>
      )}
    </div>
  );
}
