window.Net = {
  socket: io(),
  id: sessionStorage.getItem('catId') || crypto.randomUUID(),
  room: null,
  remote: new Map(),
  listeners: new Set(),

  init() {
    sessionStorage.setItem('catId', this.id);

    this.socket.on('room-state', incoming => {
      const previousPlayers = new Map(
        (this.room?.players || []).map(player => [player.id, player])
      );

      incoming.players = incoming.players.map(player => {
        const existing = previousPlayers.get(player.id);
        if (existing) {
          Object.assign(existing, player);
          return existing;
        }
        return player;
      });

      this.room = incoming;
      for (const listener of [...this.listeners]) listener(incoming);
    });

    this.socket.on('scene-change', ({ scene }) => {
      this.remote.clear();
      if (!window.game?.scene) return;
      try {
        window.game.scene.start(scene);
      } catch (error) {
        console.error('Scene change failed:', scene, error);
      }
    });

    this.socket.on('player-state', data => {
      if (data.id === this.id) return;
      data.receivedAt = performance.now();

      let buffer = this.remote.get(data.id);
      if (!buffer) {
        buffer = [];
        this.remote.set(data.id, buffer);
      }

      if (buffer.length && data.seq <= buffer[buffer.length - 1].seq) return;
      buffer.push(data);
      while (buffer.length > 8) buffer.shift();
    });

    this.socket.on('chest-state', state => {
      window.dispatchEvent(
        new CustomEvent('cat-heist-chest', { detail: state })
      );
    });
  },

  ack(event, data) {
    return new Promise(resolve => {
      this.socket.timeout(5000).emit(event, data, (error, response) => {
        if (error) {
          resolve({ ok: false, message: 'Server did not respond.' });
          return;
        }
        resolve(response || { ok: false, message: 'Empty server response.' });
      });
    });
  },

  onRoom(listener) {
    this.listeners.add(listener);
    if (this.room) listener(this.room);
    return () => this.listeners.delete(listener);
  },

  scene(scene) {
    return this.ack('set-scene', { scene });
  },

  state(data) {
    this.socket.emit('player-state', data);
  },

  objective(type) {
    return this.ack('objective', { type });
  },

  chest() {
    return this.ack('drop-chest', {});
  },

  skip(level) {
    return this.ack('skip-objective', { level });
  },

  msg(text) {
    const element = document.getElementById('net-message');
    if (!element) return;
    element.textContent = text;
    element.style.display = 'block';
    setTimeout(() => {
      element.style.display = 'none';
    }, 2600);
  }
};

Net.init();
