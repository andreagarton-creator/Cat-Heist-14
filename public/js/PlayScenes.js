class MultiScene extends Phaser.Scene{
  setupPlayer(start,solids){
    this.remotes=new Map();this.seq=0;
    this.cat=new CatPlayer(this,start.x,start.y,Session.local);
    solids.forEach(p=>this.physics.add.collider(this.cat.root,p));
    this.keys=this.input.keyboard.createCursorKeys();this.keys.space=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.unsubscribeRoom=Net.onRoom(room=>this.syncRemote(room));this.lastSend=0;
    this.events.once('shutdown',()=>{if(this.unsubscribeRoom)this.unsubscribeRoom();this.remotes.forEach(r=>r.destroy());this.remotes.clear()});
  }
  syncRemote(room){
    const active=room.players.filter(p=>p.connected&&p.id!==Net.id&&p.color!==null),ids=new Set(active.map(p=>p.id));
    for(const [id,remote] of this.remotes)if(!ids.has(id)){remote.destroy();this.remotes.delete(id)}
    for(const p of active){let remote=this.remotes.get(p.id);if(!remote){remote=new RemoteCat(this,p);this.remotes.set(p.id,remote)}remote.data=p;remote.cat.data=p}
  }
  sample(id,now){
    const b=Net.remote.get(id);if(!b||!b.length)return null;
    const renderTime=now-100;
    while(b.length>=2&&b[1].receivedAt<=renderTime)b.shift();
    const a=b[0],n=b[1];if(!n)return a;
    const span=Math.max(1,n.receivedAt-a.receivedAt),q=Phaser.Math.Clamp((renderTime-a.receivedAt)/span,0,1);
    return{x:Phaser.Math.Linear(a.x,n.x,q),y:Phaser.Math.Linear(a.y,n.y,q),facing:n.facing,pose:n.pose};
  }
  multiUpdate(t){
    this.cat.update(this.keys,t,true);
    if(t-this.lastSend>50){const b=this.cat.root.body,pose=!(b.blocked.down||b.touching.down)?'leap':Math.abs(b.velocity.x)>18?'run':'idle';Net.state({seq:++this.seq,x:this.cat.root.x,y:this.cat.root.y,vx:b.velocity.x,vy:b.velocity.y,facing:this.cat.facing,pose});this.lastSend=t}
    const now=performance.now();for(const [id,remote] of this.remotes){const d=this.sample(id,now);if(d)remote.update(t,d);else remote.cat.draw(t,false,remote.data.pose||'idle')}
  }
}
window.LobbyScene=class extends MultiScene{constructor(){super('Lobby')}preload(){this.load.image('lobby','assets/lobby.jpg')}create(){this.add.image(960,540,'lobby');const p=[G.platform(this,960,1015,1920,110),G.platform(this,18,540,36,1080),G.platform(this,1902,540,36,1080)];this.setupPlayer({x:960,y:-80},p);if(Session.isHost)G.button(this,245,595,190,'START GAME',async()=>{const r=await Net.scene('Intro1');if(!r.ok)Net.msg(r.message)});G.button(this,245,665,190,'QUIT',()=>location.reload());this.roster=this.add.text(1640,80,'',{fontFamily:G.font,fontSize:'20px',color:'#fff',backgroundColor:'#0009',padding:{x:12,y:10}}).setDepth(910);this.rosterUnsub=Net.onRoom(room=>this.roster.setText('ROOM '+room.code+'\n'+room.players.filter(p=>p.connected).map(p=>'• '+p.name).join('\n')));this.events.once('shutdown',()=>this.rosterUnsub&&this.rosterUnsub())}update(t){this.multiUpdate(t)}};
window.StoryScene=class extends Phaser.Scene{constructor(key,img,next){super(key);this.img=img;this.next=next}preload(){this.load.image(this.img,'assets/'+this.img+'.jpg')}create(){this.add.image(960,540,this.img);if(Session.isHost)this.add.rectangle(1745,970,250,110,0xffffff,.001).setInteractive().on('pointerdown',()=>Net.scene(this.next))}};
window.MapScene=class extends Phaser.Scene{constructor(){super('Map')}preload(){this.load.image('map','assets/map.jpg')}create(){this.add.image(960,540,'map');if(Session.isHost)[[270,642,392,90,'Warehouse'],[1030,264,330,90,'Dock'],[1618,764,390,90,'Rooftops']].forEach(a=>this.add.rectangle(...a.slice(0,4),0xffffff,.001).setInteractive().on('pointerdown',()=>Net.scene(a[4])))}};
window.WarehouseScene=class extends MultiScene{constructor(){super('Warehouse')}preload(){this.load.image('wh','assets/warehouse.jpg')}create(){this.add.image(960,540,'wh');const p=[G.platform(this,960,1040,1920,70),G.platform(this,15,540,30,1080),G.platform(this,1905,540,30,1080),G.platform(this,670,340,1145,48),G.platform(this,286,575,370,32),G.platform(this,1628,433,355,38),G.platform(this,1630,714,372,38),G.platform(this,716,812,96,78),G.platform(this,812,812,96,78),G.platform(this,764,733,96,80),G.platform(this,1198,995,104,96),G.platform(this,1302,995,104,96),G.platform(this,1198,899,104,96),G.platform(this,1302,899,104,96),G.platform(this,1250,803,104,96)];this.setupPlayer({x:120,y:940},p);this.chest=this.makeChest(1027,280);this.top=G.zone(this,1027,288,130,95);this.physics.add.overlap(this.cat.root,this.top,()=>Net.chest());this.chestHandler=e=>{if(e.detail.dropped)this.dropChest()};window.addEventListener('cat-heist-chest',this.chestHandler);this.events.once('shutdown',()=>window.removeEventListener('cat-heist-chest',this.chestHandler));if(Net.room.world.chestDropped)this.dropChest(true);G.hud(this,'WAREHOUSE OF DISGUISES','Warehouse')}
makeChest(x,y){const c=this.add.container(x,y).setDepth(650),g=this.add.graphics();g.fillStyle(0x5b301b).fillRoundedRect(-48,-34,96,70,10);g.fillStyle(0x7d492a).fillRoundedRect(-48,-44,96,34,10);g.lineStyle(6,0xd39a3c).strokeRoundedRect(-48,-44,96,80,10);g.fillStyle(0xf6c453).fillRoundedRect(-12,-8,24,26,4);c.add(g);return c}
dropChest(immediate=false){if(this.dropped)return;this.dropped=true;if(this.top)this.top.destroy();const finish=()=>{this.floor=G.zone(this,1027,965,125,95);this.physics.add.overlap(this.cat.root,this.floor,async()=>{if(Session.local.hasCostume)return;await Net.objective('costume');this.chest.setVisible(false);G.achievement(this,'PUFFIN DISGUISE ACQUIRED')})};if(immediate){this.chest.y=970;finish()}else this.tweens.add({targets:this.chest,y:970,angle:300,duration:900,ease:'Bounce.Out',onComplete:finish})}
update(t){this.multiUpdate(t)}};
window.DockScene=class extends MultiScene{
  constructor(){super('Dock')}
  preload(){this.load.image('dock','assets/dock.jpg')}
  create(){
    this.add.image(960,540,'dock');
    const platforms=[G.platform(this,307,948,614,55),G.platform(this,275,535,462,50),G.platform(this,728,310,198,45),G.platform(this,650,370,48,160),G.platform(this,1082,448,252,50),G.platform(this,838,810,280,52),G.platform(this,975,730,52,220),G.platform(this,1325,780,340,55),G.platform(this,1172,925,90,310),G.platform(this,1452,925,90,310),G.platform(this,1585,300,500,55)];
    this.setupPlayer({x:125,y:835},platforms);
    this.fisherX=1710;this.fisherY=225;this.makeFisherman();
    this.basket=G.zone(this,1475,235,150,90);
    this.physics.add.overlap(this.cat.root,this.basket,async()=>{
      if(Session.local.hasFish||!Session.local.hasCostume)return;
      const response=await Net.objective('fish');
      if(response?.ok)G.achievement(this,'GEM FISH ACQUIRED');
    });
    G.hud(this,'THE DOCK','Dock');
    this.lastCatch=0;this.lastReaction='none';
  }
  makeFisherman(){
    const root=this.add.container(this.fisherX,this.fisherY).setDepth(640);
    const torso=this.add.graphics(),head=this.add.graphics(),leftLeg=this.add.graphics(),rightLeg=this.add.graphics(),rod=this.add.graphics();
    torso.fillStyle(0x314b60).fillRoundedRect(-36,-2,72,102,24);
    torso.fillStyle(0x765037).fillRoundedRect(-44,28,88,65,20);
    head.fillStyle(0xd5ad7b).fillCircle(0,-42,30);
    head.fillStyle(0x24394c).fillTriangle(-42,-60,42,-60,0,-98);
    leftLeg.lineStyle(15,0x28394a).lineBetween(-18,78,-24,148);leftLeg.fillStyle(0x151d24).fillEllipse(-24,153,30,14);
    rightLeg.lineStyle(15,0x28394a).lineBetween(18,78,24,148);rightLeg.fillStyle(0x151d24).fillEllipse(24,153,30,14);
    rod.lineStyle(12,0xd5ad7b).lineBetween(18,12,44,37);rod.lineStyle(7,0x302017).lineBetween(43,37,132,-55);
    root.add([leftLeg,rightLeg,torso,head,rod]);
    this.fisherRoot=root;this.fisherRod=rod;
    this.tweens.add({targets:leftLeg,angle:4,duration:1500,yoyo:true,repeat:-1,ease:'Sine.InOut'});
    this.tweens.add({targets:rightLeg,angle:-4,duration:1750,yoyo:true,repeat:-1,ease:'Sine.InOut'});
  }
  catchFish(){
    this.tweens.add({targets:this.fisherRod,angle:-22,duration:330,yoyo:true,hold:260,ease:'Sine.Out'});
    const fish=this.add.ellipse(1800,850,38,18,0x55e6ef).setDepth(650),motion={t:0};
    this.tweens.add({targets:motion,t:1,duration:1100,ease:'Sine.InOut',onUpdate:()=>{
      const q=motion.t;fish.x=1800+(1475-1800)*q;fish.y=850-560*Math.sin(Math.PI*q)+(245-850)*q;
    },onComplete:()=>fish.destroy()});
  }
  update(t){
    this.multiUpdate(t);
    if(t-this.lastCatch>5200){this.lastCatch=t;this.catchFish()}
    const distance=Phaser.Math.Distance.Between(this.cat.root.x,this.cat.root.y,this.fisherX,this.fisherY);
    const reaction=distance<420?'near':distance<720?'aware':'none';
    if(reaction!==this.lastReaction){this.lastReaction=reaction;
      if(reaction==='aware')G.say(this,1570,190,Session.local.hasCostume?'Oh, aren’t you a pretty little thing?':'...');
      if(reaction==='near')G.say(this,1570,190,Session.local.hasCostume?'Come closer, little Puffin.':'?!  Shoo! Away with you!');
    }
  }
};
window.RooftopsScene=class extends MultiScene{constructor(){super('Rooftops')}preload(){this.load.image('roof','assets/rooftops.jpg')}create(){this.add.image(960,540,'roof');const p=[G.platform(this,960,1000,1920,65),G.platform(this,245,535,295,520),G.platform(this,420,545,135,38),G.platform(this,900,540,250,525),G.platform(this,755,795,145,38),G.platform(this,1525,620,520,400),G.platform(this,1525,410,520,45)];this.setupPlayer({x:100,y:920},p);this.plate=G.zone(this,1475,365,100,45);this.physics.add.overlap(this.cat.root,this.plate,async()=>{if(!Session.local.hasFish)return;await Net.objective('deposit');G.achievement(this,'HEIST COMPLETE')});G.hud(this,'THE ROOFTOPS','Rooftops')}update(t){this.multiUpdate(t)}};
