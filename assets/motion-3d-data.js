/* Monocular, model-estimated body-relative 3D data; never image-z fallback. */
const INDICES = Object.freeze({
  nose:0, lSho:11, rSho:12, lElb:13, rElb:14, lWri:15, rWri:16,
  lHip:23, rHip:24, lKnee:25, rKnee:26, lAnk:27, rAnk:28
});
const ANGLES = Object.freeze({
  leftElbow:['lSho','lElb','lWri'], rightElbow:['rSho','rElb','rWri'],
  leftKnee:['lHip','lKnee','lAnk'], rightKnee:['rHip','rKnee','rAnk']
});
const validThreshold = value => Number.isFinite(value) && value >= 0 && value <= 1;
function reliable(point, threshold){
  return !!point && [point.x,point.y,point.z,point.v].every(Number.isFinite) && point.v >= threshold && point.v <= 1;
}

/**
 * Keep the SDK's world coordinates (metres, model-estimated hip-centred origin).
 * Visibility is required; presence, when supplied, must also be finite and reliable.
 * Low-confidence joints are omitted so a renderer cannot silently draw them.
 */
export function readWorldPose(result, {threshold = .65} = {}){
  if (!validThreshold(threshold)) return null;
  if(result?.worldLandmarks?.length!==1)return null;
  const world = result.worldLandmarks[0];
  if (!Array.isArray(world) || world.length < 33) return null;
  const P = {};
  for (const [key,index] of Object.entries(INDICES)){
    const point = world[index];
    if (!point || ![point.x,point.y,point.z,point.visibility].every(Number.isFinite)) continue;
    if (point.visibility < 0 || point.visibility > 1) continue;
    if (point.presence !== undefined && (!Number.isFinite(point.presence) || point.presence < 0 || point.presence > 1)) continue;
    const v = Math.min(point.visibility, point.presence ?? point.visibility);
    if (v >= threshold) P[key] = {x:point.x,y:point.y,z:point.z,v};
  }
  return Object.keys(P).length ? {P,origin:'hip-centre',estimated:true} : null;
}

/** Interior angle at b, measured from two 3D segments in the same coordinate frame. */
export function jointAngle3D(P, a, b, c, {threshold = .65} = {}){
  if (!validThreshold(threshold) || !P) return null;
  const A=P[a], B=P[b], C=P[c];
  if (![A,B,C].every(point => reliable(point,threshold))) return null;
  const u=[A.x-B.x,A.y-B.y,A.z-B.z], v=[C.x-B.x,C.y-B.y,C.z-B.z];
  const lengthU=Math.hypot(...u), lengthV=Math.hypot(...v);
  if (!Number.isFinite(lengthU) || !Number.isFinite(lengthV) || lengthU <= 1e-9 || lengthV <= 1e-9) return null;
  const dot=u.reduce((sum,value,i)=>sum+(value/lengthU)*(v[i]/lengthV),0);
  if (!Number.isFinite(dot)) return null;
  return Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
}

/** Elbow/knee flexion only: straight=0 degrees, right angle=90 degrees. */
export function metrics3D(pose){
  const P=pose?.P;
  return Object.fromEntries(Object.entries(ANGLES).map(([name,keys])=>{
    const inner=jointAngle3D(P,...keys);
    return [name,inner === null ? null : Math.max(0,Math.min(180,180-inner))];
  }));
}

function orderedFrames(frames){
  return Array.isArray(frames) ? frames.filter(frame=>frame && Number.isFinite(frame.t)).slice().sort((a,b)=>a.t-b.t) : [];
}
const validGap = maxGap => Number.isFinite(maxGap) && maxGap >= 0;

/** frames: [{t,world:readWorldPose(result)}]. Missing/occluded samples split lines. */
export function buildAngleSeries(frames, {key = 'leftElbow', maxGap = 1/24+.01} = {}){
  if (!Object.prototype.hasOwnProperty.call(ANGLES,key) || !validGap(maxGap)) return [];
  const lines=[]; let line=[];
  const finish=()=>{if(line.length)lines.push(line);line=[];};
  for(const frame of orderedFrames(frames)){
    const value=metrics3D(frame.world)[key];
    if (!Number.isFinite(value)){finish();continue;}
    const last=line[line.length-1];
    if(last && frame.t-last.t>maxGap+1e-9)finish();
    if(line.length && Math.abs(frame.t-line[line.length-1].t)<=1e-9)continue;
    line.push({t:frame.t,value});
  }
  finish();return lines;
}

/**
 * Model-estimated 3D path relative to the hips in EACH frame. Recentring explicitly
 * removes root translation. No ground displacement, ball speed, or bat speed is inferred.
 */
export function buildWorldTrail(frames, {joint = 'rWri', from = 0, to = Infinity, maxGap = 1/24+.01} = {}){
  if (!(joint === 'hipMid' || Object.prototype.hasOwnProperty.call(INDICES,joint)) || !validGap(maxGap)
    || !(Number.isFinite(from) || from === -Infinity) || !(Number.isFinite(to) || to === Infinity) || from>to) return [];
  const paths=[];let path=[];
  const finish=()=>{if(path.length)paths.push(path);path=[];};
  for(const frame of orderedFrames(frames)){
    if(frame.t<from || frame.t>to){finish();continue;}
    const P=frame.world?.P, left=P?.lHip, right=P?.rHip;
    if(!reliable(left,.65) || !reliable(right,.65)){finish();continue;}
    const origin={x:(left.x+right.x)/2,y:(left.y+right.y)/2,z:(left.z+right.z)/2};
    const point=joint === 'hipMid' ? {...origin,v:Math.min(left.v,right.v)} : P[joint];
    if(!reliable(point,.65)){finish();continue;}
    const x=point.x-origin.x,y=point.y-origin.y,z=point.z-origin.z;
    if(![x,y,z].every(Number.isFinite)){finish();continue;}
    const last=path[path.length-1];
    if(last && frame.t-last.t>maxGap+1e-9)finish();
    if(path.length && Math.abs(frame.t-path[path.length-1].t)<=1e-9)continue;
    path.push({x,y,z,t:frame.t,v:Math.min(point.v,left.v,right.v)});
  }
  finish();return paths;
}
