import { create } from 'zustand';

export interface PanelFrame {
  type: 'site' | 'work' | 'event';
  id: string;
}

export interface VisitEntry {
  type: 'king' | 'site' | 'work' | 'event' | 'painting' | 'journey' | 'step';
  id: string;
  label: string;
  ts: number;
}

interface AppState {
  currentKingFilter: string | null;
  currentTab: 'king' | 'heritage';
  panelStack: PanelFrame[];
  mapFocusHeritageId: string | null;
  visitedLog: VisitEntry[];

  setKingFilter: (id: string | null) => void;
  setTab: (tab: 'king' | 'heritage') => void;
  focusHeritage: (id: string) => void;
  openSite: (id: string) => void;
  openWork: (id: string) => void;
  openEvent: (id: string) => void;
  goBack: () => void;
  jumpBreadcrumb: (index: number) => void;
  clearPanel: () => void;
  logVisit: (type: VisitEntry['type'], id: string, label: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentKingFilter: null,
  currentTab: 'king',
  panelStack: [],
  mapFocusHeritageId: null,
  visitedLog: [],

  setKingFilter: (id) => set({ currentKingFilter: id }),
  setTab: (tab) => set({ currentTab: tab }),
  focusHeritage: (id) => set({ mapFocusHeritageId: id }),

  openSite: (id) => {
    set({ mapFocusHeritageId: id, panelStack: [{ type: 'site', id }] });
  },
  openWork: (id) => set((s) => ({ panelStack: [...s.panelStack, { type: 'work', id }] })),
  openEvent: (id) => set((s) => ({ panelStack: [...s.panelStack, { type: 'event', id }] })),
  goBack: () => set((s) => ({ panelStack: s.panelStack.slice(0, -1) })),
  jumpBreadcrumb: (index) => set((s) => ({ panelStack: s.panelStack.slice(0, index + 1) })),
  clearPanel: () => set({ panelStack: [] }),

  logVisit: (type, id, label) => {
    const log = get().visitedLog;
    const last = log[log.length - 1];
    if (last && last.type === type && last.id === id) return;
    set({ visitedLog: [...log, { type, id, label, ts: Date.now() }] });
  },
}));
