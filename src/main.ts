import * as THREE from "three";
import "./style.css";

type Mission = { id:number; title:string; objective:string };
type Trophy = { id:string; name:string; desc:string };
type Ending = "DESTINY"|"ASCENSION"|"LIBERATION";

const MISSIONS:Mission[]=[
 {id:1,title:"DESPERTAR",objective:"Restore power to the station."},
 {id:2,title:"LOS QUE QUEDARON",objective:"Reach the habitation sector and recover the survivor log."},
 {id:3,title:"ECHO",objective:"Enter the research laboratory and recover the ECHO data core."},
 {id:4,title:"MIRA",objective:"Find the source of the impossible transmission."},
 {id:5,title:"PROTOCOLO ZERO",objective:"Overload the ECHO core before the station collapses."},
 {id:6,title:"¿QUIÉN SOY?",objective:"Confront the copy that knows your name."}
];

const TROPHIES:Trophy[]=[
 {id:"first",name:"Primer contacto",desc:"Complete the first mission."},
 {id:"survivor",name:"Superviviente",desc:"Finish a run."},
 {id:"hunter",name:"Cazador",desc:"Eliminate 100 enemies."},
 {id:"archivist",name:"Archivista",desc:"Find all 6 hidden memory logs."},
 {id:"brother",name:"Hermano",desc:"Recover all memories of Mira."},
 {id:"ghost",name:"Fantasma",desc:"Complete a mission without taking damage."},
 {id:"awakening",name:"Despertar",desc:"Discover the truth about Kael."},
 {id:"echo",name:"ECHO",desc:"Defeat the final boss."},
 {id:"liberation",name:"Liberación",desc:"Unlock the true ending."},
 {id:"erebus",name:"EREBUS",desc:"Unlock every trophy."}
];

const SAVE_KEY="void-runner-save-v1";
type Save={trophies:string[];kills:number;logs:number;best:number};
let save:Save=loadSave();

function loadSave():Save{
 try{return JSON.parse(localStorage.getItem(SAVE_KEY)||"")}catch{}
 return {trophies:[],kills:0,logs:0,best:0};
}
function persist(){localStorage.setItem(SAVE_KEY,JSON.stringify(save))}
function unlock(id:string){
 if(!save.trophies.includes(id)){save.trophies.push(id);persist();showToast("TROPHY UNLOCKED // "+(TROPHIES.find(t=>t.id===id)?.name||id))}
 if(TROPHIES.every(t=>save.trophies.includes(t.id))&&!save.trophies.includes("erebus")){save.trophies.push("erebus");persist()}
}

class AudioSystem{
 ctx?:AudioContext; master=0.045;
 init(){if(!this.ctx)this.ctx=new AudioContext(); if(this.ctx.state==="suspended")this.ctx.resume()}
 tone(freq:number,dur=.08,type:OscillatorType="sine",gain=.05){
  if(!this.ctx)return; const o=this.ctx.createOscillator(),g=this.ctx.createGain();
  o.type=type;o.frequency.value=freq;g.gain.value=gain*this.master;o.connect(g).connect(this.ctx.destination);
  g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+dur);o.start();o.stop(this.ctx.currentTime+dur);
 }
 shoot(){this.tone(85,.07,"sawtooth",.18);this.tone(240,.035,"square",.08)}
 hit(){this.tone(110,.06,"square",.1)}
 pickup(){this.tone(520,.1,"sine",.08);setTimeout(()=>this.tone(780,.13,"sine",.06),65)}
 hurt(){this.tone(55,.15,"sawtooth",.12)}
}
const audio=new AudioSystem();

class Input{
 keys=new Set<string>(); mouseDown=false; dx=0;dy=0; locked=false;
 touchX=0;touchY=0;fire=false;sprint=false;
 constructor(){
  addEventListener("keydown",e=>{this.keys.add(e.code); if(e.code==="Escape")game.togglePause()});
  addEventListener("keyup",e=>this.keys.delete(e.code));
  addEventListener("mousedown",e=>{if(e.button===0){this.mouseDown=true;audio.init();game.tryPointerLock()}});
  addEventListener("mouseup",e=>{if(e.button===0)this.mouseDown=false});
  addEventListener("mousemove",e=>{if(this.locked){this.dx+=e.movementX;this.dy+=e.movementY}});
  document.addEventListener("pointerlockchange",()=>this.locked=document.pointerLockElement===canvas);
  setupTouch();
 }
 down(code:string){return this.keys.has(code)}
 consumeLook(){const x=this.dx,y=this.dy;this.dx=this.dy=0;return{x,y}}
}
const input=new Input();
const canvas=document.querySelector<HTMLCanvasElement>("#gameCanvas")!;

function setupTouch(){
 const zone=document.querySelector("#stickZone")!,stick=document.querySelector("#stick")!;
 let active=false,id=-1;
 const move=(x:number,y:number)=>{
  const r=zone.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  let dx=x-cx,dy=y-cy;const len=Math.hypot(dx,dy),max=48;
  if(len>max){dx=dx/len*max;dy=dy/len*max}
  stick.setAttribute("style",`transform:translate(${dx}px,${dy}px)`);
  input.touchX=dx/max;input.touchY=dy/max;
 };
 zone.addEventListener("pointerdown",(e:any)=>{active=true;id=e.pointerId;zone.setPointerCapture(id);move(e.clientX,e.clientY)});
 zone.addEventListener("pointermove",(e:any)=>{if(active)move(e.clientX,e.clientY)});
 zone.addEventListener("pointerup",()=>{active=false;input.touchX=input.touchY=0;stick.setAttribute("style","")});
 const fire=document.querySelector("#touchFire")!,inter=document.querySelector("#touchInteract")!,run=document.querySelector("#touchSprint")!;
 fire.addEventListener("pointerdown",()=>input.fire=true);fire.addEventListener("pointerup",()=>input.fire=false);
 inter.addEventListener("pointerdown",()=>game.interact());
 run.addEventListener("pointerdown",()=>input.sprint=true);run.addEventListener("pointerup",()=>input.sprint=false);
 document.querySelector("#touchControls")!.classList.remove("hidden");
}

class World{
 scene=new THREE.Scene(); camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.05,500);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
 clock=new THREE.Clock(); lights:THREE.PointLight[]=[];
 constructor(){
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.setSize(innerWidth,innerHeight);
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  this.scene.background=new THREE.Color(0x03060a);
  this.camera.position.set(0,1.65,4);
  addEventListener("resize",()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight)});
 }
 addRoom(x:number,z:number,w:number,d:number,kind=0){
  const g=new THREE.Group();g.position.set(x,0,z);this.scene.add(g);
  const floorMat=new THREE.MeshStandardMaterial({color:kind?0x111923:0x0d151c,roughness:.88,metalness:.25});
  const wallMat=new THREE.MeshStandardMaterial({color:kind?0x17212a:0x101820,roughness:.75,metalness:.4});
  const floor=new THREE.Mesh(new THREE.BoxGeometry(w,.15,d),floorMat);floor.position.y=-.08;floor.receiveShadow=true;g.add(floor);
  for(const [px,pz,ww,dd] of [[0,-d/2,w,.2],[0,d/2,w,.2],[-w/2,0,.2,d],[w/2,0,.2,d]] as [number,number,number,number][]){
   const wall=new THREE.Mesh(new THREE.BoxGeometry(ww,3.6,dd),wallMat);wall.position.set(px,1.8,pz);wall.castShadow=true;wall.receiveShadow=true;g.add(wall);
  }
  const stripMat=new THREE.MeshBasicMaterial({color:kind?0xff4759:0x3ddbe8});
  for(let sx=-w/2+1;sx<w/2;sx+=3){
   const s=new THREE.Mesh(new THREE.BoxGeometry(1.5,.025,.04),stripMat);s.position.set(sx,3.35,0);g.add(s);
  }
  const lamp=new THREE.PointLight(kind?0xff4054:0x55dff0,kind?3.2:2.1,12);lamp.position.set(0,3,0);lamp.castShadow=true;g.add(lamp);this.lights.push(lamp);
  return g;
 }
 build(){
  this.scene.clear();this.lights=[];
  const positions=[[-13,-10,10,8,0],[0,-10,12,8,0],[14,-10,9,8,1],[-13,1,10,8,0],[0,1,12,8,1],[14,1,9,8,0],[-13,12,10,8,1],[0,12,12,8,0],[14,12,9,8,1]];
  positions.forEach(p=>this.addRoom(...p as [number,number,number,number,number]));
  // corridors
  const mat=new THREE.MeshStandardMaterial({color:0x0b1117,metalness:.5,roughness:.8});
  for(let z of [-6,5,16]){let m=new THREE.Mesh(new THREE.BoxGeometry(36,.12,2.5),mat);m.position.set(0,.0,z);m.receiveShadow=true;this.scene.add(m)}
  for(let x of [-8.5,7]){let m=new THREE.Mesh(new THREE.BoxGeometry(2.5,.12,22),mat);m.position.set(x,.0,5);m.receiveShadow=true;this.scene.add(m)}
  // central core chamber
  const core=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.2,5,24),new THREE.MeshStandardMaterial({color:0x0b1820,metalness:.75,roughness:.35,emissive:0x06131a}));
  core.position.set(0,2.5,24);core.castShadow=true;this.scene.add(core);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(3.4,.12,10,64),new THREE.MeshBasicMaterial({color:0xff3d55}));
  ring.rotation.x=Math.PI/2;ring.position.set(0,3,24);this.scene.add(ring);
  // stars / dust
  const geo=new THREE.BufferGeometry(),arr=new Float32Array(900);
  for(let i=0;i<arr.length;i+=3){arr[i]=(Math.random()-.5)*150;arr[i+1]=Math.random()*45;arr[i+2]=(Math.random()-.5)*150}
  geo.setAttribute("position",new THREE.BufferAttribute(arr,3));
  this.scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0x7fa8b3,size:.035})));
  const hemi=new THREE.HemisphereLight(0x5d8290,0x030507,.35);this.scene.add(hemi);
 }
}

class Enemy{
 mesh:THREE.Group; hp:number;speed:number;attack:number=0;dead=false;type:string;target:Player;
 constructor(target:Player,type="Husk",pos=new THREE.Vector3()){
  this.target=target;this.type=type;this.hp=type==="Ravager"?80:type==="Sentinel"?110:35;this.speed=type==="Ravager"?1.05:type==="Stalker"?1.8:1.35;
  this.mesh=new THREE.Group();this.mesh.position.copy(pos);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(type==="Ravager"?0.72:.45,type==="Ravager"?1.15:.7,6,10),new THREE.MeshStandardMaterial({color:type==="Sentinel"?0x526d7a:type==="Ravager"?0x541f2c:0x26363c,roughness:.55,metalness:type==="Sentinel"?.8:.2}));
  body.position.y=1.1;body.castShadow=true;this.mesh.add(body);
  const eye=new THREE.Mesh(new THREE.SphereGeometry(.1,8,8),new THREE.MeshBasicMaterial({color:0xff4058}));eye.position.set(0,1.55,.4);this.mesh.add(eye);
  if(type==="Sentinel"){const ring=new THREE.Mesh(new THREE.TorusGeometry(.6,.08,8,20),new THREE.MeshBasicMaterial({color:0xff4058}));ring.rotation.x=Math.PI/2;ring.position.y=1.1;this.mesh.add(ring)}
 }
 update(dt:number){
  if(this.dead)return;
  const p=this.target.mesh.position,d=this.mesh.position.distanceTo(p);
  if(d<18){this.mesh.lookAt(p.x,1.1,p.z); if(d>1.8){const v=p.clone().sub(this.mesh.position);v.y=0;v.normalize();this.mesh.position.addScaledVector(v,this.speed*dt)}else{this.attack-=dt;if(this.attack<=0){this.attack=1.1;this.target.damage(this.type==="Ravager"?18:8)}}}
 }
 damage(n:number){
  this.hp-=n;audio.hit();this.mesh.scale.setScalar(1.12);setTimeout(()=>this.mesh.scale.setScalar(1),60);
  if(this.hp<=0){this.dead=true;this.mesh.visible=false;save.kills++;persist();if(save.kills>=100)unlock("hunter")}
 }
}

class Pickup{
 mesh:THREE.Group;kind:string;used=false;
 constructor(kind:string,pos:THREE.Vector3){
  this.kind=kind;this.mesh=new THREE.Group();this.mesh.position.copy(pos);
  const color=kind==="cell"?0x68f3ff:kind==="ammo"?0xffcf62:0xa87bff;
  const orb=new THREE.Mesh(new THREE.OctahedronGeometry(.28),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2,metalness:.3,roughness:.2}));
  orb.position.y=.55;this.mesh.add(orb);
  const light=new THREE.PointLight(color,2,4);light.position.y=.55;this.mesh.add(light);
 }
 update(dt:number){this.mesh.rotation.y+=dt*1.8;this.mesh.position.y+=Math.sin(performance.now()/300)*dt*.15}
}

class Player{
 mesh=new THREE.Object3D(); pos=new THREE.Vector3(0,1.65,4); yaw=0;pitch=0;hp=100;energy=100;ammo=12;weapon=0;shotCd=0;damageTakenThisMission=false;
 constructor(){this.mesh.position.copy(this.pos)}
 update(dt:number){
  const look=input.consumeLook();this.yaw-=look.x*.0023;this.pitch-=look.y*.0023;this.pitch=Math.max(-1.45,Math.min(1.45,this.pitch));
  const forward=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw)),right=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));
  const mx=input.touchX+(input.down("KeyD")?1:0)-(input.down("KeyA")?1:0),mz=input.touchY+(input.down("KeyS")?1:0)-(input.down("KeyW")?1:0);
  const len=Math.hypot(mx,mz)||1,speed=(input.down("ShiftLeft")||input.sprint)?5.4:3.3;
  this.mesh.position.addScaledVector(right,mx/len*speed*dt);this.mesh.position.addScaledVector(forward,mz/len*speed*dt);
  this.mesh.position.x=THREE.MathUtils.clamp(this.mesh.position.x,-16.5,16.5);this.mesh.position.z=THREE.MathUtils.clamp(this.mesh.position.z,-1,29);
  if(this.mesh.position.y!==1.65)this.mesh.position.y=1.65;
  world.camera.position.copy(this.mesh.position);world.camera.rotation.order="YXZ";world.camera.rotation.y=this.yaw;world.camera.rotation.x=this.pitch;
  this.shotCd-=dt;
  if((input.mouseDown||input.fire)&&this.shotCd<=0&&!game.dialogueOpen){this.shoot()}
 }
 shoot(){
  this.shotCd=.18;this.ammo--;audio.shoot();game.muzzle();
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),world.camera);
  let best:Enemy|undefined,dist=35;
  for(const e of game.enemies){if(e.dead)continue;const d=world.camera.position.distanceTo(e.mesh.position);if(d<dist){const to=e.mesh.position.clone().sub(world.camera.position).normalize();const angle=to.angleTo(ray.ray.direction);if(angle<.16){best=e;dist=d}}}
  if(best){best.damage(this.weapon===1?22:18)}
  if(this.ammo<=0)this.ammo=12;
 }
 damage(n:number){this.hp-=n;this.damageTakenThisMission=true;audio.hurt();const f=document.querySelector("#damageFlash") as HTMLElement;f.style.opacity=".24";setTimeout(()=>f.style.opacity="0",90);if(this.hp<=0)game.gameOver()}
 heal(n:number){this.hp=Math.min(100,this.hp+n)}
}

class Game{
 player=new Player(); enemies:Enemy[]=[];pickups:Pickup[]=[];time=0;mission=1;cells=0;logs=new Set<number>();dialogueOpen=false;paused=false;running=false;boss?:Enemy;secretUsed=false;
 constructor(){world.scene.add(this.player.mesh)}
 start(){
  audio.init();this.running=true;this.paused=false;this.time=0;this.mission=1;this.cells=0;this.logs.clear();this.secretUsed=false;this.player.hp=100;this.player.energy=100;this.player.ammo=12;this.player.damageTakenThisMission=false;world.build();this.spawnMission();hide("menu");hide("endScreen");hide("trophyScreen");hide("pause");show("game");this.message("ECHO-7 // SIGNAL ACQUIRED",2200);requestAnimationFrame(()=>this.loop())}
 spawnMission(){
  this.enemies.forEach(e=>world.scene.remove(e.mesh));this.pickups.forEach(p=>world.scene.remove(p.mesh));this.enemies=[];this.pickups=[];this.boss=undefined;
  this.player.mesh.position.set(0,1.65,4);this.player.yaw=0;this.player.pitch=0;this.player.damageTakenThisMission=false;
  const enemyCount=Math.min(2+this.mission*2,13);
  for(let i=0;i<enemyCount;i++){const spots=[[-13,-10],[-1,-10],[14,-10],[-13,1],[0,1],[14,1],[-13,12],[1,12],[14,12]];const s=spots[(i+this.mission)%spots.length];const type=this.mission>=5&&i===0?"Ravager":this.mission>=3&&i%5===0?"Sentinel":i%4===0?"Stalker":"Husk";const e=new Enemy(this.player,type,new THREE.Vector3(s[0]+(Math.random()-.5)*4,0,s[1]+(Math.random()-.5)*4));world.scene.add(e.mesh);this.enemies.push(e)}
  for(let i=0;i<Math.min(3,this.mission);i++){const p=new Pickup("cell",new THREE.Vector3(-10+i*9,0,8+Math.random()*12));world.scene.add(p.mesh);this.pickups.push(p)}
  if(this.mission===2||this.mission===4){const p=new Pickup("log",new THREE.Vector3(14,0,13));world.scene.add(p.mesh);this.pickups.push(p)}
  updateObjective(MISSIONS[this.mission-1].objective);
 }
 loop=()=>{
  if(!this.running)return;const dt=Math.min(world.clock.getDelta(),.05);if(!this.paused&&!this.dialogueOpen){this.time+=dt;this.player.update(dt);this.enemies.forEach(e=>e.update(dt));this.pickups.forEach(p=>p.update(dt));this.checkPickups();this.checkMission();this.updateHUD();world.renderer.render(world.scene,world.camera)}else{world.renderer.render(world.scene,world.camera)}
  requestAnimationFrame(this.loop)
 }
   checkPickups(){
    for(const p of this.pickups){
      if(p.used) continue;

      if(p.mesh.position.distanceTo(this.player.mesh.position)<1.4){
        p.used=true;
        p.mesh.visible=false;
        audio.pickup();

        if(p.kind==="cell"){
          this.cells++;
          this.message(`ENERGY CELL RECOVERED // ${this.cells}`,1200);
        }

        if(p.kind==="log"){
          const n=this.mission===2?1:4;
          this.logs.add(n);
          save.logs=Math.max(save.logs,this.logs.size);
          persist();
          this.message("MEMORY LOG RECOVERED",1600);
        }

        if(p.kind==="ammo"){
          this.player.ammo=12;
        }
      }
    }
   }
  }}
 checkMission(){
  const alive=this.enemies.filter(e=>!e.dead).length;
  if(this.mission===1&&this.player.mesh.position.z<-0.5){this.advance()}
  else if(this.mission===2&&this.logs.size>=1&&this.player.mesh.position.x>10){this.advance()}
  else if(this.mission===3&&this.cells>=3){this.advance()}
  else if(this.mission===4&&this.logs.size>=1&&this.player.mesh.position.z>18){this.advance()}
  else if(this.mission===5&&this.cells>=3&&alive===0){this.advance()}
  else if(this.mission===6&&this.boss?.dead){this.finish("DESTINY")}
  if(this.mission===4&&!this.secretUsed&&this.player.mesh.position.distanceTo(new THREE.Vector3(14,1.65,13))<2){this.secretUsed=true;this.logs.add(6);save.logs=Math.max(save.logs,this.logs.size);persist();unlock("archivist");this.dialogue([["MIRA","Kael... if you can hear this, you are not the original."],["KAEL","Then what am I?"],["MIRA","You're the part of me that survived."]])}
 }
 advance(){
  if(this.player.damageTakenThisMission===false)unlock("ghost");
  if(this.mission===1)unlock("first");
  this.mission++;
  if(this.mission>6){this.finish("DESTINY");return}
  if(this.mission===4)unlock("brother");
  this.player.damageTakenThisMission=false;
  if(this.mission===6)this.spawnBoss();else this.spawnMission();
  const m=MISSIONS[this.mission-1];this.dialogue([["ECHO-7",missionLine(this.mission)],["KAEL",responseLine(this.mission)]]);
 }
 spawnBoss(){
  this.spawnMission();this.enemies.forEach(e=>e.dead=true);this.enemies.forEach(e=>e.mesh.visible=false);
  const b=new Enemy(this.player,"ECHO",new THREE.Vector3(0,0,24));b.hp=360;b.speed=2.2;
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.9,2),new THREE.MeshStandardMaterial({color:0x9d3bff,emissive:0x7b25d6,emissiveIntensity:3,metalness:.3,roughness:.2}));core.position.y=1.5;b.mesh.add(core);world.scene.add(b.mesh);this.enemies.push(b);this.boss=b;
  show("bossBarWrap");updateObjective("Defeat ECHO. It knows your name.");
 }
 finish(preferred:Ending){
  this.running=false;hide("game");show("endScreen");hide("bossBarWrap");
  let ending:Ending=preferred;
  if(this.mission>=6&&this.logs.size>=3&&this.cells>=3)ending="LIBERATION";
  if(ending==="LIBERATION"){unlock("liberation");unlock("awakening")}
  else if(ending==="DESTINY")unlock("echo");
  if(ending==="ASCENSION")unlock("awakening");
  unlock("survivor");
  const score=Math.max(0,Math.round(10000-this.time*12+save.kills*25+this.logs.size*500));if(!save.best||score>save.best){save.best=score;persist()}
  const titles:Record<Ending,[string,string]>={DESTINY:["TRANSMISSION COMPLETE","You destroyed the core. Erebus burns behind you. Somewhere in the last signal, Mira says your name."],ASCENSION:["ECHO ASCENDED","You accepted the copy. Erebus remains alive — and the copies are waking."],LIBERATION:["TRUE ENDING // LIBERATION","Every stored consciousness is released. Mira is gone, but her memory is finally free. As the station dies, one impossible backup comes online."]};
  (document.querySelector("#endTitle") as HTMLElement).textContent=titles[ending][0];
  (document.querySelector("#endText") as HTMLElement).textContent=titles[ending][1];
  (document.querySelector("#scoreBox") as HTMLElement).innerHTML=`TIME ${formatTime(this.time)}<br>KILLS ${save.kills}<br>MEMORIES ${this.logs.size}/6<br>SCORE ${score}<br>BEST ${save.best}`;
 }
 gameOver(){this.running=false;hide("game");show("endScreen");hide("bossBarWrap");(document.querySelector("#endTitle") as HTMLElement).textContent="SIGNAL LOST";(document.querySelector("#endText") as HTMLElement).textContent="Kael Vance — or what remains of him — has gone silent."; (document.querySelector("#scoreBox") as HTMLElement).innerHTML=`TIME ${formatTime(this.time)}<br>KILLS ${save.kills}<br>MEMORIES ${this.logs.size}/6`;}
 togglePause(){if(!this.running||this.dialogueOpen)return;this.paused=!this.paused;this.paused?show("pause"):hide("pause");if(this.paused&&input.locked)document.exitPointerLock()}
 tryPointerLock(){if(this.running&&!this.paused&&!this.dialogueOpen&&matchMedia("(hover:hover)").matches)canvas.requestPointerLock().catch(()=>{})}
 interact(){
  if(!this.running||this.dialogueOpen)return;
  if(this.mission===1&&this.player.mesh.position.z<2){this.advance();return}
  if(this.mission===4&&this.player.mesh.position.distanceTo(new THREE.Vector3(14,1.65,13))<2){this.logs.add(6);this.advance();return}
  this.message("NOTHING TO INTERACT WITH",700)
 }
 dialogue(lines:[string,string][],done=()=>{}){
  this.dialogueOpen=true;show("dialogue");let i=0;
  const render=()=>{(document.querySelector("#speaker") as HTMLElement).textContent=lines[i][0];(document.querySelector("#dialogueText") as HTMLElement).textContent=lines[i][1]};
  const next=()=>{i++;if(i>=lines.length){hide("dialogue");this.dialogueOpen=false;document.querySelector("#dialogueNext")!.removeEventListener("click",next);done()}else render()};
  document.querySelector("#dialogueNext")!.addEventListener("click",next);render();
 }
 muzzle(){this.message("●",100)}
 message(t:string,ms=1200){const el=document.querySelector("#message") as HTMLElement;el.textContent=t;el.style.opacity="1";setTimeout(()=>el.style.opacity="0",ms)}
 updateHUD(){
  (document.querySelector("#hpBar") as HTMLElement).style.width=this.player.hp+"%";(document.querySelector("#hpText") as HTMLElement).textContent=Math.ceil(this.player.hp).toString();
  (document.querySelector("#enBar") as HTMLElement).style.width=this.player.energy+"%";(document.querySelector("#enText") as HTMLElement).textContent=Math.ceil(this.player.energy).toString();
  (document.querySelector("#ammo") as HTMLElement).textContent=this.player.ammo.toString();
  const boss=this.boss;if(boss&&!boss.dead){(document.querySelector("#bossBar") as HTMLElement).style.width=Math.max(0,boss.hp/360*100)+"%"}else hide("bossBarWrap");
  const near=this.pickups.some(p=>!p.used&&p.mesh.position.distanceTo(this.player.mesh.position)<2);(document.querySelector("#interact") as HTMLElement).style.opacity=near?"1":"0";
 }
}

function missionLine(n:number){return ({
  2:"The habitation sector is full of voices. They are not on the radio.",
  3:"ECHO was never a backup system. It was a prison.",
  4:"There is a transmission coming from a room that does not exist on the map.",
  5:"The core has begun a purge. Ten minutes becomes an eternity when the station wants you dead.",
  6:"Kael... I remember you. That's the problem."
 } as Record<number,string>)[n]||"The station remembers."}
function responseLine(n:number){return ({
  2:"Then let's find whoever is still alive.",
  3:"Show me the truth.",
  4:"Mira...?",
  5:"I'm ending this.",
  6:"If you're me, prove it."
 } as Record<number,string>)[n]||"Keep moving."}

const world=new World();
const game=new Game();

function show(id:string){document.getElementById(id)?.classList.remove("hidden")}
function hide(id:string){document.getElementById(id)?.classList.add("hidden")}
function formatTime(t:number){const m=Math.floor(t/60).toString().padStart(2,"0"),s=Math.floor(t%60).toString().padStart(2,"0");return `${m}:${s}`}
function showToast(t:string){game.message(t,2400)}

function renderTrophies(){
 const list=document.querySelector("#trophyList")!;list.innerHTML="";
 for(const t of TROPHIES){const unlocked=save.trophies.includes(t.id);const d=document.createElement("div");d.className="trophy "+(unlocked?"unlocked":"");d.innerHTML=`<div class="icon">🏆</div><div><strong>${unlocked?t.name:"LOCKED"}</strong><small>${t.desc}</small></div>`;list.appendChild(d)}
}
function updateObjective(t:string){(document.querySelector("#objective") as HTMLElement).textContent=t}

document.querySelector("#startBtn")!.addEventListener("click",()=>game.start());
document.querySelector("#continueBtn")!.addEventListener("click",()=>game.start());
document.querySelector("#trophiesBtn")!.addEventListener("click",()=>{hide("menu");show("game");show("trophyScreen");renderTrophies()});
document.querySelector("#closeTrophies")!.addEventListener("click",()=>{hide("trophyScreen");hide("game");show("menu")});
document.querySelector("#resumeBtn")!.addEventListener("click",()=>game.togglePause());
document.querySelector("#restartBtn")!.addEventListener("click",()=>game.start());
document.querySelector("#quitBtn")!.addEventListener("click",()=>{game.running=false;hide("pause");hide("game");show("menu")});
document.querySelector("#againBtn")!.addEventListener("click",()=>game.start());
document.querySelector("#menuBtn")!.addEventListener("click",()=>{hide("endScreen");hide("game");show("menu")});
document.querySelector("#dialogueNext")!.addEventListener("pointerdown",()=>audio.init());

function registerPWA(){
 if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
registerPWA();
show("menu");
hide("touchControls");
function boot(){world.renderer.render(world.scene,world.camera)}
boot();

// Runtime compatibility: touch controls are enabled only on coarse pointers.
if (!matchMedia("(pointer:coarse)").matches) document.querySelector("#touchControls")?.classList.add("hidden");
