import React from 'react';
import { useSessionStore } from './store/sessionStore';
import { Database, Download, FileSpreadsheet, LayoutGrid, ListChecks, Search, FileJson, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportSession } from './api/client';
import { useToast } from '@/hooks/use-toast';
import { DataGrid } from './components/DataGrid';
import { ReviewQueue } from './components/ReviewQueue';
import { ColumnInspector } from './components/ColumnInspector';
import { RecipePanel } from './components/RecipePanel';
import { IssuesReport } from './components/IssuesReport';
import { ValidationRules } from './components/ValidationRules';
import { NLCommandBar } from './components/NLCommandBar';
import { UploadZone } from './components/UploadZone';

export function Workspace() {
  const { sessionId, filename, activePanel, setActivePanel } = useSessionStore();
  const { toast } = useToast();

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!sessionId) return;
    try {
      await exportSession(sessionId, format);
      toast({ title: 'Export Complete', description: `File downloaded as ${format.toUpperCase()}` });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e.message, variant: 'destructive' });
    }
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-muted/20 flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full text-center space-y-6">
          <div className="flex justify-center mb-8">
            <div className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-lg shadow-primary/20">
              <Database className="w-12 h-12" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">DataClean Workspace</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Precision data cleaning for analysts. Upload your messy Excel or CSV files and we'll detect structure, infer types, and suggest intelligent repairs.
          </p>
          <div className="h-64 mt-8">
            <UploadZone />
          </div>
        </div>
      </div>
    );
  }

  const panels = [
    { id: 'grid', label: 'Data Grid', icon: LayoutGrid },
    { id: 'review', label: 'Review Queue', icon: ListChecks },
    { id: 'inspector', label: 'Column Inspector', icon: Search },
    { id: 'recipe', label: 'Cleaning Recipe', icon: FileJson },
    { id: 'issues', label: 'Issues Report', icon: ShieldAlert },
    { id: 'validation', label: 'Validation Rules', icon: ShieldCheck },
  ] as const;

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-primary font-bold">
            <Database className="w-5 h-5" />
            <span className="hidden sm:inline">DataClean</span>
          </div>
          <div className="h-6 w-px bg-border mx-2" />
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            {filename}
          </div>
        </div>

        <div className="flex-1 max-w-2xl mx-8 flex justify-center">
          <NLCommandBar />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')} className="gap-2 bg-background border-border hover:bg-muted">
            <Download className="w-4 h-4" /> CSV
          </Button>
          <Button variant="default" size="sm" onClick={() => handleExport('xlsx')} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Download className="w-4 h-4" /> Excel
          </Button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar (Navigation) */}
        <aside className="w-14 sm:w-56 border-r bg-card flex flex-col items-center sm:items-stretch py-4 gap-2 shrink-0 z-10">
          {panels.map((panel) => {
            const Icon = panel.icon;
            const isActive = activePanel === panel.id;
            return (
              <Button
                key={panel.id}
                variant={isActive ? 'secondary' : 'ghost'}
                className={`w-10 h-10 sm:w-full sm:h-10 sm:justify-start sm:px-4 rounded-xl sm:rounded-none mx-2 sm:mx-0 border-l-4 border-transparent
                  ${isActive ? 'bg-primary/10 text-primary border-l-primary font-semibold hover:bg-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}
                `}
                onClick={() => setActivePanel(panel.id)}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''} sm:mr-3`} />
                <span className="hidden sm:inline">{panel.label}</span>
              </Button>
            );
          })}
        </aside>

        {/* Center Panel (Data Grid) */}
        <main className={`flex-1 min-w-0 transition-all duration-300 ease-in-out p-4 ${activePanel === 'grid' ? '' : 'hidden lg:block lg:w-2/3 xl:w-3/4'}`}>
          <DataGrid />
        </main>

        {/* Right Panel (Active Tool) */}
        {activePanel !== 'grid' && (
          <aside className="w-full lg:w-1/3 xl:w-1/4 bg-card shadow-xl z-20 transition-all duration-300 ease-in-out">
            {activePanel === 'review' && <ReviewQueue />}
            {activePanel === 'inspector' && <ColumnInspector />}
            {activePanel === 'recipe' && <RecipePanel />}
            {activePanel === 'issues' && <IssuesReport />}
            {activePanel === 'validation' && <ValidationRules />}
          </aside>
        )}
      </div>
    </div>
  );
}