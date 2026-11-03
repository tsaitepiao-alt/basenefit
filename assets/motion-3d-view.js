// Perspective rendering of actual model-estimated XYZ points. No 2D-to-depth fallback.
const KEYS={nose:'頭部（鼻尖）',lSho:'左肩',rSho:'右肩',lElb:'左肘',rElb:'右肘',lWri:'左腕',rWri:'右腕',lHip:'左髖',rHip:'右髖',lKnee:'左膝',rKnee:'右膝',lAnk:'左踝',rAnk:'右踝'};
const SEGMENTS=[['lSho','rSho'],['lSho','lElb'],['lElb','lWri'],['rSho','rElb'],['rElb','rWri'],['lSho','lHip'],['rSho','rHip'],['lHip','rHip'],['lHip','lKnee'],['lKnee','lAnk'],['rHip','rKnee'],['rKnee','rAnk']];
const DEFAULT={yaw:.55,pitch:.16,distance:2.8};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const valid=p=>!!p&&[p.x,p.y,p.z,p.v].every(Number.isFinite)&&p.v>=.65&&p.v<=1;
function cameraValues(input={}){
  return {yaw:Number.isFinite(input.yaw)?input.yaw:DEFAULT.yaw,pitch:clamp(Number.isFinite(input.pitch)?input.pitch:DEFAULT.pitch,-1.45,1.45),distance:clamp(Number.isFinite(input.distance)?input.distance:DEFAULT.distance,1.5,6)};
}
export function projectWorldPoint(point,camera={},viewport={width:720,height:560}){
  if(!point||![point.x,point.y,point.z,viewport.width,viewport.height].every(Number.isFinite)||viewport.width<=0||viewport.height<=0)return null;
  const c=cameraValues(camera),x=point.x,y=-point.y,z=-point.z;
  const cx=x*Math.cos(c.yaw)-z*Math.sin(c.yaw),cz=x*Math.sin(c.yaw)+z*Math.cos(c.yaw);
  const cy=y*Math.cos(c.pitch)-cz*Math.sin(c.pitch),depth=c.distance-(y*Math.sin(c.pitch)+cz*Math.cos(c.pitch));
  if(!Number.isFinite(depth)||depth<=.05)return null;
  const focal=viewport.height*1.18;
  const result={x:viewport.width/2+cx*focal/depth,y:viewport.height*.49-cy*focal/depth,depth};
  return [result.x,result.y,result.depth].every(Number.isFinite)?result:null;
}
function prepared(pose){
  if(pose?.estimated!==true||pose?.origin!=='hip-centre'||!pose.P)return null;
  const P=Object.fromEntries(Object.entries(pose.P).filter(([key,p])=>Object.hasOwn(KEYS,key)&&valid(p)));
  if(Object.keys(P).length<3)return null;
  let origin={x:0,y:0,z:0},scale=1;
  if(P.lHip&&P.rHip)origin={x:(P.lHip.x+P.rHip.x)/2,y:(P.lHip.y+P.rHip.y)/2,z:(P.lHip.z+P.rHip.z)/2};
  if(P.lHip&&P.rHip&&P.lSho&&P.rSho){
    const torso=Math.hypot((P.lSho.x+P.rSho.x)/2-origin.x,(P.lSho.y+P.rSho.y)/2-origin.y,(P.lSho.z+P.rSho.z)/2-origin.z);
    if(!Number.isFinite(torso)||torso<1e-5)return null;scale=clamp(.4/torso,.2,8);
  }
  return {P:Object.fromEntries(Object.entries(P).map(([key,p])=>[key,{...p,x:(p.x-origin.x)*scale,y:(p.y-origin.y)*scale,z:(p.z-origin.z)*scale}])),scale,hasBasis:['lHip','rHip','lSho','rSho'].every(key=>P[key])};
}
function trailSegments(input){
  if(!Array.isArray(input))return [];
  const paths=Array.isArray(input[0])?input:[input],out=[];
  for(const path of paths){let part=[];const finish=()=>{if(part.length)out.push(part);part=[];};
    for(const p of path){if(!valid(p)||p.gap||p.break){finish();continue;}const previous=part[part.length-1];if(previous&&Number.isFinite(p.t)&&Number.isFinite(previous.t)&&(p.t<=previous.t||p.t-previous.t>1/24+.01))finish();part.push(p);}finish();
  }return out;
}
export function createMotion3DView(canvas,{onCameraChange}={}){
  if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('A 3D view canvas is required');
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable');
  let camera={...DEFAULT},content={pose:null,reference:null,trail:[],referenceTrail:[],label:'3D 骨架｜影像估測'},drag=null,destroyed=false;
  canvas.width=720;canvas.height=560;
  if(canvas.style){canvas.style.width='100%';canvas.style.height='auto';canvas.style.touchAction='none';}
  const viewport=()=>({width:canvas.width,height:canvas.height});
  const project=p=>projectWorldPoint(p,camera,viewport());
  function drawTrail(paths,scale,color){
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.globalAlpha=.8;
    for(const path of trailSegments(paths)){let drawing=false;ctx.beginPath();for(const p of path){const q=project({x:p.x*scale,y:p.y*scale,z:p.z*scale});if(!q){drawing=false;continue;}if(drawing)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);drawing=true;}ctx.stroke();}
    ctx.restore();
  }
  function drawPose(body,color,labels=true){
    if(!body)return 0;const projected=Object.fromEntries(Object.entries(body.P).map(([key,p])=>[key,project(p)]).filter(([,p])=>p));
    const edges=SEGMENTS.filter(([a,b])=>projected[a]&&projected[b]).map(([a,b])=>({a:projected[a],b:projected[b],depth:(projected[a].depth+projected[b].depth)/2})).sort((a,b)=>b.depth-a.depth);
    ctx.strokeStyle=color;ctx.lineWidth=5;ctx.lineCap='round';
    for(const e of edges){ctx.beginPath();ctx.moveTo(e.a.x,e.a.y);ctx.lineTo(e.b.x,e.b.y);ctx.stroke();}
    const joints=Object.entries(projected).sort((a,b)=>b[1].depth-a[1].depth);
    for(const [key,p]of joints){ctx.fillStyle=color;ctx.strokeStyle='#07110c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,clamp(18/p.depth,4,8),0,Math.PI*2);ctx.fill();ctx.stroke();
      if(labels&&['nose','lElb','rElb','lKnee','rKnee','lWri','rWri'].includes(key)&&p.x>=0&&p.x<=canvas.width&&p.y>40&&p.y<canvas.height-85){
        ctx.font='24px system-ui,"PingFang TC",sans-serif';const text=KEYS[key],width=ctx.measureText(text).width+12,x=clamp(p.x+11,5,canvas.width-width-5),y=clamp(p.y-29,43,canvas.height-88);
        ctx.fillStyle='rgba(5,12,8,.9)';ctx.fillRect(x,y,width,31);ctx.fillStyle=color;ctx.fillText(text,x+6,y+24);
      }
    }return joints.length;
  }
  function axes(){
    const center=project({x:0,y:0,z:0});if(!center)return;const origin={x:65,y:canvas.height-68};
    for(const axis of [{p:{x:.22,y:0,z:0},color:'#ff9a71',name:'X 左右'},{p:{x:0,y:-.22,z:0},color:'#a3ed82',name:'Y 上下'},{p:{x:0,y:0,z:-.22},color:'#a6b8ff',name:'Z 前後'}]){
      const q=project(axis.p);if(!q)continue;const dx=q.x-center.x,dy=q.y-center.y;ctx.strokeStyle=axis.color;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(origin.x+dx,origin.y+dy);ctx.stroke();ctx.fillStyle=axis.color;ctx.font='12px system-ui';ctx.fillText(axis.name,origin.x+dx+4,origin.y+dy);
    }
  }
  function render(){
    if(destroyed)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#0b130e';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.textAlign='left';ctx.font='600 21px system-ui,"PingFang TC",sans-serif';ctx.fillStyle='#e2efda';ctx.fillText(String(content.label||'3D 骨架｜影像估測').slice(0,40),20,31);
    const body=prepared(content.pose),candidate=prepared(content.reference),reference=body?.hasBasis&&candidate?.hasBasis?candidate:null;
    if(!body){ctx.fillStyle='#c6d4c4';ctx.font='21px system-ui,"PingFang TC",sans-serif';ctx.fillText('這格 3D 資料不足，不補造深度。',100,canvas.height/2);return;}
    ctx.save();ctx.beginPath();ctx.rect(0,42,canvas.width,canvas.height-117);ctx.clip();
    if(reference)drawTrail(content.referenceTrail,reference.scale,'#ffb45c');drawTrail(content.trail,body.scale,'#5bd8ff');
    ctx.font='18px system-ui,"PingFang TC",sans-serif';drawPose(reference,'#ffb45c',false);drawPose(body,'#5bd8ff',true);ctx.restore();axes();
    ctx.fillStyle='#9fb29e';ctx.font='15px system-ui,"PingFang TC",sans-serif';ctx.fillText('拖曳旋轉 · 以髖部為原點 · 等比顯示，非球場距離',180,canvas.height-28);
  }
  const notify=()=>{if(typeof onCameraChange==='function')onCameraChange({...camera});};
  function setCamera(value){
    if(typeof value==='string')camera=value==='front'?{yaw:0,pitch:0,distance:2.8}:value==='side'?{yaw:Math.PI/2,pitch:.12,distance:2.8}:value==='top'?{yaw:0,pitch:1.4,distance:2.8}:{...DEFAULT};
    else if(value&&typeof value==='object'){const next={...camera,...value};if(Number.isFinite(value.zoomFactor)&&value.zoomFactor>0)next.distance=camera.distance*value.zoomFactor;camera=cameraValues(next);}
    render();notify();
  }
  const down=e=>{if(destroyed)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};try{canvas.setPointerCapture?.(e.pointerId);}catch(err){}};
  const move=e=>{if(!drag||e.pointerId!==drag.id)return;camera=cameraValues({...camera,yaw:camera.yaw+(e.clientX-drag.x)*.009,pitch:camera.pitch+(e.clientY-drag.y)*.009});drag.x=e.clientX;drag.y=e.clientY;render();notify();};
  const up=e=>{if(drag&&e.pointerId===drag.id){drag=null;try{canvas.releasePointerCapture?.(e.pointerId);}catch(err){}}};
  const wheel=e=>{e.preventDefault?.();setCamera({zoomFactor:e.deltaY>0?1.1:.9});};
  const handlers=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel]];
  for(const [event,fn]of handlers)canvas.addEventListener?.(event,fn,event==='wheel'?{passive:false}:undefined);
  render();
  return {setPose(pose,{reference=null,trail=[],referenceTrail=[],label='3D 骨架｜影像估測'}={}){content={pose,reference,trail,referenceTrail,label};render();},setCamera,
    resize(){render();},reset(){drag=null;camera={...DEFAULT};content={pose:null,reference:null,trail:[],referenceTrail:[],label:'3D 骨架｜影像估測'};render();},
    getCamera(){return {...camera};},destroy(){destroyed=true;drag=null;for(const [event,fn]of handlers)canvas.removeEventListener?.(event,fn);content={};}};
}
