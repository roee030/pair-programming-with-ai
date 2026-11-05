import type { PersistedSession, SessionStatus, SessionSummary } from './types';

const INDEX_KEY = 'pairFlow.sessions';
const LIMIT = 20;

export type SessionIndexStore = {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
};
export type SessionFileStore = {
  read(name: string): Promise<string | undefined>;
  write(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
};

export class SessionRepository {
  private summaries: SessionSummary[];

  constructor(private readonly index: SessionIndexStore, private readonly files: SessionFileStore) {
    this.summaries = validSummaries(index.get<unknown>(INDEX_KEY, []));
  }

  list(): readonly SessionSummary[] { return this.summaries; }

  /** The most recently updated session that is still open (active or paused). */
  async loadActive(): Promise<PersistedSession | undefined> {
    const summary = this.summaries.find(item => isOpen(item.status));
    return summary ? this.load(summary.id) : undefined;
  }

  /** Loads one saved session. A request that was running when the window closed comes back paused, ready to resume. */
  async load(id: string): Promise<PersistedSession | undefined> {
    try {
      const raw = await this.files.read(fileName(id));
      if (!raw) return undefined;
      const session = parseSession(JSON.parse(raw));
      if (!session) return undefined;
      if (session.status === 'active' && isRunningPhase(session.state.phase)) {
        const restored: PersistedSession = { ...session, status: 'paused', state: { ...session.state, phase: 'paused', resumePhase: session.state.phase } };
        await this.save(restored);
        return restored;
      }
      if (session.status === 'active' && session.state.phase === 'error' && session.state.resumePhase) {
        // A failure saved by an earlier run (or an older version of the extension) is stale after a restart.
        // Restore it as paused so the user resumes with a fresh request instead of seeing the old error again.
        const { error: _staleError, ...state } = session.state;
        const restored: PersistedSession = { ...session, status: 'paused', state: { ...state, phase: 'paused', resumePhase: session.state.resumePhase } };
        await this.save(restored);
        return restored;
      }
      return session;
    } catch { return undefined; }
  }

  async save(session: PersistedSession): Promise<void> {
    // Several sessions can stay open at once: starting a new story never cancels the one you left.
    if (isOpen(session.status)) await this.files.write(fileName(session.id), JSON.stringify(session));
    else await this.files.delete(fileName(session.id));
    const summary = toSummary(session);
    const sorted = [summary, ...this.summaries.filter(item => item.id !== session.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.summaries = sorted.slice(0, LIMIT);
    await Promise.all(sorted.slice(LIMIT).map(item => this.files.delete(fileName(item.id))));
    await this.index.update(INDEX_KEY, this.summaries);
  }

  async markStatus(id: string, status: SessionStatus): Promise<void> {
    if (!isOpen(status)) await this.files.delete(fileName(id));
    else {
      const raw = await this.files.read(fileName(id));
      const session = raw ? parseSession(JSON.parse(raw)) : undefined;
      if (session) await this.files.write(fileName(id), JSON.stringify({ ...session, status }));
    }
    this.summaries = this.summaries.map(item => item.id === id ? { ...item, status } : item);
    await this.index.update(INDEX_KEY, this.summaries);
  }

  async delete(id: string): Promise<void> {
    await this.files.delete(fileName(id));
    this.summaries = this.summaries.filter(item => item.id !== id);
    await this.index.update(INDEX_KEY, this.summaries);
  }
}

function isOpen(status: SessionStatus): boolean { return status === 'active' || status === 'paused'; }

function isRunningPhase(phase: PersistedSession['state']['phase']): phase is 'planning' | 'requestingChunk' | 'applying' {
  return phase === 'planning' || phase === 'requestingChunk' || phase === 'applying';
}

function fileName(id: string): string { return `session-${id}.json`; }
function toSummary(session: PersistedSession): SessionSummary {
  return { id: session.id, title: session.title, status: session.status, updatedAt: session.updatedAt };
}
function validSummaries(value: unknown): SessionSummary[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SessionSummary => !!item && typeof item === 'object'
    && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.updatedAt === 'string'
    && ['active', 'paused', 'done', 'canceled'].includes(String(item.status))).slice(0, LIMIT);
}
function parseSession(value: unknown): PersistedSession | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Partial<PersistedSession>;
  if (item.version !== 1 || typeof item.id !== 'string' || typeof item.title !== 'string'
    || typeof item.updatedAt !== 'string' || !item.state || !Array.isArray(item.history)
    || !['active', 'paused', 'done', 'canceled'].includes(String(item.status))) return undefined;
  return item as PersistedSession;
}
