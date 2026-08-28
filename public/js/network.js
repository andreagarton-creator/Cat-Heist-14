window.Net={
  socket:io(),
  id:sessionStorage.getItem('catId')||crypto.randomUUID(),
  room:null,
  remote:new Map(),
  listeners:new Set(),
  init(){
    sessionStorage.setItem('catId',this.id);
    this.socket.on('room-state',room=>{this.room=room;for(const fn of [...this.listeners])fn(room)});
    this.socket.on('scene-change',({scene})=>{
      this.remote.clear();
      const game=window.game;
      if(game&&game.scene){
        try{game.scene.start(scene)}catch(error){console.error('Scene change failed:',scene,error)}
      }
    });
    this.socket.on('player-state',data=>{
      if(data.id===this.id)return;data.receivedAt=performance.now();
      let buffer=this.remote.get(data.id);
      if(!buffer){buffer=[];this.remote.set(data.id,buffer)}
      if(buffer.length&&data.seq<=buffer[buffer.length-1].seq)return;
      buffer.push(data);
      while(buffer.length>8)buffer.shift();
    });
    this.socket.on('chest-state',state=>window.dispatchEvent(new CustomEvent('cat-heist-chest',{detail:state})));
  },
  ack(event,data){
    return new Promise(resolve=>this.socket.timeout(5000).emit(event,data,(error,response)=>resolve(error?{ok:false,message:'Server did not respond.'}:response)));
  },
  onRoom(fn){this.listeners.add(fn);if(this.room)fn(this.room);return()=>this.listeners.delete(fn)},
  scene(scene){return this.ack('set-scene',{scene})},
  state(data){this.socket.emit('player-state',data)},
  objective(type){return this.ack('objective',{type})},
  chest(){return this.ack('drop-chest',{})},
  skip(level){return this.ack('skip-objective',{level})},
  msg(text){const e=document.getElementById('net-message');e.textContent=text;e.style.display='block';setTimeout(()=>e.style.display='none',2600)}
};Net.init();
