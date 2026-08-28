const path=require('path'),http=require('http'),crypto=require('crypto'),express=require('express');
const {Server}=require('socket.io');const app=express(),server=http.createServer(app),io=new Server(server),PORT=process.env.PORT||3000;
const COLORS=[0x8d64aa,0x1594fd,0xf35b05,0x5cb9bb,0xffd10a,0x162e76,0xff60ff,0xda0600,0x000000,0xffffff],rooms=new Map(),MAX=10;
app.use(express.static(path.join(__dirname,'public')));app.get('/health',(_,r)=>r.json({ok:true,version:'14.0',rooms:rooms.size}));app.get('*',(_,r)=>r.sendFile(path.join(__dirname,'public/index.html')));
const clean=(v,n)=>String(v||'').replace(/[<>]/g,'').trim().slice(0,n);function code(){for(let i=0;i<10000;i++){const c=String(crypto.randomInt(1000,10000));if(!rooms.has(c))return c}throw Error('No room codes')}
function snap(r){return{code:r.code,hostId:r.hostId,scene:r.scene,players:[...r.players.values()].map(({socketId,...p})=>p),world:r.world}}
function send(r){io.to(r.code).emit('room-state',snap(r))}
function get(socket){const r=rooms.get(socket.data.code);return r&&{r,p:r.players.get(socket.data.pid)}}
io.on('connection',socket=>{
 socket.on('create-room',({playerId,name},ack)=>{const c=code(),p={id:playerId,name:clean(name,18)||'Cat',color:null,x:960,y:120,facing:1,pose:'fall',hasCostume:false,hasFish:false,depositedFish:false,connected:true,socketId:socket.id};const r={code:c,hostId:playerId,scene:'CatChoose',players:new Map([[playerId,p]]),world:{Warehouse:false,Dock:false,Rooftops:false,chestDropped:false}};rooms.set(c,r);socket.join(c);socket.data={code:c,pid:playerId};ack({ok:true,room:snap(r)})});
 socket.on('join-room',({code:c,playerId,name},ack)=>{const r=rooms.get(clean(c,4));if(!r)return ack({ok:false,message:'Room not found.'});if(r.players.size>=MAX&&!r.players.has(playerId))return ack({ok:false,message:'Room is full.'});let p=r.players.get(playerId);if(!p){p={id:playerId,name:clean(name,18)||'Cat',color:null,x:960,y:120,facing:1,pose:'fall',hasCostume:false,hasFish:false,depositedFish:false,connected:true,socketId:socket.id};r.players.set(playerId,p)}else Object.assign(p,{connected:true,socketId:socket.id,name:clean(name,18)||p.name});socket.join(r.code);socket.data={code:r.code,pid:playerId};send(r);ack({ok:true,room:snap(r)})});
 socket.on('choose-color',({color},ack)=>{const q=get(socket);if(!q)return ack({ok:false});if(!COLORS.includes(color)||[...q.r.players.values()].some(p=>p.id!==q.p.id&&p.color===color))return ack({ok:false,message:'Colour already taken.'});q.p.color=color;send(q.r);ack({ok:true})});
socket.on('set-scene',({scene},ack=()=>{})=>{
  const q=get(socket);
  if(!q||q.r.hostId!==q.p.id)return ack({ok:false,message:'Host only.'});
  q.r.scene=scene;
  for(const p of q.r.players.values()){p.x=960;p.y=120;p.pose='fall';p.seq=0}
  io.to(q.r.code).emit('scene-change',{scene});
  send(q.r);
  ack({ok:true});
});
socket.on('player-state',data=>{
  const q=get(socket);if(!q)return;
  q.p.seq=(q.p.seq||0)+1;
  q.p.x=Number.isFinite(data.x)?data.x:q.p.x;
  q.p.y=Number.isFinite(data.y)?data.y:q.p.y;
  q.p.vx=Number.isFinite(data.vx)?data.vx:0;
  q.p.vy=Number.isFinite(data.vy)?data.vy:0;
  q.p.facing=data.facing===-1?-1:1;
  q.p.pose=['idle','run','leap'].includes(data.pose)?data.pose:'idle';
  socket.to(q.r.code).emit('player-state',{id:q.p.id,seq:q.p.seq,serverTime:Date.now(),x:q.p.x,y:q.p.y,vx:q.p.vx,vy:q.p.vy,facing:q.p.facing,pose:q.p.pose});
});
socket.on('drop-chest',(_,ack=()=>{})=>{
  const q=get(socket);if(!q)return ack({ok:false});
  if(!q.r.world.chestDropped){
    q.r.world.chestDropped=true;
    io.to(q.r.code).emit('chest-state',{dropped:true});
    send(q.r);
  }
  ack({ok:true});
});

 socket.on('objective',({type},ack=()=>{})=>{const q=get(socket);if(!q)return ack({ok:false});if(type==='costume'){q.p.hasCostume=true;if([...q.r.players.values()].every(p=>p.hasCostume))q.r.world.Warehouse=true}if(type==='fish'){q.p.hasFish=true;if([...q.r.players.values()].every(p=>p.hasFish))q.r.world.Dock=true}if(type==='deposit'){q.p.hasFish=false;q.p.depositedFish=true;if([...q.r.players.values()].every(p=>p.depositedFish)){q.r.world.Rooftops=true;q.r.scene='Outro1';io.to(q.r.code).emit('scene-change',{scene:'Outro1'})}}send(q.r);ack({ok:true})});
socket.on(
    'skip-objective',
    ({level},ack=()=>{})=>{

        const q=get(socket);

        if(!q){
            return ack({
                ok:false,
                message:'Room unavailable.'
            });
        }

        if(q.r.hostId!==q.p.id){
            return ack({
                ok:false,
                message:'Host only.'
            });
        }

        for(const p of q.r.players.values()){

            if(level==='Warehouse'){
                p.hasCostume=true;
            }

            if(level==='Dock'){
                p.hasCostume=true;
                p.hasFish=true;
            }

            if(level==='Rooftops'){
                p.hasFish=false;
                p.depositedFish=true;
            }
        }

        q.r.world[level]=true;

        if(level==='Rooftops'){
            q.r.scene='Outro1';

            io.to(q.r.code).emit(
                'scene-change',
                {scene:'Outro1'}
            );
        }

        send(q.r);

        ack({ok:true});
    }
);
 socket.on('disconnect',()=>{const q=get(socket);if(!q)return;q.p.connected=false;if(q.r.hostId===q.p.id){const n=[...q.r.players.values()].find(p=>p.connected);if(n)q.r.hostId=n.id}send(q.r);setTimeout(()=>{if(![...q.r.players.values()].some(p=>p.connected))rooms.delete(q.r.code)},300000)})
});server.listen(PORT,()=>console.log('The Purrfect Heist v14 on '+PORT));
