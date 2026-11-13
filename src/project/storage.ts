import type { DocumentModel } from '../types';
import { uid } from '../utils/id';
import { parseProject, serializeProject } from './format';

export interface KeyValueStore<T> {
  put(key: string, value: T): Promise<void>;
  get(key: string): Promise<T | undefined>;
  remove(key: string): Promise<void>;
  all(): Promise<T[]>;
}

export class MemoryStore<T> implements KeyValueStore<T> {
  private readonly map = new Map<string, T>();
  async put(key: string, value: T) {
    this.map.set(key, value);
  }
  async get(key: string) {
    return this.map.get(key);
  }
  async remove(key: string) {
    this.map.delete(key);
  }
  async all() {
    return [...this.map.values()];
  }
}

const DB_NAME = 'photo-studio';
const DB_VERSION = 1;
export const STORE_PROJECTS = 'projects';
export const STORE_TEMPLATES = 'templates';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS);
        if (!db.objectStoreNames.contains(STORE_TEMPLATES)) db.createObjectStore(STORE_TEMPLATES);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error('Could not open the browser database.'));
      };
    });
  }
  return dbPromise;
}

function wrap<R>(req: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Database request failed.'));
  });
}

/** IndexedDB-backed store (browser only). */
export class IndexedDbStore<T> implements KeyValueStore<T> {
  constructor(private readonly storeName: string) {}

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await openDb();
    return db.transaction(this.storeName, mode).objectStore(this.storeName);
  }
  async put(key: string, value: T) {
    await wrap((await this.tx('readwrite')).put(value, key));
  }
  async get(key: string) {
    return (await wrap((await this.tx('readonly')).get(key))) as T | undefined;
  }
  async remove(key: string) {
    await wrap((await this.tx('readwrite')).delete(key));
  }
  async all() {
    return (await wrap((await this.tx('readonly')).getAll())) as T[];
  }
}

export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  layerCount: number;
  thumbnail?: string;
  /** Output of serializeProject(). */
  json: string;
}

export interface TemplateRecord extends ProjectRecord {
  category: string;
}

/** Saves and loads editable projects. Works with any KeyValueStore. */
export class ProjectRepository {
  constructor(private readonly store: KeyValueStore<ProjectRecord>) {}

  async save(doc: DocumentModel, existingId: string | null, thumbnail?: string): Promise<ProjectRecord> {
    const record: ProjectRecord = {
      id: existingId ?? uid('proj'),
      name: doc.name,
      updatedAt: Date.now(),
      width: doc.width,
      height: doc.height,
      layerCount: doc.layers.length,
      thumbnail,
      json: serializeProject(doc),
    };
    await this.store.put(record.id, record);
    return record;
  }

  async open(id: string): Promise<DocumentModel> {
    const rec = await this.store.get(id);
    if (!rec) throw new Error('That project no longer exists.');
    return parseProject(rec.json);
  }

  async list(): Promise<ProjectRecord[]> {
    return (await this.store.all()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
  }

  async rename(id: string, name: string): Promise<void> {
    const rec = await this.store.get(id);
    if (!rec) return;
    const doc = parseProject(rec.json);
    await this.store.put(id, { ...rec, name, json: serializeProject({ ...doc, name }), updatedAt: Date.now() });
  }
}

/** User-made templates: same storage, plus a category. */
export class TemplateRepository {
  constructor(private readonly store: KeyValueStore<TemplateRecord>) {}

  async save(doc: DocumentModel, category: string, name?: string, thumbnail?: string): Promise<TemplateRecord> {
    const named = name ? { ...doc, name } : doc;
    const record: TemplateRecord = {
      id: uid('tpl'),
      name: named.name,
      category,
      updatedAt: Date.now(),
      width: named.width,
      height: named.height,
      layerCount: named.layers.length,
      thumbnail,
      json: serializeProject(named),
    };
    await this.store.put(record.id, record);
    return record;
  }

  /** Update the stored design of an existing template (edit). */
  async update(id: string, doc: DocumentModel, thumbnail?: string): Promise<void> {
    const rec = await this.store.get(id);
    if (!rec) throw new Error('That template no longer exists.');
    await this.store.put(id, {
      ...rec,
      name: doc.name,
      updatedAt: Date.now(),
      width: doc.width,
      height: doc.height,
      layerCount: doc.layers.length,
      thumbnail: thumbnail ?? rec.thumbnail,
      json: serializeProject(doc),
    });
  }

  async duplicate(id: string): Promise<TemplateRecord> {
    const rec = await this.store.get(id);
    if (!rec) throw new Error('That template no longer exists.');
    const doc = parseProject(rec.json);
    return this.save({ ...doc, id: uid('doc') }, rec.category, `${rec.name} copy`, rec.thumbnail);
  }

  async open(id: string): Promise<DocumentModel> {
    const rec = await this.store.get(id);
    if (!rec) throw new Error('That template no longer exists.');
    return parseProject(rec.json);
  }

  async list(): Promise<TemplateRecord[]> {
    return (await this.store.all()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
  }
}

export function browserRepositories(): { projects: ProjectRepository; templates: TemplateRepository } {
  return {
    projects: new ProjectRepository(new IndexedDbStore<ProjectRecord>(STORE_PROJECTS)),
    templates: new TemplateRepository(new IndexedDbStore<TemplateRecord>(STORE_TEMPLATES)),
  };
}
