import { create } from 'zustand';
import type { ColumnProfile } from '@workspace/api-client-react';

interface SessionState {
  sessionId: string | null;
  filename: string | null;
  sheets: string[];
  selectedSheet: string | null;
  columns: ColumnProfile[];
  selectedColumn: string | null;
  activePanel: 'grid' | 'review' | 'inspector' | 'recipe' | 'issues' | 'validation' | 'health' | 'quality' | 'audit' | 'report';
  undoStack: string[];
  dataGeneration: number;
  setSession: (sessionId: string, filename: string, sheets: string[]) => void;
  setColumns: (columns: ColumnProfile[]) => void;
  setSelectedColumn: (col: string | null) => void;
  setActivePanel: (panel: SessionState['activePanel']) => void;
  setSelectedSheet: (sheet: string | null) => void;
  pushUndo: (stepId: string) => void;
  clearSession: () => void;
  bumpDataGeneration: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  filename: null,
  sheets: [],
  selectedSheet: null,
  columns: [],
  selectedColumn: null,
  activePanel: 'grid',
  undoStack: [],
  dataGeneration: 0,
  setSession: (sessionId, filename, sheets) => set({ sessionId, filename, sheets, selectedSheet: sheets[0] || null }),
  setColumns: (columns) => set({ columns }),
  setSelectedColumn: (col) => set({ selectedColumn: col }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setSelectedSheet: (sheet) => set({ selectedSheet: sheet }),
  pushUndo: (stepId) => set((state) => ({ undoStack: [...state.undoStack, stepId] })),
  clearSession: () => set({
    sessionId: null,
    filename: null,
    sheets: [],
    selectedSheet: null,
    columns: [],
    selectedColumn: null,
    activePanel: 'grid',
    undoStack: [],
    dataGeneration: 0,
  }),
  bumpDataGeneration: () => set((state) => ({ dataGeneration: state.dataGeneration + 1 })),
}));