/**
 * Change History — formerly "Cleaning Recipe"
 *
 * Every fix you apply (or DataClean applies automatically) is recorded here
 * as a numbered step. This gives you a full audit trail.
 *
 * You can also download this history and drag a new file onto this panel to
 * run the exact same cleaning pipeline on next month's data export.
 */
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useSessionStore } from '../store/sessionStore';
import { useGetRecipe } from '@workspace/api-client-react';
import type { RecipeStep } from '@workspace/api-client-react';
import { exportRecipe, applyRecipeToNewFile } from '../api/client';
import { History, Download, UploadCloud, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

const MODULE_LABEL: Record<string, { icon: string; label: string }> = {
  structure:  { icon: '🏗', label: 'Structure fix' },
  type:       { icon: '🔢', label: 'Type conversion' },
  format:     { icon: '✏️', label: 'Format fix' },
  dedup:      { icon: '👯', label: 'Duplicate removed' },
  missing:    { icon: '⬜', label: 'Missing value filled' },
  validation: { icon: '🚨', label: 'Rule violation fixed' },
  nl:         { icon: '✨', label: 'Custom instruction' },
};

export function RecipePanel() {
  const { sessionId } = useSessionStore();
  const { toast }     = useToast();
  const [isApplying,  setIsApplying] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const { data, isLoading } = useGetRecipe(sessionId!, {
    query: { enabled: !!sessionId },
  } as any);

  const steps: RecipeStep[] = data?.steps ?? [];

  const handleDownload = async () => {
    try {
      await exportRecipe(sessionId!);
      toast({ title: 'Recipe downloaded', description: 'JSON file saved — drag it onto this panel to re-apply.' });
    } catch (e: any) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    onDrop: async (files) => {
      if (!files[0] || !sessionId) return;
      setIsApplying(true);
      setNewFileName(files[0].name);
      try {
        await applyRecipeToNewFile(sessionId, files[0]);
        toast({ title: 'Recipe applied!', description: `"${files[0].name}" was cleaned using the same ${steps.length} steps.` });
      } catch (e: any) {
        toast({ title: 'Failed', description: e.message, variant: 'destructive' });
      } finally {
        setIsApplying(false);
        setNewFileName('');
      }
    },
  });

  return (
    <div className="flex flex-col h-full bg-card border-l">

      {/* ── Header ── */}
      <div className="p-4 border-b space-y-2 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Change History
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Every fix applied to your data, in order. Download it to re-use on any future file.
            </p>
          </div>
          {steps.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" /> Download
            </Button>
          )}
        </div>

        {steps.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {steps.length} change{steps.length !== 1 ? 's' : ''} recorded — ready to replay on a new file
          </div>
        )}
      </div>

      {/* ── Steps ── */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
            </div>
          ) : steps.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <History className="w-9 h-9 mx-auto opacity-20" />
              <p className="text-sm font-medium">No changes yet</p>
              <p className="text-xs max-w-[200px] mx-auto leading-relaxed">
                Apply fixes in <em>Fix Suggestions</em> or run a command — each change will appear here.
              </p>
            </div>
          ) : (
            steps.map((step: RecipeStep, i: number) => {
              const meta = MODULE_LABEL[step.module] ?? { icon: '•', label: step.module };
              return (
                <div key={step.step_id} className="flex gap-3 items-start">
                  {/* Step number */}
                  <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0 pb-2 border-b border-border/30 last:border-b-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-base leading-none shrink-0">{meta.icon}</span>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{meta.label}</span>
                    </div>
                    <p className="text-xs text-foreground leading-snug break-words">{step.description}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* ── Apply to new file drop zone ── */}
      {steps.length > 0 && (
        <div className="p-4 border-t bg-muted/20 shrink-0">
          <p className="text-xs font-medium text-foreground mb-2">
            Re-run this exact cleaning on another file:
          </p>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
              isDragActive    ? 'border-primary bg-primary/5' :
              isApplying      ? 'border-border opacity-50 pointer-events-none' :
              'border-border hover:border-primary/40 hover:bg-muted/30'
            }`}
          >
            <input {...getInputProps()} />
            {isApplying ? (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Applying {steps.length} steps to "{newFileName}"…
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <UploadCloud className="w-6 h-6 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">Drop a .csv or .xlsx here</p>
                <p className="text-[10px] text-muted-foreground/60">DataClean will apply all {steps.length} steps automatically</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
