/**
 * Ask DataClean — Natural language command bar.
 *
 * Type any instruction in plain English. DataClean will show you a preview of
 * what will change before applying anything.
 *
 * Examples:
 *   "Remove duplicate rows"
 *   "Fill empty cells in Revenue with 0"
 *   "Convert Email column to lowercase"
 *   "Rename 'Cust Name' to 'Customer Name'"
 */
import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import {
  useSubmitNLCommand,
  useConfirmNLCommand,
  getGetPreviewQueryKey,
  getGetRecipeQueryKey,
  getGetSuggestionsQueryKey,
} from '@workspace/api-client-react';
import type { NLCommandPreview } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const EXAMPLES = [
  'Remove duplicate rows',
  'Fill empty Revenue cells with 0',
  'Convert Email to lowercase',
  'Trim spaces from all text columns',
];

export function NLCommandBar() {
  const { sessionId }  = useSessionStore();
  const queryClient    = useQueryClient();
  const { toast }      = useToast();
  const [text,         setText]    = useState('');
  const [preview,      setPreview] = useState<NLCommandPreview | null>(null);
  const [showExamples, setShowExamples] = useState(false);

  const submitMutation = useSubmitNLCommand();
  const confirmMutation = useConfirmNLCommand({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPreviewQueryKey(sessionId!) });
        queryClient.invalidateQueries({ queryKey: getGetRecipeQueryKey(sessionId!) });
        queryClient.invalidateQueries({ queryKey: getGetSuggestionsQueryKey(sessionId!) });
        setPreview(null);
        setText('');
        toast({ title: 'Done!', description: 'Your instruction was applied to the data.' });
      },
      onError: () => {
        toast({ title: 'Failed to apply', description: 'Something went wrong. Try again or rephrase your instruction.', variant: 'destructive' });
      },
    },
  } as any);

  const handleSubmit = async (instruction: string) => {
    const cmd = instruction.trim();
    if (!cmd || !sessionId) return;
    try {
      const result = await submitMutation.mutateAsync({ sessionId, data: { instruction: cmd } });
      setPreview(result);
      setShowExamples(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Could not process instruction', variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="w-full max-w-xl relative">
        <form
          onSubmit={e => { e.preventDefault(); handleSubmit(text); }}
          className="flex items-center gap-1"
        >
          <div className="relative flex-1">
            <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/70 pointer-events-none" />
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              onFocus={() => setShowExamples(true)}
              onBlur={() => setTimeout(() => setShowExamples(false), 150)}
              placeholder={sessionId ? 'Ask DataClean to do something… e.g. "Remove duplicates"' : 'Upload a file to start'}
              className="pl-8 pr-2 h-9 text-xs bg-card border-border"
              disabled={!sessionId || submitMutation.isPending}
            />
          </div>
          <Button
            type="submit" size="sm" className="h-9 text-xs px-3 shrink-0"
            disabled={!sessionId || !text.trim() || submitMutation.isPending}
          >
            {submitMutation.isPending
              ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Thinking…</>
              : 'Run'}
          </Button>
        </form>

        {/* Example suggestions dropdown */}
        {showExamples && sessionId && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider border-b">
              Try an example
            </div>
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onMouseDown={() => handleSubmit(ex)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2 text-foreground"
              >
                <Sparkles className="w-3 h-3 text-primary/50 shrink-0" />
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Preview dialog ── */}
      <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Preview — what will change
            </DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="space-y-4 text-sm">
              <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground border">
                {preview.description}
              </div>

              {preview.clarification_needed ? (
                <div className="flex gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-1">Couldn't understand that instruction</p>
                    <p className="text-yellow-300/80">{preview.clarification_needed}</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{preview.affected_count} rows</span> will be affected.
                    Here's a sample of before vs. after:
                  </p>
                  <div className="border rounded-lg overflow-hidden text-xs font-mono">
                    <div className="grid grid-cols-2 bg-muted/60 border-b text-[10px] text-muted-foreground">
                      <div className="p-2 text-center border-r">Before</div>
                      <div className="p-2 text-center">After</div>
                    </div>
                    {preview.sample_before.slice(0, 5).map((before: any, i: number) => {
                      const after = preview.sample_after[i];
                      // Show first changed key
                      const key = Object.keys(before ?? {})[0] ?? '';
                      return (
                        <div key={i} className="grid grid-cols-2 border-b last:border-b-0">
                          <div className="p-2 border-r text-red-400/80 truncate bg-red-500/5 break-words">
                            {JSON.stringify(before[key] ?? before).replace(/^"|"$/g, '') || '(empty)'}
                          </div>
                          <div className="p-2 text-emerald-400 truncate bg-emerald-500/5 break-words">
                            {JSON.stringify((after ?? {})[key] ?? after).replace(/^"|"$/g, '') || '(empty)'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
                  Cancel — don't change anything
                </Button>
                {!preview.clarification_needed && (
                  <Button
                    size="sm"
                    onClick={() => confirmMutation.mutate({
                      sessionId: sessionId!,
                      data: { preview_id: preview.preview_id },
                    })}
                    disabled={confirmMutation.isPending}
                  >
                    {confirmMutation.isPending
                      ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Applying…</>
                      : 'Yes, apply this change'}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
