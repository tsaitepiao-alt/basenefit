/* Pure geometry for synchronised motion review. Left/right labels refer to the student. */
export const JOINT_LABELS = Object.freeze({
  nose:'鼻尖（頭部）', lSho:'左肩', rSho:'右肩', lElb:'左手肘', rElb:'右手肘',
  lWri:'左手腕', rWri:'右手腕', lHip:'左髖', rHip:'右髖',
  lKnee:'左膝', rKnee:'右膝', lAnk:'左腳踝', rAnk:'右腳踝'
});
export const SKELETON_SEGMENTS = Object.freeze([
  ['lSho','rSho'], ['lSho','lElb'], ['lElb','lWri'], ['rSho','rElb'], ['rElb','rWri'],
  ['lSho','lHip'], ['rSho','rHip'], ['lHip','rHip'], ['lHip','lKnee'], ['lKnee','lAnk'],
  ['rHip','rKnee'], ['rKnee','rAnk']
].map(segment => Object.freeze(segment)));

export function pointVisible(p, threshold = .65){
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.v)
    && Number.isFinite(threshold) && p.v >= threshold;
}

/** Never carry a pose over an untracked interval, even if an endpoint is nearby. */
export function nearestFrame(frames, t, maxGap = .085){
  if (!Array.isArray(frames) || !Number.isFinite(t) || !Number.isFinite(maxGap) || maxGap < 0) return null;
  let closest = null, distance = Infinity, before = null, after = null;
  for (const frame of frames){
    if (!frame || !Number.isFinite(frame.t)) continue;
    const gap = Math.abs(frame.t - t);
    if (gap < distance){ distance = gap; closest = frame; }
    if (frame.t <= t && (!before || frame.t > before.t)) before = frame;
    if (frame.t >= t && (!after || frame.t < after.t)) after = frame;
  }
  if (!closest || distance > maxGap + 1e-9) return null;
  if (before && after && before !== after && after.t - before.t > 2 * maxGap + 1e-9
      && distance > 1e-9) return null;
  return closest;
}

function rectangle(rect){
  const x = rect?.x ?? 0, y = rect?.y ?? 0;
  const w = rect?.w ?? rect?.width, h = rect?.h ?? rect?.height;
  if (![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0) throw new RangeError('Invalid review rectangle');
  return {x,y,w,h};
}

/** Contain the complete source frame; dx/dy include letterboxing offsets. */
export function fitFrame(W, H, rect){
  if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) throw new RangeError('Invalid source dimensions');
  const {x,y,w,h} = rectangle(rect);
  const scale = Math.min(w/W, h/H);
  return {scale, dx:x+(w-W*scale)/2, dy:y+(h-H*scale)/2};
}

function bodyBasis(P, threshold = .65){
  if (!P || !['lSho','rSho','lHip','rHip'].every(key => pointVisible(P[key], threshold))) return null;
  const hip = {x:(P.lHip.x+P.rHip.x)/2, y:(P.lHip.y+P.rHip.y)/2};
  const shoulder = {x:(P.lSho.x+P.rSho.x)/2, y:(P.lSho.y+P.rSho.y)/2};
  const torso = Math.hypot(shoulder.x-hip.x, shoulder.y-hip.y);
  return Number.isFinite(torso) && torso > 1e-6 ? {hip, torso} : null;
}

/** Match torso scale and hip centre. No rotation, joint correction, or stretching. */
export function bodyTransform(P, rect, {mirror = false} = {}){
  const basis = bodyBasis(P);
  if (!basis) return null;
  const {x,y,w,h} = rectangle(rect);
  const targetTorso = Math.min(w*.30, h*.25);
  return {scale:targetTorso/basis.torso, dx:x+w/2, dy:y+h/2,
    mirror:!!mirror, originX:basis.hip.x, originY:basis.hip.y};
}

/** dx/dy represent the target hip centre for a bodyTransform. */
export function projectPoint(p, transform){
  if (!p || !transform || ![p.x,p.y,transform.scale,transform.dx,transform.dy,transform.originX,transform.originY].every(Number.isFinite)
      || transform.scale <= 0) return null;
  const direction = transform.mirror ? -1 : 1;
  return {x:transform.dx + direction*(p.x-transform.originX)*transform.scale,
    y:transform.dy + (p.y-transform.originY)*transform.scale};
}

function referenceKey(key, mirror){
  return !mirror || key === 'nose' ? key : key.startsWith('l') ? 'r'+key.slice(1) : key.startsWith('r') ? 'l'+key.slice(1) : key;
}

/**
 * Compare two externally aligned poses in torso-length units.
 * mirror=true means "swap the demonstration's sides": reflect X AND swap l/r keys.
 * Returned keys/labels always refer to the student. dx/dy = student minus reference;
 * positive dx/dy means farther right/down in the review image, not "wrong".
 */
export function comparePose(student, reference, {mirror = false, keys = [], threshold = .65} = {}){
  const S = student?.P || student, R = reference?.P || reference;
  const a = bodyBasis(S, threshold), b = bodyBasis(R, threshold);
  if (!a || !b || !Array.isArray(keys)) return [];
  const selected = [...new Set(keys.length ? keys : Object.keys(JOINT_LABELS))];
  const differences = [];
  for (const key of selected){
    if (!Object.prototype.hasOwnProperty.call(JOINT_LABELS, key)) continue;
    const p = S[key], q = R[referenceKey(key, mirror)];
    if (!pointVisible(p, threshold) || !pointVisible(q, threshold)) continue;
    const dx = (p.x-a.hip.x)/a.torso - (mirror ? -1 : 1)*(q.x-b.hip.x)/b.torso;
    const dy = (p.y-a.hip.y)/a.torso - (q.y-b.hip.y)/b.torso;
    differences.push({key, label:JOINT_LABELS[key], distance:Math.hypot(dx,dy), dx, dy});
  }
  return differences.sort((a,b) => b.distance-a.distance);
}
