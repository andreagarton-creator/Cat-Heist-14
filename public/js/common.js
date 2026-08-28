window.G = {
  font: 'Raleway, Arial, sans-serif',

  button(scene, x, y, width, label, onClick) {
    const button = scene.add
      .rectangle(x, y, width, 54, 0x111111, 0.88)
      .setStrokeStyle(2, 0xffffff, 0.7)
      .setInteractive({ useHandCursor: true })
      .setDepth(900);

    scene.add
      .text(x, y, label, {
        fontFamily: G.font,
        fontSize: '18px',
        fontStyle: '700',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setDepth(901);

    button.on('pointerdown', onClick);
    return button;
  },

  hud(scene, name, level) {
    scene.add
      .rectangle(960, 47, 1920, 94, 0x000000, 0.92)
      .setDepth(880);

    scene.add
      .text(25, 16, name, {
        fontFamily: G.font,
        fontSize: '28px',
        fontStyle: '700',
        color: '#ffffff'
      })
      .setDepth(881);

    G.button(scene, 1460, 46, 175, 'RETURN TO MAP', async () => {
      if (!Session.isHost) {
        Net.msg('Only the host changes scenes.');
        return;
      }

      const response = await Net.scene('Map');
      if (!response || !response.ok) {
        Net.msg(response?.message || 'Could not return to the map.');
      }
    });

    G.button(scene, 1650, 46, 155, 'RESTART', () => {
      scene.scene.restart();
    });

    if (Session.isHost) {
      G.button(scene, 1815, 46, 150, 'SKIP', async () => {
        const response = await Net.skip(level);
        if (!response || !response.ok) {
          Net.msg(response?.message || 'Could not skip the objective.');
          return;
        }
        Net.msg('Objective skipped.');
      });
    }
  },

  achievement(scene, text) {
    scene.add
      .text(960, 155, text, {
        fontFamily: G.font,
        fontSize: '34px',
        fontStyle: '800',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.82)',
        padding: { x: 24, y: 13 },
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(890);
  },

  platform(scene, x, y, width, height = 30) {
    const platform = scene.add.rectangle(x, y, width, height, 0xff0000, 0);
    scene.physics.add.existing(platform, true);
    return platform;
  },

  zone(scene, x, y, width, height) {
    const zone = scene.add.rectangle(x, y, width, height, 0xffff00, 0);
    scene.physics.add.existing(zone, true);
    return zone;
  },

  dust(scene, x, y, colour = 0xb9a789) {
    for (let i = 0; i < 9; i += 1) {
      const mote = scene.add
        .circle(
          x + Phaser.Math.Between(-18, 18),
          y,
          Phaser.Math.Between(2, 5),
          colour,
          0.75
        )
        .setDepth(520);

      scene.tweens.add({
        targets: mote,
        x: mote.x + Phaser.Math.Between(-30, 30),
        y: y - Phaser.Math.Between(16, 28),
        scale: 0.3,
        alpha: 0,
        duration: 340,
        onComplete: () => mote.destroy()
      });
    }
  },

  hideInputs() {
    for (const id of ['player-name', 'room-code']) {
      const element = document.getElementById(id);
      if (element) element.style.display = 'none';
    }
  }
};
