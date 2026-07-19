import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useGetRecipe } from '@workspace/api-client-react';
import type { RecipeStep } from '@workspace/api-client-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, FileJson, ArrowRight, PlaySquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { exportRecipe, applyRecipeToNewFile } from '../api/client';
import { useToast } from '@/hooks/use-toast';
import { useDropzone } from 'react-dropzone';

export function RecipePanel() {
  const { sessionId } = useSessionStore();
  const { toast } = useToast();

  const { data: recipeData, isLoading } = useGetRecipe(sessionId!, {
    query: { enabled: !!sessionId }
  } as any);

  const [isApplying, setIsApplying] = React.useState(false);

  const handleExport = async () => {
    try {
      await exportRecipe(sessionId!);
      toast({ title: 'Recipe Exported', description: 'JSON file downloaded successfully.' });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e.message, variant: 'destructive' });
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    try {
      setIsApplying(true);
      const res = await applyRecipeToNewFile(sessionId!, acceptedFiles[0]);
      toast({ 
        title: 'Recipe Applied', 
        description: `Successfully applied ${res.steps_applied} steps. Skipped ${res.steps_skipped}. Session ID: ${res.new_session_id}` 
      });
    } catch (e: any) {
      toast({ title: 'Apply Failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsApplying(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false
  });

  const steps = recipeData?.steps || [];

  return (
    <div className="flex flex-col h-full bg-card border-l">
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
            <FileJson className="w-5 h-5 text-primary" />
            Cleaning Recipe
          </h2>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" /> Export JSON
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          This recipe records every transformation applied to your data. Export it to reproduce these steps later, or apply it to a new file instantly.
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading recipe...</div>
        ) : steps.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No transformations applied yet. Accept suggestions or run commands to build your recipe.
          </div>
        ) : (
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
            {steps.map((step: RecipeStep, i: number) => (
              <div key={step.step_id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-card bg-primary text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 font-bold text-sm">
                  {i + 1}
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg border bg-card shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="secondary" className="uppercase text-[10px] tracking-wider">{step.module}</Badge>
                  </div>
                  <p className="text-sm text-foreground">{step.description}</p>
                  {Object.keys(step.params || {}).length > 0 && (
                    <div className="mt-2 text-xs font-mono text-muted-foreground bg-muted p-2 rounded">
                      {JSON.stringify(step.params)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t bg-muted/30">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><PlaySquare className="w-4 h-4 text-primary" /> Apply to New File</h3>
        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}
            ${isApplying ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          <input {...getInputProps()} />
          <div className="text-sm text-muted-foreground">
            {isApplying ? 'Applying recipe...' : 'Drag & drop a new .csv or .xlsx here to apply this exact cleaning pipeline.'}
          </div>
        </div>
      </div>
    </div>
  );
}