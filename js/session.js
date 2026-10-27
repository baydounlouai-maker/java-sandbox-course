// Where the code lives: a Yjs document that is either local (saved to localStorage)
// or shared with a room of peers.
import { Y, Awareness, RoomProvider } from './collab.js';

const KEYS = {
  progress: 'javaIsland.progress.v1',
  user: 'javaIsland.user.v1',
  code: 'javaIsland.code.v1',
  room: (id) => 'javaIsland.room.' + id,
  rooms: 'javaIsland.rooms.v1'
};

export const PEER_COLORS = ['#ff7a29', '#2f6bff', '#3fa65b', '#b4308a', '#7b3fe4', '#0a7a8a', '#d48a00', '#e0342b'];

function readJSON(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export const store = {
  progress() {
    const p = readJSON(KEYS.progress, {});
    return { current: p.current || null, done: p.done || {}, steps: p.steps || {}, hints: p.hints || {} };
  },
  saveProgress(p) { writeJSON(KEYS.progress, p); },
  user() {
    const u = readJSON(KEYS.user, null);
    if (u && u.name) return u;
    return { name: '', color: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)] };
  },
  saveUser(u) { writeJSON(KEYS.user, u); },
  code() { return readJSON(KEYS.code, {}); },
  saveCode(c) { return writeJSON(KEYS.code, c); },
  roomState(id) {
    try {
      const s = localStorage.getItem(KEYS.room(id));
      if (!s) return null;
      return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    } catch (e) {
      return null;
    }
  },
  saveRoomState(id, update) {
    try {
      let bin = '';
      for (let i = 0; i < update.length; i += 0x8000) bin += String.fromCharCode.apply(null, update.subarray(i, i + 0x8000));
      localStorage.setItem(KEYS.room(id), btoa(bin));
      const rooms = readJSON(KEYS.rooms, []).filter((r) => r !== id);
      rooms.unshift(id);
      for (const old of rooms.slice(6)) localStorage.removeItem(KEYS.room(old));
      writeJSON(KEYS.rooms, rooms.slice(0, 6));
    } catch (e) { /* storage full: the room still works, it just isn't remembered */ }
  }
};

export function sortFiles(names) {
  return [...names].sort((a, b) => (a === 'Main.java' ? -1 : b === 'Main.java' ? 1 : a.localeCompare(b)));
}

export class Session {
  constructor({ roomId = null, isHost = false, user, handlers = {} }) {
    this.roomId = roomId;
    this.isHost = isHost;
    this.handlers = handlers;
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.lessons = this.doc.getMap('lessons');
    this.meta = this.doc.getMap('meta');
    this.provider = null;
    this.setUser(user);

    if (roomId) {
      const saved = store.roomState(roomId);
      if (saved) {
        try { Y.applyUpdate(this.doc, saved, 'storage'); } catch (e) { /* ignore broken state */ }
      }
      // a guest who has been here before already has the code
      this.ready = isHost || this.lessons.size > 0;
      this.provider = new RoomProvider(this.doc, this.awareness, roomId, {
        onSynced: () => {
          if (!this.ready) {
            this.ready = true;
            handlers.onReady && handlers.onReady('synced');
          }
          handlers.onSynced && handlers.onSynced();
        },
        onPeers: (n) => handlers.onPeers && handlers.onPeers(n),
        onRun: (payload, peerId) => handlers.onRemoteRun && handlers.onRemoteRun(payload, peerId),
        onError: (d) => handlers.onError && handlers.onError(d)
      });
    } else {
      this.ready = true;
      const saved = store.code();
      this.doc.transact(() => {
        for (const [lessonId, files] of Object.entries(saved)) {
          const m = new Y.Map();
          for (const [name, text] of Object.entries(files)) m.set(name, new Y.Text(text));
          this.lessons.set(lessonId, m);
        }
      }, 'storage');
    }

    let timer = null;
    this.doc.on('update', (u, origin) => {
      if (origin === 'storage') return;
      clearTimeout(timer);
      timer = setTimeout(() => this.persist(), 400);
    });
    window.addEventListener('beforeunload', () => this.persist());
  }

  get shared() { return !!this.roomId; }

  setUser(user) {
    this.user = user;
    this.awareness.setLocalStateField('user', { name: user.name || 'Guest', color: user.color, colorLight: user.color + '40' });
  }

  persist() {
    if (this.roomId) store.saveRoomState(this.roomId, Y.encodeStateAsUpdate(this.doc));
    else store.saveCode(this.exportAll());
  }

  exportAll() {
    const out = {};
    for (const [id, m] of this.lessons) {
      out[id] = {};
      for (const [name, t] of m) out[id][name] = t.toString();
    }
    return out;
  }

  files(lessonId) {
    return this.lessons.get(lessonId) || null;
  }

  // create the lesson's files if nobody has yet. Concurrent creation is safe:
  // Y.Map keeps exactly one winner for the key, so everyone ends up on the same files.
  ensureLesson(lesson) {
    if (this.lessons.has(lesson.id)) return this.lessons.get(lesson.id);
    let seed = lesson.starter;
    if (this.roomId) {
      const own = store.code()[lesson.id];
      if (own && Object.keys(own).length) seed = own;
    }
    this.doc.transact(() => {
      const m = new Y.Map();
      for (const [name, text] of Object.entries(seed)) m.set(name, new Y.Text(text));
      this.lessons.set(lesson.id, m);
    });
    return this.lessons.get(lesson.id);
  }

  replaceFiles(lessonId, files) {
    this.doc.transact(() => {
      const m = new Y.Map();
      for (const [name, text] of Object.entries(files)) m.set(name, new Y.Text(text));
      this.lessons.set(lessonId, m);
    });
  }

  fileNames(lessonId) {
    const m = this.files(lessonId);
    return m ? sortFiles([...m.keys()]) : [];
  }

  snapshot(lessonId) {
    const m = this.files(lessonId);
    if (!m) return [];
    return this.fileNames(lessonId).map((name) => ({ name, src: m.get(name).toString() }));
  }

  addFile(lessonId, name, text) {
    const m = this.files(lessonId);
    if (!m || m.has(name)) return false;
    m.set(name, new Y.Text(text));
    return true;
  }

  deleteFile(lessonId, name) {
    const m = this.files(lessonId);
    if (m) m.delete(name);
  }

  peers() {
    const list = [];
    for (const [clientId, state] of this.awareness.getStates()) {
      if (!state.user) continue;
      list.push({ id: clientId, self: clientId === this.awareness.clientID, ...state });
    }
    return list;
  }

  destroy() {
    this.persist();
    if (this.provider) this.provider.destroy();
    this.awareness.destroy();
    this.doc.destroy();
  }
}
