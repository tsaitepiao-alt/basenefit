/* Image-space body-joint trails. These are not ball or bat-head trajectories. */
export const TRAJECTORY_LABELS = Object.freeze({
  lWri:'左手腕', rWri:'右手腕', lHip:'左髖', rHip:'右髖',
  lAnk:'左腳踝', rAnk:'右腳踝', hipMid:'髖部中心'
});

function visible(point, threshold){
  return !!point && [point.x,point.y,point.v].every(Number.isFinite) && point.v >= threshold;
}
function inFrame(point, frame){
  return (!Number.isFinite(frame.W) || frame.W <= 0 || (point.x >= 0 && point.x <= frame.W))
    && (!Number.isFinite(frame.H) || frame.H <= 0 || (point.y >= 0 && point.y <= frame.H));
}
function jointPoint(frame, joint, threshold){
  if (joint === 'hipMid'){
    const left = frame.P?.lHip, right = frame.P?.rHip;
    if (!visible(left,threshold) || !visible(right,threshold) || !inFrame(left,frame) || !inFrame(right,frame)) return null;
    return {x:(left.x+right.x)/2, y:(left.y+right.y)/2, v:Math.min(left.v,right.v)};
  }
  const point = frame.P?.[joint];
  return visible(point,threshold) && inFrame(point,frame) ? point : null;
}

/** Source-pixel coordinates; singleton runs are retained but never joined across gaps. */
export function buildTrajectory(frames, {joint = 'rWri', from = 0, to = Infinity, maxGap = 1/24+.01, threshold = .65, maxStepScale = 3} = {}){
  if (!Array.isArray(frames) || !Object.prototype.hasOwnProperty.call(TRAJECTORY_LABELS,joint)
    || !(Number.isFinite(from) || from === -Infinity) || !(Number.isFinite(to) || to === Infinity)
    || from > to || !Number.isFinite(maxGap) || maxGap < 0
    || !Number.isFinite(threshold) || threshold < 0 || threshold > 1
    || !Number.isFinite(maxStepScale) || maxStepScale <= 0) return [];
  const ordered = frames.filter(frame => frame && Number.isFinite(frame.t)).slice().sort((a,b) => a.t-b.t);
  const paths = []; let path = [], previousFrame = null;
  const finish = () => { if (path.length) paths.push(path); path = []; previousFrame = null; };
  for (const frame of ordered){
    if (frame.t < from || frame.t > to){ finish(); continue; }
    const point = jointPoint(frame,joint,threshold);
    if (!point){ finish(); continue; }
    const last = path[path.length-1];
    const resized = previousFrame && ((Number.isFinite(frame.W) && Number.isFinite(previousFrame.W) && frame.W !== previousFrame.W)
      || (Number.isFinite(frame.H) && Number.isFinite(previousFrame.H) && frame.H !== previousFrame.H));
    // A large single-frame jump may be a tracking error. Keep both samples, but
    // never connect them or present the discontinuity as a technical mistake.
    const jumped = last && Number.isFinite(frame.scale) && frame.scale > 0
      && Math.hypot(point.x-last.x,point.y-last.y) > maxStepScale*frame.scale;
    if (last && (frame.t-last.t > maxGap+1e-9 || resized || jumped)) finish();
    const next = {x:point.x, y:point.y, t:frame.t, v:point.v};
    if (path.length && Math.abs(frame.t-path[path.length-1].t) <= 1e-9){
      if (next.v > path[path.length-1].v) path[path.length-1] = next;
    } else path.push(next);
    previousFrame = frame;
  }
  finish(); return paths;
}

/**
 * Report only the longest single continuous run, never motion across a tracking gap.
 * duration is seconds; distance/displacement/dx/dy are source pixels. Direction is
 * screen-relative endpoint displacement, not a technical judgement or 3D direction.
 */
export function directionSummary(paths, {minDistance = 6} = {}){
  const empty = {valid:false, direction:null, validPoints:0, duration:0, distance:0, displacement:0,
    dx:0, dy:0, from:null, to:null, segmentIndex:-1, reason:'資料不足，請選一段連續清楚的軌跡。'};
  if (!Array.isArray(paths) || !Number.isFinite(minDistance) || minDistance < 0) return empty;
  let chosen = null, segmentIndex = -1;
  paths.forEach((path,index) => {
    if (!Array.isArray(path) || !path.length || !path.every((point,i) => point && [point.x,point.y,point.t].every(Number.isFinite)
      && (!i || point.t > path[i-1].t))) return;
    const duration = path[path.length-1].t-path[0].t;
    const previousDuration = chosen ? chosen[chosen.length-1].t-chosen[0].t : -1;
    if (!chosen || duration > previousDuration || (duration === previousDuration && path.length > chosen.length)){
      chosen = path; segmentIndex = index;
    }
  });
  if (!chosen) return empty;
  const first = chosen[0], last = chosen[chosen.length-1];
  const dx = last.x-first.x, dy = last.y-first.y;
  let distance = 0;
  for (let i=1;i<chosen.length;i++) distance += Math.hypot(chosen[i].x-chosen[i-1].x,chosen[i].y-chosen[i-1].y);
  const result = {...empty, validPoints:chosen.length, duration:last.t-first.t, distance,
    displacement:Math.hypot(dx,dy), dx,dy,from:first.t,to:last.t,segmentIndex};
  if (chosen.length < 3 || result.duration <= 0) return {...result, reason:'連續標點不足 3 個，暫不判斷方向。'};
  if (result.displacement < minDistance || result.displacement <= 1e-9) return {...result, reason:'這一段起終點位移太小，方向不明顯。'};
  const directions = ['畫面右','畫面右下','畫面下','畫面左下','畫面左','畫面左上','畫面上','畫面右上'];
  const sector = (Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8;
  return {...result, valid:true, direction:directions[sector], reason:''};
}

/** click is relative to the canvas's top-left in CSS pixels; rect is in canvas pixels. */
export function annotationPoint(click, {canvasW,canvasH,cssW,cssH,rect,sourceW,sourceH} = {}){
  const x = click?.x, y = click?.y, rx = rect?.x ?? 0, ry = rect?.y ?? 0, rw = rect?.w, rh = rect?.h;
  if (![x,y,canvasW,canvasH,cssW,cssH,rx,ry,rw,rh,sourceW,sourceH].every(Number.isFinite)
    || [canvasW,canvasH,cssW,cssH,rw,rh,sourceW,sourceH].some(value => value <= 0)
    || x < 0 || x > cssW || y < 0 || y > cssH) return null;
  const px = x*canvasW/cssW, py = y*canvasH/cssH;
  const scale = Math.min(rw/sourceW,rh/sourceH);
  const imageX = rx+(rw-sourceW*scale)/2, imageY = ry+(rh-sourceH*scale)/2;
  if (px < imageX-1e-9 || px > imageX+sourceW*scale+1e-9 || py < imageY-1e-9 || py > imageY+sourceH*scale+1e-9) return null;
  return {x:Math.max(0,Math.min(sourceW,(px-imageX)/scale)), y:Math.max(0,Math.min(sourceH,(py-imageY)/scale))};
}
