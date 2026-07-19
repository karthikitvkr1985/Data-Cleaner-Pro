import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useSubmitNLCommand, useConfirmNLCommand, getGetPreviewQueryKey, getGetRecipeQueryKey } from '@workspace/api-client-react';
import type { NLCommandPreview } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, ArrowRight, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export function NLCommandBar() {
  const { sessionId } = useSessionStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [instruction, setInstruction] = useState('');
  const [preview, setPreview] = useState<NLCommandPreview | null>(null);

  const submitMutation = useSubmitNLCommand();
  const confirmMutation = useConfirmNLCommand({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPreviewQueryKey(sessionId!) });
        queryClient.invalidateQueries({ queryKey: getGetRecipeQueryKey(sessionId!) });
        setPreview(null);
        setInstruction('');
        toast({ title: 'Command Applied', description: 'The changes have been applied to the grid.' });
      }
    }
  } as any);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || !sessionId) return;
    
    try {
      const result = await submitMutation.mutateAsync({
        sessionId,
        data: { instruction }
      });
      setPreview(result);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex-1 max-w-2xl relative">
        <div className="relative flex items-center">
          <Sparkles className="absolute left-3 w-4 h-4 text-primary" />
          <Input 
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Tell DataClean what to do... (e.g. 'Extract first names from Email column')"
            className="pl-9 pr-24 h-10 bg-card border-border focus-visible:ring-primary/50 shadow-inner"
            disabled={submitMutation.isPending}
          />
          <Button 
            type="submit" 
            size="sm" 
            className="absolute right-1 h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={submitMutation.isPending || !instruction.trim()}
          >
            {submitMutation.isPending ? 'Thinking...' : 'Run'}
          </Button>
        </div>
      </form>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-primary">
              <Sparkles className="w-5 h-5" /> AI Command Preview
            </DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="space-y-6">
              <div className="bg-muted p-4 rounded-lg border">
                <p className="font-medium text-foreground">{preview.description}</p>
                <div className="mt-2 text-sm text-muted-foreground bg-background p-2 rounded font-mono border">
                  Intent: {JSON.stringify(preview.intent)}
                </div>
              </div>

              {preview.clarification_needed ? (
                <div className="bg-chart-2/10 border border-chart-2/20 p-4 rounded-lg text-chart-2 flex items-start gap-3">
                  <div className="font-semibold">Clarification Needed:</div>
                  <p>{preview.clarification_needed}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center justify-between text-foreground">
                    <span>Sample Changes <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary">{preview.affected_count} rows affected</Badge></span>
                  </h3>
                  
                  <div className="border rounded-lg overflow-hidden bg-card">
                    <div className="grid grid-cols-2 bg-muted/50 border-b">
                      <div className="p-2 font-medium text-xs text-muted-foreground text-center border-r">Before</div>
                      <div className="p-2 font-medium text-xs text-primary text-center">After</div>
                    </div>
                    {preview.sample_before.map((beforeRow: any, i: number) => {
                      const afterRow = preview.sample_after[i];
                      return (
                        <div key={i} className="grid grid-cols-2 border-b last:border-b-0 text-sm font-mono">
                          <div className="p-3 border-r overflow-x-auto text-muted-foreground bg-muted/10">
                            {JSON.stringify(beforeRow).replace(/[{}"]/g, '')}
                          </div>
                          <div className="p-3 overflow-x-auto text-foreground bg-primary/5">
                            {JSON.stringify(afterRow).replace(/[{}"]/g, '')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
                {!preview.clarification_needed && (
                  <Button 
                    onClick={() => confirmMutation.mutate({ sessionId: sessionId!, data: { preview_id: preview.preview_id } })}
                    disabled={confirmMutation.isPending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {confirmMutation.isPending ? 'Applying...' : 'Confirm & Apply'}
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