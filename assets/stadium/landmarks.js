import * as THREE from '../tactics/js/vendor/three.module.min.js';

// Coordinates are in the source scan's local space, before recentering.
// The bases follow the visible infield; fine markings are teaching locations
// because the supplied scan has incomplete texture regions.
export const landmarks = [
  {id:'first',name:'一壘',position:[.019,.18,.056],offset:[90,42],purpose:'打者擊球後跑向的第一個壘包。',rule:'打者成為跑者後須依序觸及各壘。擊跑員跑過一壘後，若立即返回且未企圖進二壘，通常仍受安全上壘的保護。'},
  {id:'second',name:'二壘',position:[.175,.18,-.163],offset:[110,-12],purpose:'跑壘路線的第二個壘包，也是得點圈的位置。',rule:'跑者須按一壘、二壘、三壘、本壘的順序進壘；漏踩壘包，守方可依規則提出申訴。'},
  {id:'third',name:'三壘',position:[-.044,.18,-.319],offset:[-65,-65],purpose:'返回本壘得分前的最後一個壘包。',rule:'高飛球被接殺時，跑者須等野手首次碰觸球後才能離壘推進；提前離壘須先回觸原壘。'},
  {id:'mound',name:'投手丘',position:[-.025,.18,-.133],offset:[65,-65],purpose:'投手進行投球的位置；丘上設有投手板。',rule:'投手須依投手板與合法投球動作的規定投球。有跑者在壘時，違規動作可能被判投手犯規。'},
  {id:'home',name:'本壘板',position:[-.2,.18,-.1],offset:[-100,-25],purpose:'打擊與得分的基準位置，也是判定好球帶的參考。',rule:'跑者依序合法觸及一、二、三壘後返回觸及本壘，才可能得分；仍須符合第三出局等得分規則。'},
  {id:'left-box',name:'左打擊區',position:[-.204,.18,-.087],offset:[-80,70],purpose:'左打者的站位區；從捕手面向投手看，位於右手側。',rule:'打者準備擊球時，雙腳須位於打擊區內；打擊區的界線屬於區內。'},
  {id:'right-box',name:'右打擊區',position:[-.208,.18,-.111],offset:[-150,25],purpose:'右打者的站位區；從捕手面向投手看，位於左手側。',rule:'打者準備擊球時，雙腳須位於打擊區內；打擊區的界線屬於區內。'}
];

export function addLandmarks(model,camera,controls,canvas) {
  const layer=document.getElementById('landmarks'),svg=document.getElementById('leaders'),info=document.getElementById('info');
  const vector=new THREE.Vector3();let selected=null;
  const entries=landmarks.map(item=>{
    const anchor=new THREE.Object3D();anchor.position.fromArray(item.position);model.add(anchor);
    const label=document.createElement('button');label.className='landmark';label.textContent=item.name;label.setAttribute('aria-label',`查看${item.name}的用途與規則`);layer.append(label);
    const line=document.createElementNS('http://www.w3.org/2000/svg','line'),dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('r','4');svg.append(line,dot);
    const tab=document.createElement('button');tab.textContent=item.name;document.getElementById('locations').append(tab);
    const entry={item,anchor,label,line,dot,tab};
    label.onclick=()=>select(entry,false);tab.onclick=()=>select(entry,true);return entry;
  });
  function select(entry,focus) {
    selected=entry;info.hidden=false;
    document.getElementById('info-name').textContent=entry.item.name;
    document.getElementById('info-purpose').textContent=entry.item.purpose;
    document.getElementById('info-rule').textContent=entry.item.rule;
    for(const e of entries){e.label.setAttribute('aria-pressed',String(e===entry));e.tab.setAttribute('aria-pressed',String(e===entry));}
    if(focus){entry.anchor.getWorldPosition(vector);const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(.65);controls.target.copy(vector);camera.position.copy(vector).add(offset);controls.update();}
  }
  document.getElementById('info-close').onclick=()=>{info.hidden=true;selected=null;for(const e of entries){e.label.setAttribute('aria-pressed','false');e.tab.setAttribute('aria-pressed','false');}};
  document.getElementById('toggle-labels').onclick=event=>{const visible=layer.hidden;layer.hidden=!visible;svg.style.display=visible?'':'none';event.currentTarget.textContent=visible?'隱藏標記':'顯示標記';event.currentTarget.setAttribute('aria-pressed',String(visible));};
  return function update(){
    if(layer.hidden)return;
    const width=canvas.clientWidth,height=canvas.clientHeight,placed=[];
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    model.updateWorldMatrix(true,true);camera.updateMatrixWorld();
    for(const e of entries){
      e.anchor.getWorldPosition(vector);vector.project(camera);
      const visible=vector.z>-1&&vector.z<1&&Math.abs(vector.x)<1&&Math.abs(vector.y)<1;
      e.label.hidden=!visible;e.line.style.display=e.dot.style.display=visible?'':'none';if(!visible)continue;
      const x=(vector.x+1)*width/2,y=(1-vector.y)*height/2;
      let lx=THREE.MathUtils.clamp(x+e.item.offset[0],48,width-48),ly=THREE.MathUtils.clamp(y+e.item.offset[1],48,height-120);
      for(let attempt=0;attempt<18&&placed.some(p=>Math.abs(p.x-lx)<88&&Math.abs(p.y-ly)<35);attempt++)ly=THREE.MathUtils.clamp(ly+(ly<height/2?-36:36),48,height-100);
      placed.push({x:lx,y:ly});e.label.style.left=lx+'px';e.label.style.top=ly+'px';
      e.line.setAttribute('x1',x);e.line.setAttribute('y1',y);e.line.setAttribute('x2',lx);e.line.setAttribute('y2',ly);e.dot.setAttribute('cx',x);e.dot.setAttribute('cy',y);
    }
  };
}
