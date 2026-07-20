import React, { useState } from 'react';
import { useSessionStore } from './store/sessionStore';
import {
  Database, Download, LayoutGrid, ListChecks, MousePointerClick,
  History, AlertOctagon, ShieldCheck, Zap, Menu, X, Upload,
  FileSpreadsheet, TrendingUp, ClipboardList, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportSession } from './api/client';
import { useToast } from '@/hooks/use-toast';
import { DataGrid }             from './components/DataGrid';
import { ReviewQueue }          from './components/ReviewQueue';
import { ColumnInspector }      from './components/ColumnInspector';
import { RecipePanel }          from './components/RecipePanel';
import { IssuesReport }         from './components/IssuesReport';
import { ValidationRules }      from './components/ValidationRules';
import { NLCommandBar }         from './components/NLCommandBar';
import { UploadZone }           from './components/UploadZone';
import { FeatureHealth }        from './components/FeatureHealth';
import { QualityDashboard }     from './components/QualityDashboard';
import { AuditLogViewer }       from './components/AuditLogViewer';
import { CleaningReportViewer } from './components/CleaningReportViewer';
import { useGetSuggestions, useGetValidationRules } from '@workspace/api-client-react';
import type { Suggestion, ValidationRule } from '@workspace/api-client-react';

// ── Panel definitions ─────────────────────────────────────────────────────────
type PanelId = 'grid' | 'review' | 'inspector' | 'recipe' | 'issues' | 'validation' | 'health' | 'quality' | 'audit' | 'report';

const PANELS: Array<{
  id: PanelId;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  group: 'main' | 'insight';
}> = [
  {
    id: 'grid',
    label: 'Your Data',
    sublabel: 'The full table',
    icon: LayoutGrid,
    group: 'main',
  },
  {
    id: 'review',
    label: 'Fix Suggestions',
    sublabel: 'Issues DataClean found',
    icon: ListChecks,
    group: 'main',
  },
  {
    id: 'inspector',
    label: 'Column Details',
    sublabel: 'Click a column header first',
    icon: MousePointerClick,
    group: 'main',
  },
  {
    id: 'recipe',
    label: 'Change History',
    sublabel: 'Every edit recorded',
    icon: History,
    group: 'main',
  },
  {
    id: 'issues',
    label: 'Problems Found',
    sublabel: 'Full issues report',
    icon: AlertOctagon,
    group: 'main',
  },
  {
    id: 'validation',
    label: 'Quality Rules',
    sublabel: 'Auto-generated guards',
    icon: ShieldCheck,
    group: 'main',
  },
  {
    id: 'quality',
    label: 'Quality Dashboard',
    sublabel: 'DQ scores & schema meaning',
    icon: TrendingUp,
    group: 'insight',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    sublabel: 'Every action recorded',
    icon: ClipboardList,
    group: 'insight',
  },
  {
    id: 'report',
    label: 'Cleaning Report',
    sublabel: 'Full analysis & summary',
    icon: FileText,
    group: 'insight',
  },
  {
    id: 'health',
    label: 'What This Tool Did',
    sublabel: 'Features & value produced',
    icon: Zap,
    group: 'insight',
  },
];

export function Workspace() {
  const { sessionId, filename, activePanel, setActivePanel, clearSession } =
    useSessionStore();
  const { toast }      = useToast();
  const [navOpen, setNavOpen] = useState(false);

  // Live badge counts
  const { data: sugsData }  = useGetSuggestions(sessionId!, undefined, { query: { enabled: !!sessionId } });
  const { data: rulesData } = useGetValidationRules(sessionId!, { query: { enabled: !!sessionId } } as any);

  const pendingCount = (sugsData?.suggestions ?? []).filter((s: Suggestion) => s.status === 'pending').length;
  const activeRules  = (rulesData?.rules ?? []).filter((r: ValidationRule) => r.enabled).length;

  const badges: Partial<Record<PanelId, number>> = {
    review:     pendingCount,
    validation: activeRules,
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!sessionId) return;
    try {
      await exportSession(sessionId, format);
      toast({ title: 'Download ready', description: `Your cleaned file downloaded as ${format.toUpperCase()}.` });
    } catch (e: any) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    }
  };

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div className="min-h-screen bg-muted/20 flex flex-col items-center justify-center p-6">
        <div className="max-w-xl w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-lg shadow-primary/20">
              <Database className="w-10 h-10" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">DataClean</h1>
            <p className="text-base text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
              Upload a messy Excel or CSV file — DataClean will automatically detect structure,
              find every data problem, and suggest one-click fixes.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
            {[
              ['Detects structure', 'Finds the real table even in messy exports'],
              ['Flags issues', 'Wrong types, duplicates, blanks, bad formats'],
              ['Suggests fixes', 'One click per issue — or apply all at once'],
            ].map(([title, desc]) => (
              <div key={title} className="bg-card rounded-lg border p-3 space-y-1">
                <div className="text-xs font-semibold text-foreground">{title}</div>
                <div className="text-[11px] leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
          <div className="h-52">
            <UploadZone />
          </div>
        </div>
      </div>
    );
  }

  // ── Main workspace ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">

      {/* ── Top bar ── */}
      <header className="h-14 border-b bg-card flex items-center px-3 gap-2 shrink-0 shadow-sm z-20">

        {/* Hamburger (mobile) */}
        <Button
          variant="ghost" size="icon" className="w-8 h-8 lg:hidden shrink-0"
          onClick={() => setNavOpen(v => !v)}
        >
          {navOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>

        {/* Logo + file */}
        <div className="flex items-center gap-2 shrink-0">
          <Database className="w-4 h-4 text-primary" />
          <span className="hidden sm:inline text-sm font-bold text-primary">DataClean</span>
          {filename && (
            <>
              <span className="text-border hidden sm:inline">|</span>
              <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
              <span className="text-xs text-muted-foreground truncate max-w-[120px] hidden sm:block">{filename}</span>
            </>
          )}
        </div>

        {/* NL bar */}
        <div className="flex-1 min-w-0">
          <NLCommandBar />
        </div>

        {/* Export + new file */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline" size="sm"
            className="hidden sm:flex gap-1.5 h-8 text-xs"
            onClick={() => handleExport('csv')}
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button
            variant="default" size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => handleExport('xlsx')}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </Button>
          <Button
            variant="ghost" size="sm"
            className="hidden sm:flex gap-1.5 h-8 text-xs text-muted-foreground"
            onClick={clearSession}
            title="Upload a new file"
          >
            <Upload className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Sidebar nav ── */}
        <aside className={`
          ${navOpen ? 'flex' : 'hidden'} lg:flex
          flex-col w-60 border-r bg-card pt-3 pb-4 shrink-0 z-30
          absolute inset-y-0 left-0 lg:relative lg:inset-auto shadow-xl lg:shadow-none
        `}>

          <SidebarGroup label="Panels">
            {PANELS.filter(p => p.group === 'main').map(p => (
              <SidebarItem
                key={p.id}
                panel={p}
                isActive={activePanel === p.id}
                badge={badges[p.id]}
                onClick={() => { setActivePanel(p.id as any); setNavOpen(false); }}
              />
            ))}
          </SidebarGroup>

          <div className="mt-3 pt-3 border-t mx-3">
            <SidebarGroup label="Insights">
              {PANELS.filter(p => p.group === 'insight').map(p => (
                <SidebarItem
                  key={p.id}
                  panel={p}
                  isActive={activePanel === p.id}
                  onClick={() => { setActivePanel(p.id as any); setNavOpen(false); }}
                />
              ))}
            </SidebarGroup>
          </div>
        </aside>

        {/* Backdrop */}
        {navOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/40 z-20" onClick={() => setNavOpen(false)} />
        )}

        {/* ── Data table (center) ── */}
        <main className={`
          flex-1 min-w-0 p-4 overflow-hidden
          ${activePanel !== 'grid' ? 'hidden lg:block' : ''}
          ${activePanel === 'health' ? '!hidden' : ''}
        `}>
          <DataGrid />
        </main>

        {/* ── Right / full panel ── */}
        {activePanel !== 'grid' && (
          <aside className={`
            ${activePanel === 'health' ? 'w-full' : 'w-full lg:w-[440px] xl:w-[520px] 2xl:w-[600px]'}
            bg-card shadow-xl z-10 overflow-hidden flex flex-col shrink-0
          `}>
            {activePanel === 'review'     && <ReviewQueue />}
            {activePanel === 'inspector'  && <ColumnInspector />}
            {activePanel === 'recipe'     && <RecipePanel />}
            {activePanel === 'issues'     && <IssuesReport />}
            {activePanel === 'validation' && <ValidationRules />}
            {activePanel === 'quality'    && <QualityDashboard />}
            {activePanel === 'audit'      && <AuditLogViewer />}
            {activePanel === 'report'     && <CleaningReportViewer />}
            {activePanel === 'health'     && <FeatureHealth />}
          </aside>
        )}
      </div>
    </div>
  );
}

// ── Sidebar helpers ───────────────────────────────────────────────────────────
function SidebarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 space-y-0.5">
      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-2 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function SidebarItem({
  panel, isActive, badge, onClick,
}: {
  panel: (typeof PANELS)[0];
  isActive: boolean;
  badge?: number;
  onClick: () => void;
}) {
  const Icon = panel.icon;
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors group
        ${isActive
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}
      `}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
        <span className="min-w-0">
          <span className="block text-xs font-medium leading-tight truncate">{panel.label}</span>
          <span className="block text-[10px] text-muted-foreground leading-tight truncate">{panel.sublabel}</span>
        </span>
      </span>
      {!!badge && badge > 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ml-1 ${
          isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}
