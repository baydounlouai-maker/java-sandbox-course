// Peer-to-peer rooms: Yjs documents synced over WebRTC. Trystero finds peers through public
// Nostr relays, so there's no server to run.
import { Y, Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates, joinRoom } from '../vendor/editor.js';

const APP_ID = 'java-island-3d-sandbox';

export class RoomProvider {
  constructor(doc, awareness, roomId, handlers = {}) {
    this.doc = doc;
    this.awareness = awareness;
    this.roomId = roomId;
    this.handlers = handlers;
    this.synced = false;
    this.peerClients = new Map(); // peerId -> Set(clientID)
    this.peers = new Set();

    this.room = joinRoom({ appId: APP_ID }, roomId, {
      onJoinError: (details) => handlers.onError && handlers.onError(details)
    });
    const sv = this.room.makeAction('sv');
    const up = this.room.makeAction('up');
    const aw = this.room.makeAction('aw');
    const run = this.room.makeAction('run');
    this.actions = { sv, up, aw, run };

    sv.onMessage = (data, { peerId }) => {
      const diff = Y.encodeStateAsUpdate(doc, new Uint8Array(data));
      up.send(diff, { target: peerId });
    };
    up.onMessage = (data, { peerId }) => {
      Y.applyUpdate(doc, new Uint8Array(data), this);
      if (!this.synced) {
        this.synced = true;
        handlers.onSynced && handlers.onSynced(peerId);
      }
    };
    aw.onMessage = (data, { peerId }) => {
      applyAwarenessUpdate(awareness, new Uint8Array(data), peerId);
    };
    run.onMessage = (data, { peerId }) => handlers.onRun && handlers.onRun(data, peerId);

    this.room.onPeerJoin = (peerId) => {
      this.peers.add(peerId);
      sv.send(Y.encodeStateVector(doc), { target: peerId });
      aw.send(encodeAwarenessUpdate(awareness, [awareness.clientID]), { target: peerId });
      handlers.onPeers && handlers.onPeers(this.peers.size);
    };
    this.room.onPeerLeave = (peerId) => {
      this.peers.delete(peerId);
      const clients = this.peerClients.get(peerId);
      if (clients) removeAwarenessStates(awareness, [...clients], 'peer-left');
      this.peerClients.delete(peerId);
      handlers.onPeers && handlers.onPeers(this.peers.size);
    };

    this.onDocUpdate = (update, origin) => {
      if (origin !== this && this.peers.size) up.send(update);
    };
    doc.on('update', this.onDocUpdate);

    this.onAwareness = ({ added, updated, removed }, origin) => {
      if (origin === 'local') {
        if (this.peers.size) aw.send(encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]));
      } else if (typeof origin === 'string' && this.peers.has(origin)) {
        if (!this.peerClients.has(origin)) this.peerClients.set(origin, new Set());
        for (const c of [...added, ...updated]) this.peerClients.get(origin).add(c);
      }
    };
    awareness.on('update', this.onAwareness);
  }

  broadcastRun(payload) {
    if (this.peers.size) this.actions.run.send(payload);
  }

  destroy() {
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwareness);
    removeAwarenessStates(this.awareness, [this.awareness.clientID], 'local');
    try { this.room.leave(); } catch (e) { /* ignore */ }
  }
}

export function newRoomId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export { Y, Awareness };
