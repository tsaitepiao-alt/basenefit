import * as THREE from './vendor/three.module.min.js';
import { ACTIONS, BaseballGame } from './game-engine.js';
import { BaseballScene } from './scene.js';

const GAME_OPTIONS = Object.freeze({
  maxInnings: 9,
  ghostRunnerFromInning: 10,
  learnerTeam: 'away',
  logLimit: 240,
  seed: 20261016,
  awayTeam: { name: 'TAIPEI TACTICS', shortName: 'TACTICS', color: '#38bdf8' },
  homeTeam: { name: 'NORTH STARS', shortName: 'STARS', color: '#fbbf24' },
});

const SCENARIOS = Object.freeze({
  opening: {
    seed: 20261016,
    message: '開局演練已載入：用球數與擊球策略建立第一波攻勢。',
    situation: {},
  },
  fullCount: {
    seed: 171717,
    message: '滿壘、滿球數：優先判讀好球帶，別替投手解套。',
    situation: {
      inning: 7, half: 'top', balls: 3, strikes: 2, outs: 1,
      score: { away: 2, home: 3 }, runners: { first: 0, second: 1, third: 2 },
    },
  },
  doublePlay: {
    seed: 252525,
    message: '雙殺守備：一壘有人、零出局，留意滾地球與二游站位。',
    situation: {
      inning: 5, half: 'top', balls: 1, strikes: 0, outs: 0,
      score: { away: 1, home: 1 }, runners: { first: 0 },
    },
  },
  sacrifice: {
    seed: 333333,
    message: '高壓推進：三壘有人、一出局，選擇能帶回分數的球。',
    situation: {
      inning: 7, half: 'top', balls: 1, strikes: 1, outs: 1,
      score: { away: 2, home: 2 }, runners: { third: 0 },
    },
  },
  walkoff: {
    seed: 444444,
    message: '九下守成：一分領先、一三壘有人，守備每一球都很關鍵。',
    situation: {
      inning: 9, half: 'bottom', balls: 1, strikes: 1, outs: 1,
      score: { away: 4, home: 3 }, runners: { first: 0, third: 1 },
    },
  },
  extras: {
    seed: 555555,
    message: '延長決勝：第 10 局自動二壘跑者，先創造得點圈壓力。',
    situation: {
      inning: 10, half: 'top', balls: 0, strikes: 0, outs: 0,
      score: { away: 3, home: 3 }, runners: { second: 0 },
    },
  },
});

const FIELDING_LABELS = Object.freeze({
  standard: '標準守備',
  doubleplay: '雙殺深度',
  infieldIn: '內野趨前',
  noDoubles: '防長打',
});

const FIELDING_SCENE_TARGET = Object.freeze({
  standard: 'shortstop',
  doubleplay: 'second',
  infieldIn: 'third',
  noDoubles: 'center',
});

const ACTION_LABELS = Object.freeze({
  [ACTIONS.BALL]: '壞球',
  [ACTIONS.CALLED_STRIKE]: '好球',
  [ACTIONS.SWING_MISS]: '揮空',
  [ACTIONS.FOUL]: '界外',
  [ACTIONS.WALK]: '四壞',
  [ACTIONS.INTENTIONAL_WALK]: '敬遠',
  [ACTIONS.HIT_BY_PITCH]: '觸身球',
  [ACTIONS.SINGLE]: '一安',
  [ACTIONS.DOUBLE]: '二安',
  [ACTIONS.TRIPLE]: '三安',
  [ACTIONS.HOME_RUN]: '全壘打',
  [ACTIONS.STRIKEOUT]: '三振',
  [ACTIONS.GROUND_OUT]: '滾地出局',
  [ACTIONS.FLY_OUT]: '飛球出局',
  [ACTIONS.SAC_FLY]: '高飛犧牲打',
  [ACTIONS.SAC_BUNT]: '犧牲短打',
  [ACTIONS.ERROR]: '失誤',
  [ACTIONS.FIELDERS_CHOICE]: '野手選擇',
  [ACTIONS.DOUBLE_PLAY]: '雙殺',
  [ACTIONS.TRIPLE_PLAY]: '三殺',
  [ACTIONS.STEAL]: '盜壘',
  [ACTIONS.WILD_PITCH]: '暴投',
});

const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const setText = (element, value) => {
  if (element) element.textContent = String(value ?? '');
};

const dom = {
  gamePhase: $('game-phase-label'),
  awayName: $('away-name'),
  awayRecord: $('away-record'),
  homeName: $('home-name'),
  homeRecord: $('home-record'),
  lineScoreTable: $('line-score-table'),
  inningLabel: $('inning-label'),
  matchupLabel: $('matchup-label'),
  pitcherName: $('pitcher-name'),
  batterName: $('batter-name'),
  winProbability: $('win-probability'),
  probabilityCopy: $('probability-copy'),
  field: $('field-3d'),
  fieldingPosition: $('fielding-position-label'),
  pitchCount: $('pitch-count'),
  fieldStatus: $('field-status'),
  lastPlay: $('last-play-text'),
  playNumber: $('play-number'),
  commandEyebrow: $('command-eyebrow'),
  commandTitle: $('command-title'),
  decisionSide: $('decision-side'),
  commandDescription: $('command-description'),
  offenseControls: $('offense-controls'),
  defenseControls: $('defense-controls'),
  offensePlay: $('offense-play-button'),
  defensePlay: $('defense-play-button'),
  intentionalWalk: $('intentional-walk-button'),
  fieldingSelect: $('fielding-select'),
  manualToggle: $('manual-toggle'),
  manualControls: $('manual-controls'),
  coachCall: $('coach-call'),
  coachReason: $('coach-reason'),
  coachScoreBar: $('coach-score-bar'),
  coachScoreLabel: $('coach-score-label'),
  batterLine: $('batter-line'),
  pitcherLine: $('pitcher-line'),
  inningRuns: $('inning-runs'),
  lobLine: $('lob-line'),
  playLog: $('play-log'),
  simulateHalf: $('simulate-half-button'),
  rankEmblem: $('rank-emblem'),
  rankLetter: $('rank-letter'),
  rankTitle: $('rank-title'),
  rankSummary: $('rank-summary'),
  rankProgress: $('rank-progress'),
  rankScore: $('rank-score'),
  rankHistory: $('rank-history'),
  reset: $('reset-button'),
  help: $('help-button'),
  helpModal: $('help-modal'),
  helpClose: $('help-close'),
  resultModal: $('result-modal'),
  modalClose: $('modal-close'),
  finalScore: $('final-score'),
  resultTitle: $('result-title'),
  finalRank: $('final-rank'),
  resultSummary: $('result-summary'),
  resultStats: $('result-stats'),
  closeResults: $('close-results'),
  newGame: $('new-game-button'),
};

const strategyButtons = $$('[data-strategy]');
const pitchButtons = $$('[data-pitch]');
const zoneButtons = $$('[data-zone]');
const scenarioButtons = $$('[data-scenario]');
const manualButtons = $$('[data-action]');
const bestRankStorageKey = 'diamond-tactics-best-rank-v1';

let game = new BaseballGame(GAME_OPTIONS);
let scene = null;
let busy = false;
let currentScenario = 'opening';
let statusMessage = '選擇策略，開始本球數。';
const selection = {
  strategy: 'take',
  pitch: 'fastball',
  zone: 'middle',
  fielding: 'standard',
};

function safeBestRank() {
  try {
    const value = JSON.parse(window.localStorage.getItem(bestRankStorageKey));
    return value && Number.isFinite(value.score) ? value : null;
  } catch {
    return null;
  }
}

function saveBestRank(rank) {
  const old = safeBestRank();
  const next = !old || rank.score > old.score
    ? { score: rank.score, rank: rank.rank, label: rank.label }
    : old;
  try {
    window.localStorage.setItem(bestRankStorageKey, JSON.stringify(next));
  } catch {
    // Third-party iframes can block storage; the in-memory game still works.
  }
  return next;
}

function buildCell(tagName, value, className = '') {
  const cell = document.createElement(tagName);
  cell.textContent = String(value);
  if (className) cell.className = className;
  return cell;
}

function formatInning(snapshot) {
  return `${snapshot.half === 'top' ? '▲' : '▼'} ${snapshot.inning} 局${snapshot.half === 'top' ? '上' : '下'}`;
}

function compactTeamLine(team) {
  const totals = team?.totals ?? { R: 0, H: 0, E: 0 };
  return `R ${totals.R} · H ${totals.H} · E ${totals.E}`;
}

function displayInningValue(snapshot, teamKey, inningIndex) {
  const values = snapshot.lineScore[teamKey] ?? [];
  if (inningIndex >= values.length) return '—';
  const isCurrent = inningIndex === snapshot.inning - 1;
  if (!snapshot.gameOver && isCurrent && snapshot.half === 'top' && teamKey === 'home') return '—';
  if (snapshot.gameOver && isCurrent && teamKey === 'home'
    && snapshot.final?.reason === 'homeLeadAfterTop') return 'X';
  return values[inningIndex];
}

function renderLineScore(snapshot) {
  const line = snapshot.lineScore;
  const innings = Math.max(GAME_OPTIONS.maxInnings, line.innings, snapshot.inning);
  const header = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.append(buildCell('th', '隊伍'));
  for (let inning = 1; inning <= innings; inning += 1) headerRow.append(buildCell('th', inning));
  ['R', 'H', 'E', 'LOB'].forEach((label) => headerRow.append(buildCell('th', label, 'total-cell')));
  header.append(headerRow);

  const body = document.createElement('tbody');
  for (const key of ['away', 'home']) {
    const team = snapshot.teams[key];
    const totals = line.totals[key];
    const row = document.createElement('tr');
    row.append(buildCell('th', team.shortName, 'team-line-name'));
    for (let index = 0; index < innings; index += 1) {
      const isCurrentBatting = !snapshot.gameOver && index === snapshot.inning - 1 && snapshot.battingTeam === key;
      row.append(buildCell('td', displayInningValue(snapshot, key, index), isCurrentBatting ? 'current-inning' : ''));
    }
    ['R', 'H', 'E', 'LOB'].forEach((stat) => row.append(buildCell('td', totals[stat], 'total-cell')));
    body.append(row);
  }
  dom.lineScoreTable.replaceChildren(header, body);
}

function renderLights(snapshot) {
  const setLights = (prefix, total, active) => {
    for (let number = 1; number <= total; number += 1) {
      $(`${prefix}-${number}`)?.classList.toggle('active', number <= active);
    }
  };
  setLights('ball-light', 3, snapshot.balls);
  setLights('strike-light', 2, snapshot.strikes);
  setLights('out-light', 2, snapshot.outs);
  for (const base of ['first', 'second', 'third']) {
    $(`base-${base}`)?.classList.toggle('active', Boolean(snapshot.bases[base]));
  }
}

function renderLog(snapshot) {
  const plays = game.getPlayLog(24).slice().reverse();
  if (!plays.length) {
    const blank = document.createElement('li');
    blank.className = 'empty-log';
    blank.textContent = '尚無比賽紀錄。執行第一球後，這裡會顯示完整過程。';
    dom.playLog.replaceChildren(blank);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const play of plays) {
    const item = document.createElement('li');
    const inning = document.createElement('span');
    inning.className = 'log-inning';
    inning.textContent = `${play.half === 'top' ? '▲' : '▼'}${play.inning}`;
    const description = document.createElement('span');
    description.textContent = play.description;
    const type = document.createElement('span');
    type.className = 'log-type';
    type.textContent = `${play.scoreAfter.away}-${play.scoreAfter.home}`;
    item.append(inning, description, type);
    fragment.append(item);
  }
  dom.playLog.replaceChildren(fragment);
}

function renderRank(rank) {
  setText(dom.rankLetter, rank.rank);
  setText(dom.rankTitle, rank.label);
  setText(dom.rankSummary, rank.summary);
  setText(dom.rankScore, `戰術分數 ${rank.score} / 100`);
  dom.rankProgress.style.width = `${rank.score}%`;
  dom.rankEmblem.style.boxShadow = `0 7px 20px ${rank.color}55`;
  const best = safeBestRank();
  const label = document.createElement('span');
  label.textContent = '最佳紀錄';
  const value = document.createElement('strong');
  value.textContent = best ? `${best.rank} · ${best.score} 分` : '尚無完成比賽';
  dom.rankHistory.replaceChildren(label, value);
}

function renderCoaching(snapshot, learnerOnOffense) {
  const advice = game.suggestTactics({ perspective: learnerOnOffense ? 'offense' : 'defense' });
  const best = advice.best;
  if (!best) return;
  setText(dom.coachCall, best.label);
  setText(dom.coachReason, best.reason);
  setText(dom.coachScoreLabel, `戰術契合度 ${best.score}`);
  dom.coachScoreBar.style.width = `${best.score}%`;
}

function renderCommandMode(snapshot, learnerOnOffense) {
  const disabled = busy || snapshot.gameOver;
  dom.offenseControls.classList.toggle('hidden', !learnerOnOffense);
  dom.defenseControls.classList.toggle('hidden', learnerOnOffense);
  setText(dom.decisionSide, learnerOnOffense ? '學員進攻' : '學員守備');
  setText(dom.commandEyebrow, learnerOnOffense ? 'OFFENSIVE PLAN' : 'DEFENSIVE PLAN');
  setText(dom.commandTitle, learnerOnOffense ? '打擊決策' : '守備決策');
  setText(dom.commandDescription, learnerOnOffense
    ? '依球數和壘上跑者，選擇這一球的進攻意圖。'
    : '設定球種、位置與守備站位，壓低對手的高價值結果。');

  for (const control of [...strategyButtons, ...pitchButtons, ...zoneButtons, ...manualButtons]) control.disabled = disabled;
  dom.offensePlay.disabled = disabled;
  dom.defensePlay.disabled = disabled;
  dom.intentionalWalk.disabled = disabled;
  dom.fieldingSelect.disabled = disabled;
  dom.simulateHalf.disabled = disabled;
}

function sceneState(snapshot, message = '') {
  return {
    inning: snapshot.inning,
    half: snapshot.half,
    balls: snapshot.balls,
    strikes: snapshot.strikes,
    outs: snapshot.outs,
    bases: snapshot.bases,
    score: snapshot.score,
    teams: {
      away: snapshot.teams.away.shortName,
      home: snapshot.teams.home.shortName,
    },
    batter: snapshot.batter?.name,
    pitcher: snapshot.pitcher?.name,
    fieldingPosition: FIELDING_SCENE_TARGET[selection.fielding],
    message,
  };
}

function render(snapshot = game.snapshot(), { status } = {}) {
  const learnerOnOffense = snapshot.battingTeam === snapshot.learnerTeam;
  const offense = snapshot.teams[snapshot.battingTeam];
  const fielding = snapshot.teams[snapshot.fieldingTeam];
  const currentInningAway = snapshot.lineScore.away[snapshot.inning - 1] ?? 0;
  const currentInningHome = snapshot.lineScore.home[snapshot.inning - 1] ?? 0;

  setText(dom.gamePhase, snapshot.gameOver ? '比賽結束 · 賽後報告已產生' : (learnerOnOffense ? '學員進攻 · 戰術演練中' : '學員守備 · 戰術演練中'));
  setText(dom.awayName, snapshot.teams.away.name);
  setText(dom.homeName, snapshot.teams.home.name);
  setText(dom.awayRecord, compactTeamLine(snapshot.teams.away));
  setText(dom.homeRecord, compactTeamLine(snapshot.teams.home));
  setText(dom.inningLabel, formatInning(snapshot));
  setText(dom.matchupLabel, `${offense.name} 進攻`);
  setText(dom.pitcherName, snapshot.pitcher?.name ?? '—');
  setText(dom.batterName, snapshot.batter?.name ?? '—');
  setText(dom.winProbability, `${snapshot.winProbability}%`);
  setText(dom.probabilityCopy, `${offense.shortName} 目前得分態勢`);
  setText(dom.fieldingPosition, FIELDING_LABELS[selection.fielding]);
  setText(dom.pitchCount, fielding.stats.Pitches);
  setText(dom.batterLine, `AB ${snapshot.batter?.batting?.AB ?? 0} · H ${snapshot.batter?.batting?.H ?? 0} · ${snapshot.batter?.batting?.AVG ?? '.000'}`);
  setText(dom.pitcherLine, `${snapshot.pitcher?.pitching?.IP ?? '0.0'} IP · ${snapshot.pitcher?.pitching?.H ?? 0} H · ${snapshot.pitcher?.pitching?.ER ?? 0} ER`);
  setText(dom.inningRuns, `${currentInningAway} / ${currentInningHome}`);
  setText(dom.lobLine, `${snapshot.teams.away.stats.LOB} / ${snapshot.teams.home.stats.LOB}`);
  setText(dom.playNumber, `# ${String(snapshot.playCount).padStart(3, '0')}`);
  setText(dom.lastPlay, snapshot.lastPlay?.description ?? '比賽開始：學員隊從 1 局上進攻。');
  if (status) statusMessage = status;
  setText(dom.fieldStatus, statusMessage);

  renderLineScore(snapshot);
  renderLights(snapshot);
  renderLog(snapshot);
  renderRank(snapshot.rank);
  renderCoaching(snapshot, learnerOnOffense);
  renderCommandMode(snapshot, learnerOnOffense);
  scene?.renderState(sceneState(snapshot));
}

function setSelected(buttons, value, attribute) {
  for (const button of buttons) button.classList.toggle('selected', button.dataset[attribute] === value);
}

function selectScenario(name) {
  currentScenario = name;
  for (const button of scenarioButtons) button.classList.toggle('active', button.dataset.scenario === name);
}

function pitchTarget(zone) {
  const targets = {
    'up-in': [-0.72, 1.72, -0.06], up: [0, 1.78, -0.06], 'up-away': [0.72, 1.72, -0.06],
    in: [-0.72, 1.22, -0.06], middle: [0, 1.24, -0.06], away: [0.72, 1.22, -0.06],
    'down-in': [-0.72, 0.78, -0.06], down: [0, 0.74, -0.06], 'down-away': [0.72, 0.78, -0.06],
  };
  return targets[zone] ?? targets.middle;
}

function runnerMoves(event) {
  return (event?.events ?? [])
    .filter((entry) => entry.type === 'advance' && entry.from && entry.to)
    .map((entry) => ({ from: entry.from, to: entry.to, team: event.team }));
}

function actionUsesPitch(action) {
  return ![ACTIONS.STEAL, ACTIONS.PICKOFF, ACTIONS.INTENTIONAL_WALK].includes(action);
}

async function animateResult(result, { pitchType = selection.pitch, zone = selection.zone, skipPitch = false } = {}) {
  if (!scene || !result?.event) return;
  const { event, snapshot } = result;
  try {
    if (!skipPitch && actionUsesPitch(event.action)) {
      await scene.animatePitch({ type: pitchType, target: pitchTarget(zone), duration: 420 });
    }
    await scene.animateOutcome({
      outcome: event.action,
      label: event.description,
      runnerMoves: runnerMoves(event),
      afterState: sceneState(snapshot, event.description),
      duration: 640,
      runnerDuration: 720,
    });
  } catch {
    // Visuals must never prevent the deterministic engine from accepting a play.
  }
}

async function resolvePlay(makeResult, animation = {}) {
  const before = game.snapshot();
  if (busy || before.gameOver) return;
  busy = true;
  render(before, { status: '本球數進行中…' });
  let result;
  try {
    result = makeResult();
  } catch (error) {
    busy = false;
    render(game.snapshot(), { status: `無法執行：${error.message}` });
    return;
  }
  if (!result?.ok) {
    busy = false;
    render(result?.snapshot ?? game.snapshot(), { status: result?.error ?? '這個局面無法執行該動作。' });
    return;
  }
  render(result.snapshot, { status: result.event.description });
  await animateResult(result, animation);
  busy = false;
  render(result.snapshot, { status: result.snapshot.gameOver ? '比賽結束，正在產生賽後報告。' : result.event.description });
  if (result.snapshot.gameOver) showFinalReport(result.snapshot);
}

function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let marker = game.random() * total;
  for (const entry of entries) {
    marker -= entry.weight;
    if (marker <= 0) return entry.action;
  }
  return entries.at(-1).action;
}

function defenseOutcome() {
  const pitchAdjustment = selection.pitch === 'slider'
    ? { strike: 7, miss: 7, hit: -3 }
    : selection.pitch === 'changeup'
      ? { strike: 3, miss: 4, hit: -1 }
      : { strike: 4, miss: 2, hit: 0 };
  const centerPenalty = selection.zone === 'middle' ? 8 : 0;
  const lowGrounder = selection.zone.startsWith('down') ? 7 : 0;
  return weightedPick([
    { action: ACTIONS.BALL, weight: selection.zone.includes('away') || selection.zone.includes('in') ? 19 : 15 },
    { action: ACTIONS.CALLED_STRIKE, weight: 22 + pitchAdjustment.strike },
    { action: ACTIONS.SWING_MISS, weight: 8 + pitchAdjustment.miss },
    { action: ACTIONS.FOUL, weight: 12 },
    { action: ACTIONS.GROUND_OUT, weight: 13 + lowGrounder },
    { action: ACTIONS.FLY_OUT, weight: 8 },
    { action: ACTIONS.SINGLE, weight: 12 + centerPenalty + pitchAdjustment.hit },
    { action: ACTIONS.DOUBLE, weight: 4 + Math.round(centerPenalty / 2) },
    { action: ACTIONS.HOME_RUN, weight: 1 + Math.round(centerPenalty / 3) },
    { action: ACTIONS.ERROR, weight: 1 },
  ]);
}

function playOffense() {
  const snapshot = game.snapshot();
  if (snapshot.battingTeam !== snapshot.learnerTeam) return;
  resolvePlay(() => game.simulatePitch(selection.strategy), { pitchType: selection.strategy === 'bunt' ? '短打戰術' : '打擊決策' });
}

function playDefense() {
  const snapshot = game.snapshot();
  if (snapshot.battingTeam === snapshot.learnerTeam) return;
  resolvePlay(() => {
    game.recordDecision('attackZone', { perspective: 'defense', defense: true, source: 'defense' });
    return game.play(defenseOutcome(), { trackDecision: false });
  });
}

function issueIntentionalWalk() {
  const snapshot = game.snapshot();
  if (snapshot.battingTeam === snapshot.learnerTeam) return;
  resolvePlay(() => {
    game.recordDecision(ACTIONS.INTENTIONAL_WALK, { perspective: 'defense', defense: true, source: 'defense' });
    return game.play(ACTIONS.INTENTIONAL_WALK, { trackDecision: false });
  }, { skipPitch: true });
}

async function autoCompleteHalf() {
  const initial = game.snapshot();
  if (busy || initial.gameOver) return;
  const initialInning = initial.inning;
  const initialHalf = initial.half;
  busy = true;
  render(initial, { status: '正在自動完成本半局…' });
  let latest = null;
  for (let index = 0; index < 96; index += 1) {
    const snapshot = game.snapshot();
    if (snapshot.gameOver || snapshot.inning !== initialInning || snapshot.half !== initialHalf) break;
    if (snapshot.battingTeam === snapshot.learnerTeam) {
      latest = game.simulatePitch(selection.strategy);
      if (!latest.ok && selection.strategy === 'steal') latest = game.simulatePitch('contact');
    } else {
      latest = game.play(defenseOutcome(), { trackDecision: false });
    }
    if (!latest?.ok) break;
  }
  const finalSnapshot = game.snapshot();
  const completed = finalSnapshot.gameOver || finalSnapshot.inning !== initialInning || finalSnapshot.half !== initialHalf;
  const finalMessage = completed
    ? (finalSnapshot.gameOver ? '比賽結束，正在產生賽後報告。' : '本半局已自動完成。')
    : '自動完成已暫停；請繼續執行下一球。';
  render(finalSnapshot, { status: finalMessage });
  if (latest?.ok) await animateResult(latest, { skipPitch: true });
  busy = false;
  render(finalSnapshot, { status: finalMessage });
  if (finalSnapshot.gameOver) showFinalReport(finalSnapshot);
}

function loadScenario(name) {
  if (busy || !SCENARIOS[name]) return;
  const scenario = SCENARIOS[name];
  game.reset({ ...GAME_OPTIONS, seed: scenario.seed });
  if (Object.keys(scenario.situation).length) game.debugSetSituation(scenario.situation);
  selectScenario(name);
  statusMessage = scenario.message;
  dom.resultModal.close?.();
  render(game.snapshot(), { status: scenario.message });
}

function resetGame() {
  loadScenario('opening');
}

function statBlock(label, value) {
  const wrapper = document.createElement('div');
  const small = document.createElement('span');
  const strong = document.createElement('strong');
  small.textContent = label;
  strong.textContent = value;
  wrapper.append(small, strong);
  return wrapper;
}

function showFinalReport(snapshot) {
  const { rank } = snapshot;
  const winner = snapshot.final?.winner;
  const learnerWon = winner === snapshot.learnerTeam;
  saveBestRank(rank);
  setText(dom.finalScore, `${snapshot.score.away} — ${snapshot.score.home}`);
  setText(dom.resultTitle, winner
    ? `${snapshot.teams[winner].name} ${learnerWon ? '勝出！' : '取得勝利'}`
    : '延長賽仍平手');
  setText(dom.finalRank, rank.rank);
  setText(dom.resultSummary, `${rank.summary} 決策平均 ${rank.decisionAverage} 分，完成 ${rank.decisions} 次戰術選擇。`);
  dom.resultStats.replaceChildren(
    statBlock('戰術分數', `${rank.score} / 100`),
    statBlock('學員隊安打', snapshot.teams[snapshot.learnerTeam].stats.H),
    statBlock('學員隊失誤', snapshot.teams[snapshot.learnerTeam].stats.E),
  );
  renderRank(rank);
  if (!dom.resultModal.open) dom.resultModal.showModal?.();
}

function bindEvents() {
  strategyButtons.forEach((button) => button.addEventListener('click', () => {
    selection.strategy = button.dataset.strategy;
    setSelected(strategyButtons, selection.strategy, 'strategy');
    render(game.snapshot());
  }));
  pitchButtons.forEach((button) => button.addEventListener('click', () => {
    selection.pitch = button.dataset.pitch;
    setSelected(pitchButtons, selection.pitch, 'pitch');
  }));
  zoneButtons.forEach((button) => button.addEventListener('click', () => {
    selection.zone = button.dataset.zone;
    setSelected(zoneButtons, selection.zone, 'zone');
  }));
  scenarioButtons.forEach((button) => button.addEventListener('click', () => loadScenario(button.dataset.scenario)));
  manualButtons.forEach((button) => button.addEventListener('click', () => {
    resolvePlay(() => game.play(button.dataset.action, { trackDecision: false }));
  }));
  dom.offensePlay.addEventListener('click', playOffense);
  dom.defensePlay.addEventListener('click', playDefense);
  dom.intentionalWalk.addEventListener('click', issueIntentionalWalk);
  dom.fieldingSelect.addEventListener('change', () => {
    selection.fielding = dom.fieldingSelect.value;
    render(game.snapshot());
  });
  dom.manualToggle.addEventListener('click', () => {
    const expanded = dom.manualToggle.getAttribute('aria-expanded') === 'true';
    dom.manualToggle.setAttribute('aria-expanded', String(!expanded));
    dom.manualControls.classList.toggle('hidden', expanded);
  });
  dom.simulateHalf.addEventListener('click', autoCompleteHalf);
  dom.reset.addEventListener('click', resetGame);
  dom.help.addEventListener('click', () => {
    if (!dom.helpModal.open) dom.helpModal.showModal?.();
  });
  [dom.helpClose].forEach((button) => button.addEventListener('click', () => dom.helpModal.close?.()));
  [dom.modalClose, dom.closeResults].forEach((button) => button.addEventListener('click', () => dom.resultModal.close?.()));
  dom.newGame.addEventListener('click', () => {
    dom.resultModal.close?.();
    resetGame();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === ' ' && !event.repeat && !event.target.matches('button, select, input, textarea')) {
      event.preventDefault();
      const snapshot = game.snapshot();
      if (snapshot.battingTeam === snapshot.learnerTeam) playOffense();
      else playDefense();
    }
    if (/^[1-6]$/.test(event.key) && !event.target.matches('button, select, input, textarea')) {
      const names = ['opening', 'fullCount', 'doublePlay', 'sacrifice', 'walkoff', 'extras'];
      loadScenario(names[Number(event.key) - 1]);
    }
  });
  window.addEventListener('beforeunload', () => scene?.dispose());
}

async function bootstrap() {
  bindEvents();
  selectScenario(currentScenario);
  setSelected(strategyButtons, selection.strategy, 'strategy');
  setSelected(pitchButtons, selection.pitch, 'pitch');
  setSelected(zoneButtons, selection.zone, 'zone');
  render(game.snapshot());
  scene = new BaseballScene(dom.field, { THREE, autoRotate: true, interactive: true });
  scene.renderState(sceneState(game.snapshot()));
  await scene.init();
  render(game.snapshot());
}

bootstrap().catch((error) => {
  console.error('Diamond Tactics Lab could not initialize the 3D scene.', error);
  render(game.snapshot(), { status: '球場畫面暫時無法載入；計分與戰術模擬仍可使用。' });
});
