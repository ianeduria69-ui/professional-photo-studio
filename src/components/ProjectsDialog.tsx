import { useCallback, useEffect, useState } from 'react';
import type { ProjectRecord, TemplateRecord } from '../project/storage';
import { useStudio } from '../services/context';
import { errorMessage } from '../services/studio';
import { ui } from '../services/ui';
import { BUILTIN_TEMPLATES } from '../templates/builtin';
import { Button, Modal, Row, Segmented, Select } from './ui';

const CATEGORIES = Array.from(new Set(BUILTIN_TEMPLATES.map((t) => t.category)));

export function ProjectsDialog({ tab: initial }: { tab: 'projects' | 'templates' }) {
  const studio = useStudio();
  const [tab, setTab] = useState(initial);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tplName, setTplName] = useState(studio.store.doc.name);
  const [cat, setCat] = useState(CATEGORIES[0]);

  const refresh = useCallback(async () => {
    try {
      setProjects(await studio.repositories.projects.list());
      setTemplates(await studio.repositories.templates.list());
      setError(null);
    } catch (e) {
      setError(`Browser storage is not available: ${errorMessage(e)}`);
    }
  }, [studio]);
  useEffect(() => { void refresh(); }, [refresh]);

  const guard = async (fn: () => Promise<unknown>) => { try { await fn(); await refresh(); } catch (e) { setError(errorMessage(e)); } };
  const fmt = (t: number) => new Date(t).toLocaleString();

  return (
    <Modal title="Projects & templates" width={760} onClose={() => ui.close()}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'projects', label: 'My projects' }, { value: 'templates', label: 'Templates' }]} />
      {error && <p className="error-text">{error}</p>}
      {tab === 'projects' && (
        <ul className="rec-list" data-testid="project-list">
          {projects.length === 0 && <li className="empty">No saved projects yet. Use File &gt; Save.</li>}
          {projects.map((p) => (
            <li key={p.id}>
              {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <span className="thumb-ph" />}
              <div className="rec-info"><strong>{p.name}</strong><span>{p.width} × {p.height} px · {p.layerCount} layer(s) · {fmt(p.updatedAt)}</span></div>
              <Button small primary onClick={async () => { if (await studio.openStored(p.id)) ui.close(); }}>Open</Button>
              <Button small onClick={async () => { const n = await ui.prompt('Rename project', 'Name', p.name); ui.open({ type: 'projects', tab: 'projects' }); if (n?.trim()) await guard(() => studio.repositories.projects.rename(p.id, n.trim())); }}>Rename</Button>
              <Button small danger onClick={() => guard(() => studio.repositories.projects.remove(p.id))}>Delete</Button>
            </li>
          ))}
        </ul>
      )}
      {tab === 'templates' && (
        <>
          <h4>Built-in templates</h4>
          <div className="tpl-grid">
            {BUILTIN_TEMPLATES.map((t) => (
              <button key={t.id} className="tpl" data-testid={`tpl-${t.id}`} onClick={async () => { if (await studio.newFromBuiltin(t.id)) ui.close(); }}>
                <strong>{t.name}</strong><span>{t.category}</span><span>{t.description}</span>
              </button>
            ))}
          </div>
          <h4>My templates</h4>
          <ul className="rec-list" data-testid="template-list">
            {templates.length === 0 && <li className="empty">No custom templates yet. Save the current design below.</li>}
            {templates.map((t) => (
              <li key={t.id}>
                {t.thumbnail ? <img src={t.thumbnail} alt="" /> : <span className="thumb-ph" />}
                <div className="rec-info"><strong>{t.name}</strong><span>{t.category} · {t.width} × {t.height} px · {fmt(t.updatedAt)}</span></div>
                <Button small primary onClick={async () => { if (await studio.newFromTemplate(t.id, false)) ui.close(); }}>Use</Button>
                <Button small onClick={async () => { if (await studio.newFromTemplate(t.id, true)) ui.close(); }}>Edit</Button>
                <Button small onClick={() => guard(() => studio.repositories.templates.duplicate(t.id))}>Duplicate</Button>
                <Button small danger onClick={() => guard(() => studio.repositories.templates.remove(t.id))}>Delete</Button>
              </li>
            ))}
          </ul>
          <h4>Save current design as a template</h4>
          <Row label="Name"><input type="text" aria-label="Template name" value={tplName} onChange={(e) => setTplName(e.currentTarget.value)} /></Row>
          <Row label="Category"><Select value={cat} ariaLabel="Template category" onChange={setCat} options={CATEGORIES.map((c) => ({ value: c, label: c }))} /></Row>
          <Button primary onClick={() => guard(() => studio.saveAsTemplate(cat, tplName.trim() || 'Template'))}>Save as template</Button>
        </>
      )}
    </Modal>
  );
}
