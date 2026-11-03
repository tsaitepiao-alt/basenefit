// Angle estimates on the student's timeline. Each input segment is a separate path.
const CHART_WIDTH = 720;
const CHART_HEIGHT = 300;
const VALUE_TOLERANCE = 1/48+.002;
const STUDENT_COLOR = '#42d6df';
const REFERENCE_COLOR = '#ffad54';
const DEFAULT_LABEL = '肘部屈曲（估測）';

function finiteTime(value){
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

function cleanSegments(input, offset = 0){
  if (!Array.isArray(input) || !finiteTime(offset)) return [];
  const result = [];
  for (const segment of input){
    if (!Array.isArray(segment)) continue;
    let current = [];
    const flush = () => { if (current.length) result.push(current); current = []; };
    for (const point of segment){
      const t = point?.t + offset;
      const valid = finiteTime(point?.t) && finiteTime(t)
        && Number.isFinite(point?.value) && point.value >= 0 && point.value <= 180;
      if (!valid){ flush(); continue; }
      // Do not draw backwards through a timestamp reset or interpolate invalid data.
      if (current.length && (t <= current[current.length-1].t || t-current[current.length-1].t>1/24+.01)) flush();
      current.push({t, value:point.value});
    }
    flush();
  }
  return result;
}

function nearestPoint(segments, time){
  if (!finiteTime(time)) return null;
  let best = null;
  let distance = VALUE_TOLERANCE + 1e-12;
  for (const segment of segments){
    for (const point of segment){
      const delta = Math.abs(point.t - time);
      if (delta <= VALUE_TOLERANCE + 1e-12
        && (delta < distance - 1e-12 || (!best || Math.abs(delta-distance) <= 1e-12 && point.t < best.t))){
        best = point;
        distance = delta;
      }
    }
  }
  return best;
}

function chartDomain(student, reference){
  let from = 0, to = 0;
  for (const segment of [...student, ...reference]){
    for (const point of segment){ from = Math.min(from, point.t); to = Math.max(to, point.t); }
  }
  if (to-from < .001) to = from + 1;
  return {from, to};
}

function secondsLabel(value, span){
  if (Math.abs(value) >= 10000) return value.toExponential(1) + 's';
  return value.toFixed(span < 1 ? 2 : 1) + 's';
}

/**
 * Draw angle estimates without bridging segment gaps or manufacturing missing values.
 * reference raw t is mapped to student t by raw t + referenceOffset.
 * time is on the student timeline; values require a real sample within half a 24-fps frame.
 */
export function drawAngleChart(canvas, {
  series = [], referenceSeries = [], time = 0, label = DEFAULT_LABEL, referenceOffset = 0
} = {}){
  const student = cleanSegments(series);
  const reference = cleanSegments(referenceSeries, referenceOffset);
  const {from, to} = chartDomain(student, reference);
  const plotRect = {x:64, y:52, width:632, height:180};
  const studentPoint = nearestPoint(student, time);
  const referencePoint = nearestPoint(reference, time);
  const result = {
    value:studentPoint?.value ?? null,
    referenceValue:referencePoint?.value ?? null,
    plotRect, from, to
  };
  if (!canvas || typeof canvas.getContext !== 'function') return result;
  canvas.width = CHART_WIDTH;
  canvas.height = CHART_HEIGHT;
  if (canvas.style){ canvas.style.width = '100%'; canvas.style.height = 'auto'; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return result;

  ctx.clearRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
  ctx.fillStyle = '#0b0f0c';
  ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
  ctx.font = '600 24px system-ui, "PingFang TC", sans-serif';
  ctx.fillStyle = '#eef3e6';
  ctx.textAlign = 'left';
  ctx.fillText(typeof label === 'string' && label.trim() ? label : DEFAULT_LABEL, 20, 25, 380);
  ctx.font = '22px system-ui, "PingFang TC", sans-serif';
  ctx.fillStyle = STUDENT_COLOR;
  ctx.fillText('● 學生', 460, 25);
  ctx.fillStyle = REFERENCE_COLOR;
  ctx.fillText('● 示範', 570, 25);

  const xAt = t => plotRect.x + (t-from)/(to-from)*plotRect.width;
  const yAt = value => plotRect.y + (1-value/180)*plotRect.height;
  const bottom = plotRect.y + plotRect.height;
  ctx.lineWidth = 1;
  for (const value of [0, 90, 180]){
    const y = yAt(value);
    ctx.strokeStyle = '#29372f';
    ctx.beginPath(); ctx.moveTo(plotRect.x, y); ctx.lineTo(plotRect.x+plotRect.width, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillStyle = '#a9b7ad';
    ctx.fillText(value + '°', plotRect.x-10, y+5);
  }
  ctx.strokeStyle = '#779084';
  ctx.beginPath(); ctx.moveTo(plotRect.x, plotRect.y); ctx.lineTo(plotRect.x, bottom);
  ctx.lineTo(plotRect.x+plotRect.width, bottom); ctx.stroke();
  ctx.textAlign = 'center';
  for (let i=0; i<=4; i++){
    const t = from+(to-from)*i/4;
    const x = xAt(t);
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, bottom+5); ctx.stroke();
    ctx.fillStyle = '#a9b7ad';
    ctx.fillText(secondsLabel(t, to-from), x, bottom+24);
  }

  ctx.save();
  ctx.beginPath(); ctx.rect(plotRect.x, plotRect.y, plotRect.width, plotRect.height); ctx.clip();
  const drawSegments = (segments, color) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const segment of segments){
      if (segment.length === 1){
        ctx.beginPath(); ctx.arc(xAt(segment[0].t), yAt(segment[0].value), 2.5, 0, Math.PI*2); ctx.fill();
        continue;
      }
      ctx.beginPath();
      segment.forEach((point, i) => {
        if (i === 0) ctx.moveTo(xAt(point.t), yAt(point.value));
        else ctx.lineTo(xAt(point.t), yAt(point.value));
      });
      ctx.stroke();
    }
  };
  drawSegments(reference, REFERENCE_COLOR);
  drawSegments(student, STUDENT_COLOR);
  if (finiteTime(time) && time >= from && time <= to){
    const x = xAt(time);
    ctx.strokeStyle = '#e8f2ec'; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x, plotRect.y); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const [point, color] of [[studentPoint,STUDENT_COLOR],[referencePoint,REFERENCE_COLOR]]){
    if (!point) continue;
    ctx.fillStyle = color; ctx.strokeStyle = '#0b0f0c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(xAt(point.t), yAt(point.value), 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();

  ctx.textAlign = 'left'; ctx.font = '22px system-ui, "PingFang TC", sans-serif';
  ctx.fillStyle = STUDENT_COLOR;
  ctx.fillText(result.value === null ? '學生：此時無有效角度' : '學生：' + result.value.toFixed(1) + '°（估測）', plotRect.x, 285, 300);
  ctx.fillStyle = REFERENCE_COLOR;
  ctx.fillText(result.referenceValue === null ? '示範：此時無有效角度' : '示範：' + result.referenceValue.toFixed(1) + '°（估測）', 390, 285, 306);
  if (!student.length && !reference.length){
    ctx.fillStyle = '#c5d3ca'; ctx.textAlign = 'center';
    ctx.fillText('尚無有效角度資料，請先完成動作辨識', plotRect.x+plotRect.width/2, plotRect.y+plotRect.height/2, plotRect.width-24);
  }
  return result;
}

/** clickX is relative to the canvas's left edge, in CSS pixels. */
export function timeAtChartClick(clickX, {cssWidth, canvasWidth = CHART_WIDTH, plotRect, from, to} = {}){
  if (!Number.isFinite(clickX) || !Number.isFinite(cssWidth) || cssWidth <= 0
    || !Number.isFinite(canvasWidth) || canvasWidth <= 0
    || !Number.isFinite(plotRect?.x) || !Number.isFinite(plotRect?.width) || plotRect.width <= 0
    || !finiteTime(from) || !finiteTime(to) || to <= from) return null;
  const intrinsicX = clickX/cssWidth*canvasWidth;
  const ratio = Math.max(0, Math.min(1, (intrinsicX-plotRect.x)/plotRect.width));
  const time = from+(to-from)*ratio;
  return finiteTime(time) ? time : null;
}
