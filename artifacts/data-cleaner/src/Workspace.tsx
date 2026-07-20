import React, { useState } from 'react';
import { useSessionStore } from './store/sessionStore';
import {
  Database, Download, FileSpreadsheet, LayoutGrid, ListChecks,
  Search, FileJson, ShieldAlert, ShieldCheck, Menu, X,
  Zap, Upload,
} from 'lucide-react';
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
import { FeatureHealth } from './components/FeatureHealth';
import {
  useGetSuggestions,
  useGetValidationRules,
} from '@workspace/api-client-react';
import type { Suggestion, ValidationRule } from '@workspace/api-client-react';

// Panel definitions
type PanelId = 'grid' | 'review' | 'inspector' | 'recipe' | 'issues' | 'validation' | 'health';

const PANELS = [
  { id: 'grid',       label: 'Data Grid',          icon: LayoutGrid,  group: 'main' },
  { id: 'review',     label: 'Review Queue',        icon: ListChecks,  group: 'main' },
  { id: 'inspector',  label: 'Column Inspector',    icon: Search,      group: 'main' },
  { id: 'recipe',     label: 'Cleaning Recipe',     icon: FileJson,    group: 'main' },
  { id: 'issues',     label: 'Issues Report',       icon: ShieldAlert, group: 'main' },
  { id: 'validation', label: 'Validation Rules',    icon: ShieldCheck, group: 'main' },
  { id: 'health',     label: 'Feature Health & KPIs', icon: Zap,       group: 'meta' },
] as const;

export function Workspace() {
  const { sessionId, filename, activePanel, setActivePanel, clearSession } = useSessionStore();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Live badge counts for sidebar
  const { data: sugsData }  = useGetSuggestions(sessionId!, undefined, { query: { enabled: !!sessionId } });
  const { data: rulesData } = useGetValidationRules(sessionId!, { query: { enabled: !!sessionId } } as any);

  const pendingCount = (sugsData?.suggestions ?? []).filter((s: Suggestion) => s.status === 'pending').length;
  const activeRules  = (rulesData?.rules ?? []).filter((r: ValidationRule) => r.enabled).length;

  const badges: Partial<Record<PanelId, number>> = {
    review:     pendingCount || 0,
    validation: activeRules  || 0,
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!sessionId) return;
    try {
      await exportSession(sessionId, format);
      toast({ title: 'Export Complete', description: `Downloaded as ${format.toUpperCase()}` });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e.message, variant: 'destructive' });
    }
  };

  // ── Upload screen ──────────────────────────────────────────────────────────
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
            Upload messy Excel or CSV files — we detect structure, infer column types, find every data
            quality issue, and generate one-click fixes automatically.
          </p>
          <div className="h-64 mt-8">
            <UploadZone />
          </div>
        </div>
      </div>
    );
  }

  // ── Main workspace ─────────────────────────────────────────────────────────
  const activePanelDef = PANELS.find(p => p.id === activePanel);

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">

      {/* ── Top bar ── */}
      <header className="h-14 border-b bg-card flex items-center justify-between px-3 shrink-0 shadow-sm z-20 gap-2">

        {/* Left: logo + file */}
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          {/* Mobile sidebar toggle */}
          <Button
            variant="ghost" size="icon" className="w-8 h-8 lg:hidden shrink-0"
            onClick={() => setSidebarOpen(v => !v)}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>

          <div className="flex items-center gap-1.5 text-primary font-bold shrink-0">
            <Database className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">DataClean</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <div className="h-4 w-px bg-border mx-1" />
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[140px]">{filename}</span>
          </div>
        </div>

        {/* Center: NL command bar */}
        <div className="flex-1 min-w-0 flex justify-center">
          <NLCommandBar />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}
            className="hidden sm:flex gap-1.5 h-8 text-xs bg-background">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="default" size="sm" onClick={() => handleExport('xlsx')}
            className="gap-1.5 h-8 text-xs">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSession}
            className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New File</span>
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Sidebar ── */}
        <aside className={`
          ${sidebarOpen ? 'flex' : 'hidden'} lg:flex
          flex-col w-56 border-r bg-card py-3 gap-0.5 shrink-0 z-30
          absolute inset-y-0 left-0 lg:relative lg:inset-auto
          shadow-xl lg:shadow-none
        `}>

          {/* Main panels */}
          <div className="px-2 mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2">Tools</span>
          </div>
          {PANELS.filter(p => p.group === 'main').map(panel => {
            const Icon    = panel.icon;
            const isActive = activePanel === panel.id;
            const badge   = badges[panel.id as PanelId] ?? 0;
            return (
              <button
                key={panel.id}
                onClick={() => { setActivePanel(panel.id as any); setSidebarOpen(false); }}
                className={`
                  mx-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors
                  ${isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}
                `}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
                  {panel.label}
                </span>
                {badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>{badge}</span>
                )}
              </button>
            );
          })}

          {/* Divider */}
          <div className="mx-4 my-2 border-t border-border/40" />
          <div className="px-2 mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2">Insights</span>
          </div>

          {/* Meta panels (Feature Health) */}
          {PANELS.filter(p => p.group === 'meta').map(panel => {
            const Icon    = panel.icon;
            const isActive = activePanel === panel.id;
            return (
              <button
                key={panel.id}
                onClick={() => { setActivePanel(panel.id as any); setSidebarOpen(false); }}
                className={`
                  mx-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors
                  ${isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}
                `}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
                {panel.label}
              </button>
            );
          })}
        </aside>

        {/* Sidebar backdrop (mobile) */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-20"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Data Grid (always mounted, hidden when a right-panel is open on small screens) ── */}
        <main className={`
          flex-1 min-w-0 p-4 transition-all overflow-hidden
          ${activePanel !== 'grid' && activePanel !== 'health' ? 'hidden lg:block' : ''}
          ${activePanel === 'health' ? 'hidden' : ''}
        `}>
          <DataGrid />
        </main>

        {/* ── Right / full panels ── */}
        {activePanel !== 'grid' && (
          <aside className={`
            ${activePanel === 'health' ? 'w-full' : 'w-full lg:w-[380px] xl:w-[420px]'}
            bg-card shadow-xl z-10 overflow-hidden flex flex-col
          `}>
            {activePanel === 'review'     && <ReviewQueue />}
            {activePanel === 'inspector'  && <ColumnInspector />}
            {activePanel === 'recipe'     && <RecipePanel />}
            {activePanel === 'issues'     && <IssuesReport />}
            {activePanel === 'validation' && <ValidationRules />}
            {activePanel === 'health'     && <FeatureHealth />}
          </aside>
        )}
      </div>
    </div>
  );
}
