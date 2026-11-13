import { useEffect, useMemo } from 'react';
import { DialogHost } from './components/Dialogs';
import { OptionsBar } from './components/OptionsBar';
import { RightPanel } from './components/RightPanel';
import { StatusBar } from './components/StatusBar';
import { Toasts } from './components/Toasts';
import { ToolBar } from './components/ToolBar';
import { TopBar } from './components/TopBar';
import { Workspace } from './components/Workspace';
import { useShortcuts } from './hooks/useShortcuts';
import { IdPhotoMaker } from './id-photo/IdPhotoMaker';
import { StudioContext, useUi } from './services/context';
import { Studio } from './services/studio';
import { ui } from './services/ui';

export default function App() {
  const studio = useMemo(() => new Studio(undefined, { persistPrefs: true }), []);
  const view = useUi((u) => u.view);
  useShortcuts(studio, view === 'editor', true);

  useEffect(() => {
    (window as unknown as { __studio?: Studio; __ui?: typeof ui }).__studio = studio;
    (window as unknown as { __ui?: typeof ui }).__ui = ui;
    const warn = (e: BeforeUnloadEvent) => {
      if (studio.store.state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [studio]);

  return (
    <StudioContext.Provider value={studio}>
      <div className="app">
        <TopBar />
        <OptionsBar />
        <div className="main">
          <ToolBar />
          <Workspace />
          <RightPanel />
        </div>
        <StatusBar />
        <Toasts />
      </div>
      {view === 'id' && <IdPhotoMaker editor={studio} />}
      <DialogHost />
    </StudioContext.Provider>
  );
}
