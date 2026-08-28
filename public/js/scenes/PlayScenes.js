class MultiScene extends Phaser.Scene {
  setupPlayer(start, solids) {
    this.remotes = new Map();
    this.seq = 0;
    this.cat = new CatPlayer(this, start.x, start.y, Session.local);
    solids.forEach(platform => this.physics.add.collider(this.cat.root, platform));
    this.keys = this.input.keyboard.createCursorKeys();
    this.keys.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.unsubscribeRoom = Net.onRoom(room => this.syncRemote(room));
    this.lastSend = 0;
    this.events.once('shutdown', () => {
      if (this.unsubscribeRoom) this.unsubscribeRoom();
      this.remotes.forEach(remote => remote.destroy());
      this.remotes.clear();
    });
  }

  syncRemote(room) {
    const active = room.players.filter(player =>
      player.connected && player.id !== Net.id && player.color !== null
    );
    const activeIds = new Set(active.map(player => player.id));

    for (const [id, remote] of this.remotes) {
      if (!activeIds.has(id)) {
        remote.destroy();
        this.remotes.delete(id);
      }
    }

    for (const player of active) {
      let remote = this.remotes.get(player.id);
      if (!remote) {
        remote = new RemoteCat(this, player);
        this.remotes.set(player.id, remote);
      }
      remote.data = player;
      remote.cat.data = player;
    }
  }

  sample(id, now) {
    const buffer = Net.remote.get(id);
    if (!buffer || !buffer.length) return null;
    const renderTime = now - 100;
    while (buffer.length >= 2 && buffer[1].receivedAt <= renderTime) buffer.shift();
    const first = buffer[0];
    const second = buffer[1];
    if (!second) return first;
    const duration = Math.max(1, second.receivedAt - first.receivedAt);
    const amount = Phaser.Math.Clamp((renderTime - first.receivedAt) / duration, 0, 1);
    return {
      x: Phaser.Math.Linear(first.x, second.x, amount),
      y: Phaser.Math.Linear(first.y, second.y, amount),
      facing: second.facing,
      pose: second.pose
    };
  }

  multiUpdate(time) {
    this.cat.update(this.keys, time, true);
    if (time - this.lastSend > 50) {
      const body = this.cat.root.body;
      const grounded = body.blocked.down || body.touching.down;
      const pose = !grounded ? 'leap' : Math.abs(body.velocity.x) > 18 ? 'run' : 'idle';
      Net.state({
        seq: ++this.seq,
        x: this.cat.root.x,
        y: this.cat.root.y,
        vx: body.velocity.x,
        vy: body.velocity.y,
        facing: this.cat.facing,
        pose
      });
      this.lastSend = time;
    }

    const now = performance.now();
    for (const [id, remote] of this.remotes) {
      const data = this.sample(id, now);
      if (data) remote.update(time, data);
      else remote.cat.draw(time, false, remote.data.pose || 'idle');
    }
  }
}

window.LobbyScene = class extends MultiScene {
  constructor() { super('Lobby'); }
  preload() { this.load.image('lobby', 'assets/lobby.jpg'); }
  create() {
    this.add.image(960, 540, 'lobby');
    const platforms = [
      G.platform(this, 960, 1015, 1920, 110),
      G.platform(this, 18, 540, 36, 1080),
      G.platform(this, 1902, 540, 36, 1080)
    ];
    this.setupPlayer({ x: 960, y: -80 }, platforms);
    if (Session.isHost) {
      G.button(this, 245, 595, 190, 'START GAME', async () => {
        const response = await Net.scene('Intro1');
        if (!response?.ok) Net.msg(response?.message || 'Could not start game.');
      });
    }
    G.button(this, 245, 665, 190, 'QUIT', () => location.reload());
    this.roster = this.add.text(1640, 80, '', {
      fontFamily: G.font,
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#0009',
      padding: { x: 12, y: 10 }
    }).setDepth(910);
    this.rosterUnsub = Net.onRoom(room => {
      this.roster.setText(
        'ROOM ' + room.code + '\n' +
        room.players.filter(player => player.connected).map(player => '• ' + player.name).join('\n')
      );
    });
    this.events.once('shutdown', () => this.rosterUnsub && this.rosterUnsub());
  }
  update(time) { this.multiUpdate(time); }
};

window.StoryScene = class extends Phaser.Scene {
  constructor(key, image, next) {
    super(key);
    this.image = image;
    this.next = next;
  }
  preload() { this.load.image(this.image, 'assets/' + this.image + '.jpg'); }
  create() {
    this.add.image(960, 540, this.image);
    if (!Session.isHost) return;
    this.add.rectangle(1745, 970, 250, 110, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', async () => {
        const nextScene = this.next;
        const responsePromise = Net.scene(nextScene);
        this.scene.start(nextScene);
        const response = await responsePromise;
        if (!response?.ok) Net.msg(response?.message || 'Other players may not have followed.');
      });
  }
};

window.MapScene = class extends Phaser.Scene {
  constructor() { super('Map'); }
  preload() { this.load.image('map', 'assets/map.jpg'); }
  create() {
    this.add.image(960, 540, 'map');
    if (!Session.isHost) return;
    [
      [270, 642, 392, 90, 'Warehouse'],
      [1030, 264, 330, 90, 'Dock'],
      [1618, 764, 390, 90, 'Rooftops']
    ].forEach(item => {
      this.add.rectangle(item[0], item[1], item[2], item[3], 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => Net.scene(item[4]));
    });
  }
};

window.WarehouseScene = class extends MultiScene {
  constructor() { super('Warehouse'); }
  preload() { this.load.image('wh', 'assets/warehouse.jpg'); }
  create() {
    this.add.image(960, 540, 'wh');
    const platforms = [
      G.platform(this, 960, 1040, 1920, 70), G.platform(this, 15, 540, 30, 1080),
      G.platform(this, 1905, 540, 30, 1080), G.platform(this, 670, 340, 1145, 48),
      G.platform(this, 286, 575, 370, 32), G.platform(this, 1628, 433, 355, 38),
      G.platform(this, 1630, 714, 372, 38), G.platform(this, 716, 812, 96, 78),
      G.platform(this, 812, 812, 96, 78), G.platform(this, 764, 733, 96, 80),
      G.platform(this, 1198, 995, 104, 96), G.platform(this, 1302, 995, 104, 96),
      G.platform(this, 1198, 899, 104, 96), G.platform(this, 1302, 899, 104, 96),
      G.platform(this, 1250, 803, 104, 96)
    ];
    this.setupPlayer({ x: 120, y: 940 }, platforms);
    this.chest = this.makeChest(1027, 280);
    this.top = G.zone(this, 1027, 288, 130, 95);
    this.physics.add.overlap(this.cat.root, this.top, () => Net.chest());
    this.chestHandler = event => { if (event.detail.dropped) this.dropChest(); };
    window.addEventListener('cat-heist-chest', this.chestHandler);
    this.events.once('shutdown', () => window.removeEventListener('cat-heist-chest', this.chestHandler));
    if (Net.room.world.chestDropped) this.dropChest(true);
    G.hud(this, 'WAREHOUSE OF DISGUISES', 'Warehouse');
  }
  makeChest(x, y) {
    const chest = this.add.container(x, y).setDepth(650);
    const graphics = this.add.graphics();
    graphics.fillStyle(0x5b301b).fillRoundedRect(-48, -34, 96, 70, 10);
    graphics.fillStyle(0x7d492a).fillRoundedRect(-48, -44, 96, 34, 10);
    graphics.lineStyle(6, 0xd39a3c).strokeRoundedRect(-48, -44, 96, 80, 10);
    graphics.fillStyle(0xf6c453).fillRoundedRect(-12, -8, 24, 26, 4);
    chest.add(graphics);
    return chest;
  }
  dropChest(immediate = false) {
    if (this.dropped) return;
    this.dropped = true;
    if (this.top) this.top.destroy();
    const enablePickup = () => {
      this.floor = G.zone(this, 1027, 965, 125, 95);
      this.physics.add.overlap(this.cat.root, this.floor, async () => {
        if (Session.local.hasCostume) return;
        const response = await Net.objective('costume');
        if (response?.ok) {
          this.chest.setVisible(false);
          G.achievement(this, 'PUFFIN DISGUISE ACQUIRED');
        }
      });
    };
    if (immediate) {
      this.chest.y = 970;
      enablePickup();
    } else {
      this.tweens.add({
        targets: this.chest,
        y: 970,
        angle: 300,
        duration: 900,
        ease: 'Bounce.Out',
        onComplete: enablePickup
      });
    }
  }
  update(time) { this.multiUpdate(time); }
};

window.DockScene = class extends MultiScene {
  constructor() { super('Dock'); }
  preload() { this.load.image('dock', 'assets/dock.jpg'); }
  create() {
    this.add.image(960, 540, 'dock');
    const platforms = [
      G.platform(this, 307, 948, 614, 55), G.platform(this, 275, 535, 462, 50),
      G.platform(this, 728, 310, 198, 45), G.platform(this, 650, 370, 48, 160),
      G.platform(this, 1082, 448, 252, 50), G.platform(this, 838, 810, 280, 52),
      G.platform(this, 975, 730, 52, 220), G.platform(this, 1325, 780, 340, 55),
      G.platform(this, 1172, 925, 90, 310), G.platform(this, 1452, 925, 90, 310),
      G.platform(this, 1585, 300, 500, 55)
    ];
    this.setupPlayer({ x: 125, y: 835 }, platforms);
    this.fisherX = 1695;
    this.fisherY = 225;
    this.createFisherman();
    this.basket = G.zone(this, 1475, 235, 150, 90);
    this.physics.add.overlap(this.cat.root, this.basket, async () => {
      if (Session.local.hasFish || !Session.local.hasCostume) return;
      const response = await Net.objective('fish');
      if (response?.ok) G.achievement(this, 'GEM FISH ACQUIRED');
    });
    G.hud(this, 'THE DOCK', 'Dock');
    this.lastCatch = 0;
    this.lastReaction = 'none';
  }
  createFisherman() {
    const root = this.add.container(this.fisherX, this.fisherY).setDepth(760).setScale(1.25);
    const backLeg = this.add.graphics();
    const frontLeg = this.add.graphics();
    const body = this.add.graphics();
    const head = this.add.graphics();
    const armAndRod = this.add.graphics();

    backLeg.lineStyle(15, 0x293a4c).lineBetween(-17, 70, -24, 145);
    backLeg.fillStyle(0x121a22).fillEllipse(-24, 150, 30, 14);
    frontLeg.lineStyle(15, 0x293a4c).lineBetween(17, 70, 24, 145);
    frontLeg.fillStyle(0x121a22).fillEllipse(24, 150, 30, 14);
    body.fillStyle(0x714b33).fillRoundedRect(-43, 10, 86, 80, 22);
    body.fillStyle(0x344e63).fillRoundedRect(-34, -13, 68, 74, 24);
    head.fillStyle(0xd6ae7d).fillCircle(0, -49, 30);
    head.fillStyle(0x273d50).fillTriangle(-43, -65, 43, -65, 0, -105);
    head.fillStyle(0x38271f).fillRect(-18, -39, 36, 5);
    armAndRod.lineStyle(13, 0xd6ae7d).lineBetween(18, 4, 45, 35);
    armAndRod.lineStyle(7, 0x352318).lineBetween(44, 35, 133, -61);
    armAndRod.lineStyle(2, 0xc9e7e5).lineBetween(133, -61, 145, 168);

    root.add([backLeg, frontLeg, body, head, armAndRod]);
    this.fisherman = root;
    this.fisherRod = armAndRod;
    this.tweens.add({ targets: backLeg, angle: 4, duration: 1450, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.tweens.add({ targets: frontLeg, angle: -4, duration: 1750, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }
  animateCatch() {
    this.tweens.add({ targets: this.fisherRod, angle: -22, duration: 330, yoyo: true, hold: 300, ease: 'Sine.Out' });
    const fish = this.add.ellipse(1800, 850, 42, 20, 0x55e6ef).setStrokeStyle(2, 0xffffff).setDepth(770);
    const motion = { progress: 0 };
    this.tweens.add({
      targets: motion,
      progress: 1,
      duration: 1150,
      ease: 'Sine.InOut',
      onUpdate: () => {
        const q = motion.progress;
        fish.x = 1800 + (1475 - 1800) * q;
        fish.y = 850 - 560 * Math.sin(Math.PI * q) + (245 - 850) * q;
      },
      onComplete: () => fish.destroy()
    });
  }
  update(time) {
    this.multiUpdate(time);
    if (time - this.lastCatch > 5200) {
      this.lastCatch = time;
      this.animateCatch();
    }
    const distance = Phaser.Math.Distance.Between(this.cat.root.x, this.cat.root.y, this.fisherX, this.fisherY);
    const reaction = distance < 420 ? 'near' : distance < 720 ? 'aware' : 'none';
    if (reaction !== this.lastReaction) {
      this.lastReaction = reaction;
      if (reaction === 'aware') G.say(this, 1570, 190, Session.local.hasCostume ? 'Oh, aren’t you a pretty little thing?' : '...');
      if (reaction === 'near') G.say(this, 1570, 190, Session.local.hasCostume ? 'Come closer, little Puffin.' : '?!  Shoo! Away with you!');
    }
  }
};

window.RooftopsScene = class extends MultiScene {
  constructor() { super('Rooftops'); }
  preload() { this.load.image('roof', 'assets/rooftops.jpg'); }
  create() {
    this.add.image(960, 540, 'roof');
    const platforms = [
      G.platform(this, 960, 1000, 1920, 65), G.platform(this, 245, 535, 295, 520),
      G.platform(this, 420, 545, 135, 38), G.platform(this, 900, 540, 250, 525),
      G.platform(this, 755, 795, 145, 38), G.platform(this, 1525, 620, 520, 400),
      G.platform(this, 1525, 410, 520, 45)
    ];
    this.setupPlayer({ x: 100, y: 920 }, platforms);
    this.createKlepto();
    this.plate = G.zone(this, 1475, 365, 100, 45);
    this.physics.add.overlap(this.cat.root, this.plate, async () => {
      if (!Session.local.hasFish) return;
      const response = await Net.objective('deposit');
      if (response?.ok) G.achievement(this, 'HEIST COMPLETE');
    });
    G.hud(this, 'THE ROOFTOPS', 'Rooftops');
  }
  createKlepto() {
    const data = { color: 0x000000, hasCostume: false, hasFish: false };
    this.klepto = new CatPlayer(this, 1650, 330, data);
    this.klepto.root.setScale(1.2).setDepth(750);
    this.klepto.root.body.enable = false;
    this.kleptoNextBlink = 1600;
    this.kleptoBlinkUntil = 0;
  }
  update(time) {
    this.multiUpdate(time);
    if (time > this.kleptoNextBlink) {
      this.kleptoBlinkUntil = time + 115;
      this.kleptoNextBlink = time + Phaser.Math.Between(1800, 4300);
    }
    this.klepto.draw(time, time < this.kleptoBlinkUntil, 'idle');
  }
};
