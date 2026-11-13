import { useState } from 'react';
import { AdjustPanel } from './AdjustPanel';
import { ImagePanel } from './ImagePanel';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';

type Tab = 'properties' | 'adjust' | 'image';

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('properties');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'properties', label: 'Properties' },
    { id: 'adjust', label: 'Adjust' },
    { id: 'image', label: 'Image' },
  ];
  return (
    <aside className="right-panel" aria-label="Side panels">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-scroll" role="tabpanel">
        {tab === 'properties' && <PropertiesPanel />}
        {tab === 'adjust' && <AdjustPanel />}
        {tab === 'image' && <ImagePanel />}
      </div>
      <LayersPanel />
    </aside>
  );
}
