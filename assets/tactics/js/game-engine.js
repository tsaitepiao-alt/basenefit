/**
 * Baseball tactics simulation engine.
 *
 * This module deliberately has no DOM, Three.js, or browser-storage dependency.
 * A UI can render `game.snapshot()` after every call to `game.play()` or
 * `game.simulatePitch()`.  All stochastic choices use the seeded PRNG, so a
 * training scenario can be replayed exactly by using the same seed and inputs.
 */

export const ACTIONS = Object.freeze({
  BALL: "ball",
  CALLED_STRIKE: "calledStrike",
  SWING_MISS: "swingMiss",
  FOUL: "foul",
  WALK: "walk",
  INTENTIONAL_WALK: "intentionalWalk",
  HIT_BY_PITCH: "hitByPitch",
  SINGLE: "single",
  DOUBLE: "double",
  TRIPLE: "triple",
  HOME_RUN: "homeRun",
  STRIKEOUT: "strikeout",
  GROUND_OUT: "groundOut",
  FLY_OUT: "flyOut",
  SAC_FLY: "sacFly",
  SAC_BUNT: "sacBunt",
  ERROR: "error",
  FIELDERS_CHOICE: "fieldersChoice",
  DOUBLE_PLAY: "doublePlay",
  TRIPLE_PLAY: "triplePlay",
  STEAL: "steal",
  PICKOFF: "pickoff",
  WILD_PITCH: "wildPitch",
  PASSED_BALL: "passedBall",
  BALK: "balk",
});

const BASES = ["first", "second", "third"];
const DESCENDING_BASES = ["third", "second", "first"];
const POSITIONS = ["CF", "SS", "2B", "1B", "RF", "3B", "LF", "C", "P"];
const DEFAULT_AWAY_LINEUP = [
  "陳子翔", "林冠宇", "吳承恩", "張睿廷", "黃柏勳", "李昱辰", "周子豪", "許哲維", "王秉睿",
];
const DEFAULT_HOME_LINEUP = [
  "江昱安", "郭承翰", "蘇柏宇", "蔡冠霖", "鄭凱文", "何宥辰", "羅子謙", "高睿哲", "杜承洋",
];

const ACTION_ALIASES = Object.freeze({
  ball: ACTIONS.BALL,
  bb: ACTIONS.BALL,
  calledstrike: ACTIONS.CALLED_STRIKE,
  strike: ACTIONS.CALLED_STRIKE,
  swingmiss: ACTIONS.SWING_MISS,
  whiff: ACTIONS.SWING_MISS,
  foul: ACTIONS.FOUL,
  walk: ACTIONS.WALK,
  baseonballs: ACTIONS.WALK,
  intentionalwalk: ACTIONS.INTENTIONAL_WALK,
  ibb: ACTIONS.INTENTIONAL_WALK,
  hitbypitch: ACTIONS.HIT_BY_PITCH,
  hbp: ACTIONS.HIT_BY_PITCH,
  single: ACTIONS.SINGLE,
  oneb: ACTIONS.SINGLE,
  double: ACTIONS.DOUBLE,
  twob: ACTIONS.DOUBLE,
  triple: ACTIONS.TRIPLE,
  threeb: ACTIONS.TRIPLE,
  homerun: ACTIONS.HOME_RUN,
  home_run: ACTIONS.HOME_RUN,
  hr: ACTIONS.HOME_RUN,
  strikeout: ACTIONS.STRIKEOUT,
  k: ACTIONS.STRIKEOUT,
  groundout: ACTIONS.GROUND_OUT,
  go: ACTIONS.GROUND_OUT,
  flyout: ACTIONS.FLY_OUT,
  fo: ACTIONS.FLY_OUT,
  sacrificefly: ACTIONS.SAC_FLY,
  sacfly: ACTIONS.SAC_FLY,
  sf: ACTIONS.SAC_FLY,
  sacrificebunt: ACTIONS.SAC_BUNT,
  sacbunt: ACTIONS.SAC_BUNT,
  bunt: ACTIONS.SAC_BUNT,
  error: ACTIONS.ERROR,
  roe: ACTIONS.ERROR,
  fielderschoice: ACTIONS.FIELDERS_CHOICE,
  fc: ACTIONS.FIELDERS_CHOICE,
  doubleplay: ACTIONS.DOUBLE_PLAY,
  dp: ACTIONS.DOUBLE_PLAY,
  tripleplay: ACTIONS.TRIPLE_PLAY,
  tp: ACTIONS.TRIPLE_PLAY,
  steal: ACTIONS.STEAL,
  stolenbase: ACTIONS.STEAL,
  pickoff: ACTIONS.PICKOFF,
  wildpitch: ACTIONS.WILD_PITCH,
  wp: ACTIONS.WILD_PITCH,
  passedball: ACTIONS.PASSED_BALL,
  pb: ACTIONS.PASSED_BALL,
  balk: ACTIONS.BALK,
});

const DECISION_ALIASES = Object.freeze({
  swing: "contact",
  contact: "contact",
  protect: "contact",
  power: "power",
  aggressive: "power",
  take: "take",
  patient: "take",
  bunt: ACTIONS.SAC_BUNT,
  sacbunt: ACTIONS.SAC_BUNT,
  steal: ACTIONS.STEAL,
  intentionalwalk: ACTIONS.INTENTIONAL_WALK,
  ibb: ACTIONS.INTENTIONAL_WALK,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hashSeed(seed) {
  if (Number.isFinite(Number(seed))) return Number(seed) >>> 0;
  const text = String(seed ?? "baseball-tactics");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normaliseToken(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

function normaliseAction(value) {
  const compact = normaliseToken(value);
  return ACTION_ALIASES[compact] ?? null;
}

function normaliseDecision(value) {
  const compact = normaliseToken(value);
  return DECISION_ALIASES[compact] ?? null;
}

function normaliseBase(value) {
  const token = normaliseToken(value);
  if (["first", "1", "1b"].includes(token)) return "first";
  if (["second", "2", "2b"].includes(token)) return "second";
  if (["third", "3", "3b"].includes(token)) return "third";
  if (["home", "plate", "4"].includes(token)) return "home";
  return null;
}

function formatRate(numerator, denominator) {
  if (!denominator) return ".000";
  return (numerator / denominator).toFixed(3).replace(/^0/, "");
}

function blankBattingLine() {
  return {
    PA: 0,
    AB: 0,
    R: 0,
    H: 0,
    "1B": 0,
    "2B": 0,
    "3B": 0,
    HR: 0,
    RBI: 0,
    BB: 0,
    IBB: 0,
    HBP: 0,
    SO: 0,
    GO: 0,
    FO: 0,
    GIDP: 0,
    SF: 0,
    SH: 0,
    ROE: 0,
    FC: 0,
    TB: 0,
    SB: 0,
    CS: 0,
  };
}

function blankPitchingLine() {
  return {
    P: 0,
    Strikes: 0,
    Balls: 0,
    BF: 0,
    IPOuts: 0,
    H: 0,
    R: 0,
    ER: 0,
    BB: 0,
    IBB: 0,
    HBP: 0,
    SO: 0,
    HR: 0,
    WP: 0,
    BK: 0,
  };
}

function blankFieldingLine() {
  return { PO: 0, A: 0, E: 0, DP: 0, TP: 0 };
}

function blankTeamLine() {
  return {
    R: 0,
    H: 0,
    E: 0,
    LOB: 0,
    AB: 0,
    BB: 0,
    SO: 0,
    HR: 0,
    SB: 0,
    CS: 0,
    DP: 0,
    TP: 0,
    Pitches: 0,
  };
}

function withBattingRates(line) {
  const result = clone(line);
  const onBase = line.H + line.BB + line.HBP;
  const obpDenominator = line.AB + line.BB + line.HBP + line.SF;
  result.AVG = formatRate(line.H, line.AB);
  result.OBP = formatRate(onBase, obpDenominator);
  result.SLG = formatRate(line.TB, line.AB);
  const ops = (line.H / Math.max(1, line.AB)) + (onBase / Math.max(1, obpDenominator));
  result.OPS = ops.toFixed(3).replace(/^0/, "");
  return result;
}

function withPitchingRates(line) {
  const result = clone(line);
  const innings = `${Math.floor(line.IPOuts / 3)}.${line.IPOuts % 3}`;
  result.IP = innings;
  result.ERA = line.IPOuts ? ((line.ER * 27) / line.IPOuts).toFixed(2) : "0.00";
  result.WHIP = line.IPOuts ? ((line.BB + line.H) / (line.IPOuts / 3)).toFixed(2) : "0.00";
  result.StrikePct = line.P ? `${Math.round((line.Strikes / line.P) * 100)}%` : "0%";
  return result;
}

function defaultAttributes(index) {
  return {
    contact: 52 + ((index * 7) % 23),
    power: 46 + ((index * 11) % 28),
    speed: 50 + ((index * 13) % 31),
    discipline: 48 + ((index * 5) % 30),
  };
}

function createPlayer(input, index, teamKey) {
  const source = typeof input === "string" ? { name: input } : (input ?? {});
  const attributes = { ...defaultAttributes(index), ...(source.attributes ?? {}) };
  for (const key of Object.keys(attributes)) attributes[key] = clamp(asInteger(attributes[key], 50), 1, 100);
  return {
    id: source.id ?? `${teamKey}-p${index + 1}`,
    name: source.name ?? `球員 ${index + 1}`,
    number: source.number ?? index + 1,
    position: source.position ?? POSITIONS[index % POSITIONS.length],
    attributes,
    batting: blankBattingLine(),
    pitching: blankPitchingLine(),
    fielding: blankFieldingLine(),
  };
}

function createTeam(input, key, defaultName, defaultLineup) {
  const source = typeof input === "string" ? { name: input } : (input ?? {});
  const sourceLineup = source.lineup ?? source.players ?? defaultLineup;
  const players = Array.isArray(sourceLineup) && sourceLineup.length
    ? sourceLineup.slice(0, 9).map((player, index) => createPlayer(player, index, key))
    : defaultLineup.map((player, index) => createPlayer(player, index, key));
  while (players.length < 9) players.push(createPlayer(null, players.length, key));
  const suppliedPitcher = source.pitcherId ?? source.pitcher?.id ?? source.pitcher;
  const pitcher = players.find((player) => player.id === suppliedPitcher || player.name === suppliedPitcher)
    ?? players.find((player) => player.position === "P")
    ?? players[players.length - 1];

  return {
    key,
    id: source.id ?? key,
    name: source.name ?? defaultName,
    shortName: source.shortName ?? source.abbr ?? defaultName.slice(0, 3),
    color: source.color ?? (key === "home" ? "#eab308" : "#38bdf8"),
    lineup: players,
    battingIndex: 0,
    pitcherId: pitcher.id,
    stats: blankTeamLine(),
  };
}

function runnerView(runner) {
  if (!runner) return null;
  return {
    id: runner.playerId,
    name: runner.name,
    number: runner.number,
    team: runner.teamKey,
    speed: runner.speed,
    reachedBy: runner.reachedBy,
    earned: runner.earned,
  };
}

function playerView(player) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    number: player.number,
    position: player.position,
    attributes: clone(player.attributes),
    batting: withBattingRates(player.batting),
    pitching: withPitchingRates(player.pitching),
    fielding: clone(player.fielding),
  };
}

/**
 * A deterministic state machine for a regulation baseball game.
 *
 * The primary explicit-result API is `play(action, options)`.  Use it when a
 * UI button or a 3D animation has already determined the result.  For a
 * playable seeded simulation use `simulatePitch("take" | "contact" | "power")`.
 */
export class BaseballGame {
  constructor(options = {}) {
    this._initialOptions = clone(options);
    this._configure(options);
    this._seed = hashSeed(options.seed ?? 20261016);
    this._rngState = this._seed;
    this._state = this._createInitialState(options);
  }

  _configure(options = {}) {
    this.options = {
      maxInnings: Math.max(1, asInteger(options.maxInnings, 9)),
      // Set to a positive inning number (for example 10) to use an automatic
      // runner on second in extra innings.  It is disabled by default.
      ghostRunnerFromInning: Math.max(0, asInteger(options.ghostRunnerFromInning, 0)),
      mercyRule: options.mercyRule ?? null,
      logLimit: Math.max(50, asInteger(options.logLimit, 320)),
      // Most training screens put the learner in the away/top dugout, but a
      // host page can choose `learnerTeam: "home"` without changing grading.
      learnerTeam: options.learnerTeam === "home" ? "home" : "away",
    };
  }

  _createInitialState(options) {
    const state = {
      version: 1,
      seed: this._seed,
      sequence: 0,
      phase: "live",
      inning: 1,
      half: "top",
      balls: 0,
      strikes: 0,
      outs: 0,
      bases: { first: null, second: null, third: null },
      teams: {
        away: createTeam(options.awayTeam, "away", "客隊先鋒", DEFAULT_AWAY_LINEUP),
        home: createTeam(options.homeTeam, "home", "主隊雷霆", DEFAULT_HOME_LINEUP),
      },
      score: { away: 0, home: 0 },
      lineScore: { away: [0], home: [0] },
      inningSummaries: [],
      playLog: [],
      decisionLog: [],
      lastPlay: null,
      final: null,
    };
    return state;
  }

  /** Rebuilds the game. Passing a seed makes replay scenarios reproducible. */
  reset(options = {}) {
    const config = { ...this._initialOptions, ...options };
    this._initialOptions = clone(config);
    this._configure(config);
    this.setSeed(config.seed ?? 20261016);
    this._state = this._createInitialState(config);
    return this.snapshot();
  }

  setSeed(seed) {
    this._seed = hashSeed(seed);
    this._rngState = this._seed;
    if (this._state) this._state.seed = this._seed;
    return this._seed;
  }

  random() {
    // LCG: tiny, deterministic, and browser safe.  This is not security RNG.
    this._rngState = (Math.imul(1664525, this._rngState) + 1013904223) >>> 0;
    return this._rngState / 4294967296;
  }

  get state() {
    return this.snapshot();
  }

  get gameOver() {
    return this._state.phase === "final";
  }

  get activeTeamKey() {
    return this._offenseKey();
  }

  get currentBatter() {
    return playerView(this._currentBatter());
  }

  get currentPitcher() {
    return playerView(this._pitcher());
  }

  _offenseKey() {
    return this._state.half === "top" ? "away" : "home";
  }

  _defenseKey() {
    return this._state.half === "top" ? "home" : "away";
  }

  _offense() {
    return this._state.teams[this._offenseKey()];
  }

  _defense() {
    return this._state.teams[this._defenseKey()];
  }

  _team(key) {
    return this._state.teams[key];
  }

  _currentBatter() {
    const team = this._offense();
    return team.lineup[team.battingIndex % team.lineup.length];
  }

  _pitcher() {
    const team = this._defense();
    return team.lineup.find((player) => player.id === team.pitcherId) ?? team.lineup[team.lineup.length - 1];
  }

  _findPlayer(teamKey, playerId) {
    const team = this._team(teamKey);
    return team?.lineup.find((player) => player.id === playerId) ?? null;
  }

  _findFielder(value, fallbackPosition = "SS") {
    const team = this._defense();
    if (value) {
      const token = String(value);
      const direct = team.lineup.find((player) => player.id === token || player.name === token || player.position === token);
      if (direct) return direct;
    }
    return team.lineup.find((player) => player.position === fallbackPosition) ?? this._pitcher();
  }

  _makeRunner(player, overrides = {}) {
    return {
      playerId: player.id,
      teamKey: this._offenseKey(),
      name: player.name,
      number: player.number,
      speed: player.attributes.speed,
      reachedBy: overrides.reachedBy ?? "unknown",
      // A runner who reached on an error is treated as unearned.  This is a
      // useful coaching-level representation, without pretending to replace
      // official scorer's full inning reconstruction.
      earned: overrides.earned ?? true,
    };
  }

  _playerForRunner(runner) {
    return runner ? this._findPlayer(runner.teamKey, runner.playerId) : null;
  }

  _ensureInning(inning = this._state.inning) {
    const index = Math.max(0, inning - 1);
    for (const key of ["away", "home"]) {
      while (this._state.lineScore[key].length <= index) this._state.lineScore[key].push(0);
    }
  }

  _recordPitch({ strike = false, ball = false } = {}) {
    const pitcher = this._pitcher();
    const defense = this._defense();
    pitcher.pitching.P += 1;
    defense.stats.Pitches += 1;
    if (strike) pitcher.pitching.Strikes += 1;
    if (ball) pitcher.pitching.Balls += 1;
  }

  _recordPlateAppearance(batter, { ab = true } = {}) {
    batter.batting.PA += 1;
    if (ab) {
      batter.batting.AB += 1;
      this._offense().stats.AB += 1;
    }
    this._pitcher().pitching.BF += 1;
  }

  _recordOuts(count, { fielder, assist, kind = "out" } = {}) {
    const actual = Math.min(Math.max(0, count), 3 - this._state.outs);
    if (!actual) return 0;
    this._state.outs += actual;
    const pitcher = this._pitcher();
    pitcher.pitching.IPOuts += actual;
    const putout = this._findFielder(fielder, kind === "flyOut" ? "CF" : "1B");
    putout.fielding.PO += actual;
    if (assist) this._findFielder(assist).fielding.A += 1;
    return actual;
  }

  _addRun(runner, { rbiBatter = null, reason = "run", earned } = {}) {
    const teamKey = runner.teamKey;
    const team = this._team(teamKey);
    const player = this._playerForRunner(runner);
    team.stats.R += 1;
    this._state.score[teamKey] += 1;
    this._ensureInning();
    this._state.lineScore[teamKey][this._state.inning - 1] += 1;
    if (player) player.batting.R += 1;
    if (rbiBatter) rbiBatter.batting.RBI += 1;
    const pitcher = this._pitcher();
    pitcher.pitching.R += 1;
    if (earned ?? runner.earned) pitcher.pitching.ER += 1;
    return {
      type: "run",
      reason,
      runner: runnerView(runner),
      rbi: rbiBatter?.name ?? null,
      score: { ...this._state.score },
    };
  }

  _resetCount() {
    this._state.balls = 0;
    this._state.strikes = 0;
  }

  _advanceBatter() {
    const team = this._offense();
    team.battingIndex = (team.battingIndex + 1) % team.lineup.length;
  }

  _basesOccupied() {
    return BASES.filter((base) => this._state.bases[base]);
  }

  _baseCount() {
    return this._basesOccupied().length;
  }

  _clearBases() {
    this._state.bases = { first: null, second: null, third: null };
  }

  _forcedAdvance(batter, { reason, rbi = true, earned = true } = {}) {
    const before = { ...this._state.bases };
    const events = [];
    // Move the forced chain from third backwards. A runner on second is only
    // forced if a runner occupies first; the nested checks encode that rule.
    if (before.first) {
      if (before.second) {
        if (before.third) {
          events.push(this._addRun(before.third, { rbiBatter: rbi ? batter : null, reason, earned }));
        }
        this._state.bases.third = before.second;
        events.push({ type: "advance", runner: runnerView(before.second), from: "second", to: "third", reason });
      }
      this._state.bases.second = before.first;
      events.push({ type: "advance", runner: runnerView(before.first), from: "first", to: "second", reason });
    }
    this._state.bases.first = this._makeRunner(batter, { reachedBy: reason, earned });
    events.push({ type: "advance", runner: playerView(batter), from: "plate", to: "first", reason });
    return events;
  }

  _targetForAdvance(value, fallback) {
    if (value == null) return fallback;
    const token = normaliseToken(value);
    if (["hold", "stay", "same"].includes(token)) return "hold";
    if (["out", "retired"].includes(token)) return "out";
    return normaliseBase(value) ?? fallback;
  }

  _advanceRunners(mapping, { reason, rbiBatter = null, defaultRbi = true } = {}) {
    const before = { ...this._state.bases };
    this._clearBases();
    const events = [];
    const occupied = new Set();

    for (const from of DESCENDING_BASES) {
      const runner = before[from];
      if (!runner) continue;
      let target = this._targetForAdvance(mapping?.[from], from);
      if (target === "hold") target = from;
      if (target === "out") {
        events.push({ type: "runnerOut", runner: runnerView(runner), from, reason });
        continue;
      }
      if (target === "home") {
        events.push(this._addRun(runner, { rbiBatter: defaultRbi ? rbiBatter : null, reason }));
        continue;
      }
      // If an advanced custom mapping causes a collision, retain the lead
      // runner and leave the trailing runner at its original base rather than
      // silently losing a player.
      if (occupied.has(target) || this._state.bases[target]) {
        target = from;
      }
      this._state.bases[target] = runner;
      occupied.add(target);
      events.push({ type: "advance", runner: runnerView(runner), from, to: target, reason });
    }
    return events;
  }

  _advanceAllOneBase({ reason, rbiBatter = null, defaultRbi = false } = {}) {
    return this._advanceRunners(
      { third: "home", second: "third", first: "second" },
      { reason, rbiBatter, defaultRbi },
    );
  }

  _checkWalkoff() {
    const state = this._state;
    if (
      state.half === "bottom"
      && state.inning >= this.options.maxInnings
      && state.score.home > state.score.away
    ) {
      this._declareFinal("walkoff");
      return true;
    }
    return false;
  }

  _mercyRuleReached() {
    const rule = this.options.mercyRule;
    if (!rule) return false;
    const afterInning = Math.max(1, asInteger(rule.afterInning ?? rule.inning, 7));
    const runDiff = Math.max(1, asInteger(rule.runDiff ?? rule.runs, 10));
    return this._state.inning >= afterInning && Math.abs(this._state.score.home - this._state.score.away) >= runDiff;
  }

  _declareFinal(reason) {
    if (this.gameOver) return;
    const { home, away } = this._state.score;
    this._state.phase = "final";
    this._state.final = {
      reason,
      winner: home === away ? null : (home > away ? "home" : "away"),
      score: { ...this._state.score },
      inning: this._state.inning,
      half: this._state.half,
    };
  }

  _endHalfInning() {
    const state = this._state;
    const offenseKey = this._offenseKey();
    const leftOnBase = this._baseCount();
    this._team(offenseKey).stats.LOB += leftOnBase;
    state.inningSummaries.push({
      inning: state.inning,
      half: state.half,
      team: offenseKey,
      runs: state.lineScore[offenseKey][state.inning - 1] ?? 0,
      leftOnBase,
    });
    this._clearBases();
    this._resetCount();
    state.outs = 0;

    if (state.half === "top") {
      if (state.inning >= this.options.maxInnings && state.score.home > state.score.away) {
        this._declareFinal("homeLeadAfterTop");
        return { inningEnded: true, gameOver: true };
      }
      state.half = "bottom";
      return { inningEnded: true, gameOver: false };
    }

    if (this._mercyRuleReached()) {
      this._declareFinal("mercyRule");
      return { inningEnded: true, gameOver: true };
    }
    if (state.inning >= this.options.maxInnings && state.score.home !== state.score.away) {
      this._declareFinal("regulationComplete");
      return { inningEnded: true, gameOver: true };
    }

    state.inning += 1;
    state.half = "top";
    this._ensureInning();
    this._placeGhostRunnerIfNeeded();
    return { inningEnded: true, gameOver: false };
  }

  _placeGhostRunnerIfNeeded() {
    if (!this.options.ghostRunnerFromInning || this._state.inning < this.options.ghostRunnerFromInning) return;
    const team = this._offense();
    const previousIndex = (team.battingIndex - 1 + team.lineup.length) % team.lineup.length;
    const player = team.lineup[previousIndex];
    this._state.bases.second = this._makeRunner(player, { reachedBy: "ghostRunner", earned: false });
  }

  _afterAction({ plateAppearance = false } = {}) {
    if (plateAppearance) {
      this._resetCount();
      this._advanceBatter();
    }
    if (this._checkWalkoff()) return { gameOver: true, inningEnded: false };
    if (this._state.outs >= 3) return this._endHalfInning();
    return { gameOver: this.gameOver, inningEnded: false };
  }

  _eventStart(action) {
    const batter = this._currentBatter();
    return {
      action,
      inning: this._state.inning,
      half: this._state.half,
      team: this._offenseKey(),
      batter: playerView(batter),
      count: { balls: this._state.balls, strikes: this._state.strikes },
      outs: this._state.outs,
    };
  }

  _commitEvent(start, { description, events = [], resolution = null, tactical = null } = {}) {
    this._state.sequence += 1;
    const entry = {
      id: this._state.sequence,
      ...start,
      description,
      events: clone(events),
      resolution: resolution ? clone(resolution) : null,
      tactical: tactical ? clone(tactical) : null,
      scoreAfter: { ...this._state.score },
      inningAfter: this._state.inning,
      halfAfter: this._state.half,
      countAfter: { balls: this._state.balls, strikes: this._state.strikes },
      outsAfter: this._state.outs,
      gameOver: this.gameOver,
    };
    this._state.lastPlay = entry;
    this._state.playLog.push(entry);
    if (this._state.playLog.length > this.options.logLimit) this._state.playLog.shift();
    return {
      ok: true,
      event: clone(entry),
      snapshot: this.snapshot(),
    };
  }

  _reject(action, error) {
    return { ok: false, action, error, snapshot: this.snapshot() };
  }

  _previewTacticalAction(action, options) {
    if (options.trackDecision === false) return null;
    if ([ACTIONS.STEAL, ACTIONS.SAC_BUNT, ACTIONS.INTENTIONAL_WALK, ACTIONS.SAC_FLY].includes(action)) {
      return this.evaluateDecision(action, { source: "action" });
    }
    return null;
  }

  _appendDecision(evaluation, source = "manual", location = {}) {
    this._state.decisionLog.push({
      id: this._state.decisionLog.length + 1,
      inning: location.inning ?? this._state.inning,
      half: location.half ?? this._state.half,
      ...clone(evaluation),
      source,
    });
    return clone(evaluation);
  }

  _resolveWalk({ intentional = false, pitchAlreadyRecorded = false } = {}) {
    const batter = this._currentBatter();
    this._recordPlateAppearance(batter, { ab: false });
    batter.batting.BB += 1;
    this._offense().stats.BB += 1;
    const pitcher = this._pitcher();
    pitcher.pitching.BB += 1;
    if (intentional) {
      batter.batting.IBB += 1;
      pitcher.pitching.IBB += 1;
    }
    const events = this._forcedAdvance(batter, {
      reason: intentional ? "intentionalWalk" : "walk",
      rbi: true,
      earned: true,
    });
    return { batter, events, resolution: this._afterAction({ plateAppearance: true }) };
  }

  _resolveStrikeout({ pitchAlreadyRecorded = false, droppedThirdStrike = false } = {}) {
    const batter = this._currentBatter();
    if (!pitchAlreadyRecorded) this._recordPitch({ strike: true });
    this._recordPlateAppearance(batter, { ab: true });
    batter.batting.SO += 1;
    this._offense().stats.SO += 1;
    const pitcher = this._pitcher();
    pitcher.pitching.SO += 1;
    const canReach = droppedThirdStrike && (this._state.outs === 2 || !this._state.bases.first);
    const events = [];
    if (canReach) {
      events.push(...this._forcedAdvance(batter, { reason: "droppedThirdStrike", rbi: false, earned: true }));
      return {
        batter,
        events,
        description: `${batter.name} 三振振逃上壘`,
        resolution: this._afterAction({ plateAppearance: true }),
      };
    }
    this._recordOuts(1, { fielder: "C", kind: "strikeout" });
    events.push({ type: "out", player: playerView(batter), kind: "strikeout" });
    return {
      batter,
      events,
      description: `${batter.name} 三振出局`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _hitDefaults(kind, options) {
    const defaults = {
      single: { third: "home", second: "third", first: "second" },
      double: { third: "home", second: "home", first: "third" },
      triple: { third: "home", second: "home", first: "home" },
      homeRun: { third: "home", second: "home", first: "home" },
    };
    const mapping = { ...defaults[kind] };
    if (kind === "single" && (options.aggressive || options.scoreFromSecond)) mapping.second = "home";
    return { ...mapping, ...(options.advances ?? options.advancement ?? {}) };
  }

  _resolveHit(kind, options = {}) {
    const batter = this._currentBatter();
    if (options.countPitch !== false) this._recordPitch();
    this._recordPlateAppearance(batter, { ab: true });
    const team = this._offense();
    const pitcher = this._pitcher();
    batter.batting.H += 1;
    team.stats.H += 1;
    pitcher.pitching.H += 1;
    const stat = kind === "single" ? "1B" : kind === "double" ? "2B" : kind === "triple" ? "3B" : "HR";
    const bases = kind === "single" ? 1 : kind === "double" ? 2 : kind === "triple" ? 3 : 4;
    batter.batting[stat] += 1;
    batter.batting.TB += bases;
    if (kind === "homeRun") {
      team.stats.HR += 1;
      pitcher.pitching.HR += 1;
    }

    const events = this._advanceRunners(this._hitDefaults(kind, options), {
      reason: kind,
      rbiBatter: options.rbi === false ? null : batter,
      defaultRbi: options.rbi !== false,
    });
    if (kind === "homeRun") {
      events.push(this._addRun(this._makeRunner(batter, { reachedBy: kind }), {
        rbiBatter: options.rbi === false ? null : batter,
        reason: kind,
      }));
    } else {
      const destination = kind === "single" ? "first" : kind === "double" ? "second" : "third";
      this._state.bases[destination] = this._makeRunner(batter, { reachedBy: kind });
      events.push({ type: "advance", runner: playerView(batter), from: "plate", to: destination, reason: kind });
    }
    return {
      batter,
      events,
      description: `${batter.name} 擊出${kind === "single" ? "一壘安打" : kind === "double" ? "二壘安打" : kind === "triple" ? "三壘安打" : "全壘打"}`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _resolveGroundOut(options = {}) {
    const batter = this._currentBatter();
    if (options.countPitch !== false) this._recordPitch();
    this._recordPlateAppearance(batter, { ab: true });
    batter.batting.GO += 1;
    this._recordOuts(1, { fielder: options.fielder ?? "1B", assist: options.assist ?? "SS", kind: "groundOut" });
    const events = [{ type: "out", player: playerView(batter), kind: "groundOut" }];
    if (options.advances || options.advancement) {
      events.push(...this._advanceRunners(options.advances ?? options.advancement, {
        reason: "groundOut",
        rbiBatter: options.rbi ? batter : null,
        defaultRbi: Boolean(options.rbi),
      }));
    }
    return {
      batter,
      events,
      description: `${batter.name} 滾地球出局`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _resolveDoublePlay(options = {}) {
    if (!this._state.bases.first || this._state.outs >= 2) {
      return this._resolveGroundOut(options);
    }
    const batter = this._currentBatter();
    const runner = this._state.bases.first;
    if (options.countPitch !== false) this._recordPitch();
    this._recordPlateAppearance(batter, { ab: true });
    batter.batting.GO += 1;
    batter.batting.GIDP += 1;
    this._state.bases.first = null;
    this._recordOuts(2, { fielder: options.fielder ?? "1B", assist: options.assist ?? "SS", kind: "doublePlay" });
    const fielder = this._findFielder(options.fielder ?? "1B");
    fielder.fielding.DP += 1;
    this._defense().stats.DP += 1;
    const events = [
      { type: "out", player: runnerView(runner), kind: "forceOut", at: "second" },
      { type: "out", player: playerView(batter), kind: "doublePlay", at: "first" },
    ];
    return {
      batter,
      events,
      description: `${batter.name} 擊出雙殺打`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _resolveTriplePlay(options = {}) {
    if (!this._state.bases.first || !this._state.bases.second || this._state.outs > 0) {
      return this._resolveDoublePlay(options);
    }
    const batter = this._currentBatter();
    const first = this._state.bases.first;
    const second = this._state.bases.second;
    if (options.countPitch !== false) this._recordPitch();
    this._recordPlateAppearance(batter, { ab: true });
    batter.batting.GO += 1;
    batter.batting.GIDP += 1;
    this._state.bases.first = null;
    this._state.bases.second = null;
    this._recordOuts(3, { fielder: options.fielder ?? "1B", assist: options.assist ?? "SS", kind: "triplePlay" });
    const fielder = this._findFielder(options.fielder ?? "1B");
    fielder.fielding.TP += 1;
    this._defense().stats.TP += 1;
    return {
      batter,
      events: [
        { type: "out", player: runnerView(first), kind: "forceOut", at: "second" },
        { type: "out", player: runnerView(second), kind: "forceOut", at: "third" },
        { type: "out", player: playerView(batter), kind: "triplePlay", at: "first" },
      ],
      description: `${batter.name} 擊出三殺打`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _resolveFlyOut(options = {}, isSacFly = false) {
    const batter = this._currentBatter();
    const hasSacrifice = isSacFly && this._state.bases.third && this._state.outs < 2;
    if (options.countPitch !== false) this._recordPitch();
    this._recordPlateAppearance(batter, { ab: !hasSacrifice });
    if (hasSacrifice) batter.batting.SF += 1;
    else batter.batting.FO += 1;
    this._recordOuts(1, { fielder: options.fielder ?? "CF", kind: "flyOut" });
    const events = [{ type: "out", player: playerView(batter), kind: hasSacrifice ? "sacFly" : "flyOut" }];
    if (hasSacrifice) {
      const runner = this._state.bases.third;
      this._state.bases.third = null;
      events.push(this._addRun(runner, { rbiBatter: batter, reason: "sacFly" }));
      if (this._state.bases.second && options.advanceSecond !== false) {
        const second = this._state.bases.second;
        this._state.bases.second = null;
        this._state.bases.third = second;
        events.push({ type: "advance", runner: runnerView(second), from: "second", to: "third", reason: "tagUp" });
      }
    } else if (options.advances || options.advancement) {
      events.push(...this._advanceRunners(options.advances ?? options.advancement, {
        reason: "flyOut",
        rbiBatter: options.rbi ? batter : null,
        defaultRbi: Boolean(options.rbi),
      }));
    }
    return {
      batter,
      events,
      description: hasSacrifice ? `${batter.name} 高飛犧牲打，帶回 1 分` : `${batter.name} 飛球出局`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _resolveSacBunt(options = {}) {
    if (options.result && normaliseAction(options.result) && normaliseAction(options.result) !== ACTIONS.SAC_BUNT) {
      return this._dispatch(normaliseAction(options.result), { ...options, result: undefined, trackDecision: false });
    }
    if (this._state.outs >= 2 || !this._baseCount()) return this._resolveGroundOut(options);
    const batter = this._currentBatter();
    if (options.countPitch !== false) this._recordPitch();
    this._recordPlateAppearance(batter, { ab: false });
    batter.batting.SH += 1;
    this._recordOuts(1, { fielder: options.fielder ?? "1B", assist: options.assist ?? "P", kind: "sacBunt" });
    const events = [{ type: "out", player: playerView(batter), kind: "sacBunt" }];
    events.push(...this._advanceAllOneBase({ reason: "sacBunt", rbiBatter: batter, defaultRbi: true }));
    return {
      batter,
      events,
      description: `${batter.name} 成功犧牲觸擊`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _resolveError(options = {}) {
    const batter = this._currentBatter();
    if (options.countPitch !== false) this._recordPitch();
    this._recordPlateAppearance(batter, { ab: true });
    batter.batting.ROE += 1;
    const fielder = this._findFielder(options.fielder ?? "SS");
    fielder.fielding.E += 1;
    this._defense().stats.E += 1;
    const mapping = {
      third: "home",
      second: "third",
      first: "second",
      ...(options.advances ?? options.advancement ?? {}),
    };
    const events = this._advanceRunners(mapping, {
      reason: "error",
      rbiBatter: options.rbi ? batter : null,
      defaultRbi: Boolean(options.rbi),
    });
    this._state.bases.first = this._makeRunner(batter, { reachedBy: "error", earned: false });
    events.push({ type: "advance", runner: playerView(batter), from: "plate", to: "first", reason: "error" });
    return {
      batter,
      events,
      description: `${fielder.name} 發生失誤，${batter.name} 上壘`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _resolveFieldersChoice(options = {}) {
    const forceFrom = normaliseBase(options.forceFrom) ?? (this._state.bases.first ? "first" : this._state.bases.second ? "second" : null);
    if (!forceFrom) return this._resolveGroundOut(options);
    const batter = this._currentBatter();
    const retired = this._state.bases[forceFrom];
    if (options.countPitch !== false) this._recordPitch();
    this._recordPlateAppearance(batter, { ab: true });
    batter.batting.FC += 1;
    this._state.bases[forceFrom] = null;
    this._recordOuts(1, { fielder: options.fielder ?? "2B", assist: options.assist ?? "SS", kind: "fieldersChoice" });
    const events = [{ type: "out", player: runnerView(retired), kind: "fieldersChoice", at: forceFrom }];
    // A force taken at third/second releases the forced runner, while trailing
    // runners still need room for the batter-runner at first.  Move that chain
    // by default so no runner is overwritten when the batter reaches first.
    const forcedChain = {};
    if (forceFrom === "second" && this._state.bases.first) forcedChain.first = "second";
    if (forceFrom === "third") {
      if (this._state.bases.second) forcedChain.second = "third";
      if (this._state.bases.first) forcedChain.first = "second";
    }
    events.push(...this._advanceRunners({
      ...forcedChain,
      ...(options.advances ?? options.advancement ?? {}),
    }, {
      reason: "fieldersChoice",
      defaultRbi: false,
    }));
    this._state.bases.first = this._makeRunner(batter, { reachedBy: "fieldersChoice" });
    events.push({ type: "advance", runner: playerView(batter), from: "plate", to: "first", reason: "fieldersChoice" });
    return {
      batter,
      events,
      description: `${batter.name} 野手選擇上壘`,
      resolution: this._afterAction({ plateAppearance: true }),
    };
  }

  _resolveSteal(options = {}, isPickoff = false) {
    const candidates = isPickoff ? DESCENDING_BASES : BASES;
    const from = normaliseBase(options.from) ?? candidates.find((base) => this._state.bases[base]);
    if (!from || !this._state.bases[from]) return { invalid: "沒有可執行此戰術的跑者" };
    const runner = this._state.bases[from];
    const target = from === "first" ? "second" : from === "second" ? "third" : "home";
    if (!isPickoff && target !== "home" && this._state.bases[target]) {
      return { invalid: "目標壘包已有跑者，無法直接盜壘" };
    }
    const chance = clamp((runner.speed + 24) / 125, 0.35, 0.91);
    const safe = options.result ? normaliseToken(options.result) !== "out" : this.random() < chance;
    this._state.bases[from] = null;
    const player = this._playerForRunner(runner);
    const events = [];
    if (safe && !isPickoff) {
      if (target === "home") {
        events.push(this._addRun(runner, { reason: "steal", rbiBatter: null }));
      } else {
        this._state.bases[target] = runner;
        events.push({ type: "advance", runner: runnerView(runner), from, to: target, reason: "steal" });
      }
      if (player) player.batting.SB += 1;
      this._offense().stats.SB += 1;
      return {
        events,
        description: `${runner.name} 成功${from === "third" ? "盜本壘" : "盜壘"}`,
        resolution: this._afterAction(),
      };
    }

    if (player) player.batting.CS += isPickoff ? 0 : 1;
    if (!isPickoff) this._offense().stats.CS += 1;
    this._recordOuts(1, { fielder: options.fielder ?? "C", kind: isPickoff ? "pickoff" : "caughtStealing" });
    events.push({ type: "out", player: runnerView(runner), kind: isPickoff ? "pickoff" : "caughtStealing", at: target });
    return {
      events,
      description: isPickoff ? `${runner.name} 遭牽制出局` : `${runner.name} 盜壘失敗，遭觸殺出局`,
      resolution: this._afterAction(),
    };
  }

  _resolveAdvancePitch(kind, options = {}) {
    const batter = this._currentBatter();
    const events = [];
    if (kind === ACTIONS.WILD_PITCH || kind === ACTIONS.PASSED_BALL) {
      if (options.countPitch !== false) {
        this._recordPitch({ ball: options.countAsBall !== false });
        if (options.countAsBall !== false) this._state.balls += 1;
      }
      if (kind === ACTIONS.WILD_PITCH) this._pitcher().pitching.WP += 1;
    } else {
      this._pitcher().pitching.BK += 1;
    }
    events.push(...this._advanceAllOneBase({ reason: kind, defaultRbi: false }));
    let resolution;
    if (this._state.balls >= 4) {
      const walk = this._resolveWalk({ pitchAlreadyRecorded: true });
      events.push(...walk.events);
      resolution = walk.resolution;
    } else {
      resolution = this._afterAction();
    }
    return {
      batter,
      events,
      description: kind === ACTIONS.WILD_PITCH ? "暴投，跑者推進" : kind === ACTIONS.PASSED_BALL ? "捕逸，跑者推進" : "投手犯規，跑者推進",
      resolution,
    };
  }

  _dispatch(action, options = {}) {
    const state = this._state;
    switch (action) {
      case ACTIONS.BALL: {
        this._recordPitch({ ball: true });
        state.balls += 1;
        if (state.balls >= 4) {
          const walk = this._resolveWalk({ pitchAlreadyRecorded: true });
          return { ...walk, description: `${walk.batter.name} 獲得四壞保送` };
        }
        return { description: "壞球", events: [], resolution: this._afterAction() };
      }
      case ACTIONS.CALLED_STRIKE:
      case ACTIONS.SWING_MISS: {
        this._recordPitch({ strike: true });
        state.strikes += 1;
        if (state.strikes >= 3) return this._resolveStrikeout({ pitchAlreadyRecorded: true });
        return {
          description: action === ACTIONS.SWING_MISS ? "揮空，記好球" : "好球",
          events: [],
          resolution: this._afterAction(),
        };
      }
      case ACTIONS.FOUL: {
        this._recordPitch({ strike: true });
        const twoStrikeBunt = options.bunt && state.strikes >= 2;
        if (twoStrikeBunt) return this._resolveStrikeout({ pitchAlreadyRecorded: true });
        if (state.strikes < 2) state.strikes += 1;
        return { description: "界外球", events: [], resolution: this._afterAction() };
      }
      case ACTIONS.WALK: {
        const walk = this._resolveWalk({ intentional: false });
        return { ...walk, description: `${walk.batter.name} 獲得四壞保送` };
      }
      case ACTIONS.INTENTIONAL_WALK: {
        const walk = this._resolveWalk({ intentional: true });
        return { ...walk, description: `${walk.batter.name} 獲得敬遠保送` };
      }
      case ACTIONS.HIT_BY_PITCH: {
        const batter = this._currentBatter();
        if (options.countPitch !== false) this._recordPitch();
        this._recordPlateAppearance(batter, { ab: false });
        batter.batting.HBP += 1;
        this._pitcher().pitching.HBP += 1;
        const events = this._forcedAdvance(batter, { reason: "hitByPitch", rbi: true, earned: true });
        return {
          batter,
          events,
          description: `${batter.name} 觸身球上壘`,
          resolution: this._afterAction({ plateAppearance: true }),
        };
      }
      case ACTIONS.SINGLE:
      case ACTIONS.DOUBLE:
      case ACTIONS.TRIPLE:
      case ACTIONS.HOME_RUN:
        return this._resolveHit(action, options);
      case ACTIONS.STRIKEOUT:
        return this._resolveStrikeout(options);
      case ACTIONS.GROUND_OUT:
        return options.doublePlay ? this._resolveDoublePlay(options) : this._resolveGroundOut(options);
      case ACTIONS.FLY_OUT:
        return this._resolveFlyOut(options, Boolean(options.sacFly));
      case ACTIONS.SAC_FLY:
        return this._resolveFlyOut(options, true);
      case ACTIONS.SAC_BUNT:
        return this._resolveSacBunt(options);
      case ACTIONS.ERROR:
        return this._resolveError(options);
      case ACTIONS.FIELDERS_CHOICE:
        return this._resolveFieldersChoice(options);
      case ACTIONS.DOUBLE_PLAY:
        return this._resolveDoublePlay(options);
      case ACTIONS.TRIPLE_PLAY:
        return this._resolveTriplePlay(options);
      case ACTIONS.STEAL:
        return this._resolveSteal(options, false);
      case ACTIONS.PICKOFF:
        return this._resolveSteal(options, true);
      case ACTIONS.WILD_PITCH:
      case ACTIONS.PASSED_BALL:
      case ACTIONS.BALK:
        return this._resolveAdvancePitch(action, options);
      default:
        return { invalid: `不支援的動作：${action}` };
    }
  }

  /**
   * Applies one explicit baseball result.  `options.advances` may map runner
   * origins to `first`, `second`, `third`, `home`, `hold`, or `out`.
   */
  play(action, options = {}) {
    const canonical = normaliseAction(action);
    if (!canonical) return this._reject(action, "找不到這個比賽動作");
    if (this.gameOver) return this._reject(canonical, "比賽已結束，請重設或建立新比賽");
    const start = this._eventStart(canonical);
    const tactical = this._previewTacticalAction(canonical, options);
    const result = this._dispatch(canonical, options);
    if (result.invalid) return this._reject(canonical, result.invalid);
    if (tactical) this._appendDecision(tactical, "action", start);
    return this._commitEvent(start, { ...result, tactical });
  }

  /** Alias useful for UI integrations that name buttons as actions. */
  playAction(action, options = {}) {
    return this.play(action, options);
  }

  _weightedPick(entries) {
    const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    let point = this.random() * Math.max(total, 1);
    for (const entry of entries) {
      point -= Math.max(0, entry.weight);
      if (point <= 0) return entry.value;
    }
    return entries.at(-1)?.value ?? ACTIONS.BALL;
  }

  _choosePitchOutcome(decision, options = {}) {
    const batter = this._currentBatter();
    const zone = options.zone ?? (this.random() < 0.56);
    const contact = batter.attributes.contact / 100;
    const power = batter.attributes.power / 100;
    const discipline = batter.attributes.discipline / 100;
    const runnerOnFirst = Boolean(this._state.bases.first);
    const canDouble = runnerOnFirst && this._state.outs < 2;
    if (decision === ACTIONS.STEAL || decision === ACTIONS.INTENTIONAL_WALK) return decision;
    if (decision === ACTIONS.SAC_BUNT) {
      return this._weightedPick([
        { value: ACTIONS.SAC_BUNT, weight: 50 + contact * 24 },
        { value: ACTIONS.SINGLE, weight: 8 + contact * 12 },
        { value: ACTIONS.FOUL, weight: 11 },
        { value: ACTIONS.GROUND_OUT, weight: 23 },
      ]);
    }
    if (decision === "take") {
      return this._weightedPick([
        { value: ACTIONS.BALL, weight: zone ? 31 : 63 + discipline * 10 },
        { value: ACTIONS.CALLED_STRIKE, weight: zone ? 61 : 24 },
        { value: ACTIONS.HIT_BY_PITCH, weight: 1 },
      ]);
    }
    if (!zone) {
      const chasePenalty = decision === "power" ? 20 : 10;
      return this._weightedPick([
        { value: ACTIONS.BALL, weight: 46 + discipline * 18 - chasePenalty },
        { value: ACTIONS.FOUL, weight: 12 + contact * 8 },
        { value: ACTIONS.SWING_MISS, weight: 17 + chasePenalty - contact * 6 },
        { value: ACTIONS.GROUND_OUT, weight: 10 },
        { value: ACTIONS.SINGLE, weight: 6 + contact * 5 },
        { value: ACTIONS.ERROR, weight: 2 },
      ]);
    }
    const powerMode = decision === "power";
    return this._weightedPick([
      { value: ACTIONS.SWING_MISS, weight: powerMode ? 17 - contact * 6 : 11 - contact * 5 },
      { value: ACTIONS.FOUL, weight: 17 + contact * 11 },
      { value: ACTIONS.GROUND_OUT, weight: 24 - contact * 6 },
      { value: ACTIONS.FLY_OUT, weight: 18 - contact * 3 },
      { value: ACTIONS.SINGLE, weight: 15 + contact * 10 },
      { value: ACTIONS.DOUBLE, weight: 5 + power * 7 },
      { value: ACTIONS.TRIPLE, weight: 1 + batter.attributes.speed / 70 },
      { value: ACTIONS.HOME_RUN, weight: powerMode ? 3 + power * 8 : 1 + power * 4 },
      { value: ACTIONS.ERROR, weight: 2 },
      ...(canDouble && powerMode ? [{ value: ACTIONS.DOUBLE_PLAY, weight: 4 }] : []),
    ]);
  }

  /**
   * Resolves a user batting choice through the seeded simulation.  Passing
   * `{ result: "single" }` keeps the tactical record but forces a test/demo
   * outcome.  Choices: `take`, `contact`, `power`, `bunt`, `steal`.
   */
  simulatePitch(choice = "contact", options = {}) {
    const decision = normaliseDecision(choice);
    if (!decision) return this._reject(choice, "找不到這個戰術選擇");
    if (this.gameOver) return this._reject(decision, "比賽已結束");
    this.recordDecision(decision, { source: "simulation" });
    const forced = options.result ? normaliseAction(options.result) : null;
    const selected = forced ?? this._choosePitchOutcome(decision, options);
    if (!selected) return this._reject(choice, "無法產生此球結果");
    const playOptions = { ...options, trackDecision: false, simulated: true };
    delete playOptions.result;
    if (decision === ACTIONS.SAC_BUNT && selected === ACTIONS.FOUL) playOptions.bunt = true;
    return this.play(selected, playOptions);
  }

  /** Simulate exactly one plate appearance, preserving every pitch in the log. */
  simulateAtBat(choice = "contact", options = {}) {
    if (this.gameOver) return this._reject("simulateAtBat", "比賽已結束");
    const originalBatter = this._currentBatter().id;
    const results = [];
    const maxPitches = Math.max(1, asInteger(options.maxPitches, 18));
    for (let pitch = 0; pitch < maxPitches && !this.gameOver; pitch += 1) {
      const result = this.simulatePitch(choice, options);
      results.push(result);
      if (!result.ok || this.gameOver || this._currentBatter().id !== originalBatter) break;
      // A steal is a non-PA tactical move; switch back to a hitting strategy.
      if (normaliseDecision(choice) === ACTIONS.STEAL) choice = "contact";
    }
    return { ok: true, results, snapshot: this.snapshot() };
  }

  /** Optional demo/QA helper that plays until final or `maxPitches` is reached. */
  simulateGame(options = {}) {
    const maxPitches = Math.max(10, asInteger(options.maxPitches, 2500));
    const strategy = options.strategy ?? "contact";
    const results = [];
    for (let index = 0; index < maxPitches && !this.gameOver; index += 1) {
      const result = this.simulatePitch(strategy, options);
      results.push(result);
      if (!result.ok) break;
    }
    return {
      ok: this.gameOver,
      exhausted: !this.gameOver && results.length >= maxPitches,
      results,
      snapshot: this.snapshot(),
    };
  }

  _tacticalContext() {
    const offense = this._offense();
    const defense = this._defense();
    const batter = this._currentBatter();
    const lead = this._state.score[this._offenseKey()] - this._state.score[this._defenseKey()];
    const isLate = this._state.inning >= Math.max(7, this.options.maxInnings - 2);
    const runners = BASES.filter((base) => this._state.bases[base]).map((base) => ({
      base,
      ...runnerView(this._state.bases[base]),
    }));
    return {
      inning: this._state.inning,
      half: this._state.half,
      outs: this._state.outs,
      balls: this._state.balls,
      strikes: this._state.strikes,
      scoreDiff: lead,
      isLate,
      isClose: Math.abs(lead) <= 2,
      offense: offense.name,
      defense: defense.name,
      batter: playerView(batter),
      runners,
      basesLoaded: this._baseCount() === 3,
    };
  }

  /** Returns coaching suggestions for the current count, runners, score, and inning. */
  suggestTactics({ perspective = "offense" } = {}) {
    const context = this._tacticalContext();
    const recommendations = [];
    const runnerFirst = this._state.bases.first;
    const runnerSecond = this._state.bases.second;
    const runnerThird = this._state.bases.third;
    const batter = this._currentBatter();

    if (perspective === "defense") {
      if (!this._state.bases.first && runnerSecond && context.isLate && context.isClose && batter.attributes.power >= 72) {
        recommendations.push({ action: ACTIONS.INTENTIONAL_WALK, score: 88, label: "敬遠", reason: "一壘空著且強打者上場，可建立雙殺守備機會。" });
      }
      recommendations.push({ action: "attackZone", score: 62, label: "攻擊好球帶", reason: "以好球數壓縮打者選球空間。" });
    } else {
      if (context.balls === 3) {
        recommendations.push({ action: "take", score: 94, label: "耐心選球", reason: "三壞球時不要主動擴大好球帶。" });
      }
      if (context.strikes === 2) {
        recommendations.push({ action: "contact", score: 82, label: "兩好球保護", reason: "縮短揮棒，優先把球放進場內。" });
      }
      if (runnerThird && context.outs < 2) {
        recommendations.push({ action: "contact", score: 86, label: "推進跑者", reason: "三壘有人、兩出局前，優先製造可得分的球。" });
        if (context.outs === 0) recommendations.push({ action: ACTIONS.SAC_FLY, score: 68, label: "高飛犧牲打", reason: "外野深遠飛球可換取關鍵分數。" });
      }
      if ((runnerFirst || runnerSecond) && context.outs === 0 && context.isLate && context.isClose && context.scoreDiff >= -1) {
        recommendations.push({ action: ACTIONS.SAC_BUNT, score: 78, label: "犧牲觸擊", reason: "低出局數的膠著後段，可先換取得點圈跑者。" });
      }
      if (runnerFirst && !runnerSecond && context.outs < 2 && runnerFirst.speed >= 62 && context.strikes < 2) {
        recommendations.push({ action: ACTIONS.STEAL, score: 74 + Math.round((runnerFirst.speed - 62) / 4), label: "盜壘", reason: "速度與壘包空間有利，可主動製造得點圈壓力。" });
      }
      if (context.basesLoaded || (context.balls >= 2 && context.strikes === 0)) {
        recommendations.push({ action: "take", score: 80, label: "控制好球帶", reason: "投手壓力較大，等待可攻擊的失投球。" });
      }
      recommendations.push({
        action: batter.attributes.power >= 72 && context.strikes < 2 ? "power" : "contact",
        score: batter.attributes.power >= 72 && context.strikes < 2 ? 70 : 66,
        label: batter.attributes.power >= 72 && context.strikes < 2 ? "積極長打" : "扎實擊球",
        reason: "依打者能力與目前球數選擇可控的進攻方式。",
      });
    }
    recommendations.sort((a, b) => b.score - a.score);
    return { context, recommendations, best: recommendations[0] ?? null };
  }

  /** Scores a tactical decision without changing the ballgame. */
  evaluateDecision(decision, options = {}) {
    const action = normaliseDecision(decision) ?? normaliseAction(decision) ?? String(decision);
    const suggestion = this.suggestTactics(options);
    const matching = suggestion.recommendations.find((item) => item.action === action);
    let score = matching?.score ?? 54;
    const { balls, strikes, basesLoaded } = suggestion.context;
    if (action === "power" && strikes >= 2) score = Math.min(score, 38);
    if (action === "contact" && balls === 3) score = Math.min(score, 48);
    if (action === "take" && strikes >= 2) score = Math.min(score, 58);
    if (action === ACTIONS.STEAL && !this._state.bases.first && !this._state.bases.second) score = 5;
    if (action === ACTIONS.SAC_BUNT && (this._state.outs >= 2 || !this._baseCount())) score = 18;
    if (action === ACTIONS.INTENTIONAL_WALK && !options.defense && !basesLoaded) score = Math.min(score, 42);
    score = clamp(Math.round(score), 0, 100);
    return {
      action,
      score,
      grade: score >= 80 ? "excellent" : score >= 62 ? "sound" : score >= 42 ? "risky" : "poor",
      recommended: suggestion.best?.action ?? null,
      reason: matching?.reason ?? "此選擇沒有明顯的情境優勢，請留意球數、出局數與壘包配置。",
      context: suggestion.context,
    };
  }

  /** Records a decision for the end-of-game coaching grade. */
  recordDecision(decision, options = {}) {
    const evaluation = this.evaluateDecision(decision, options);
    return this._appendDecision(evaluation, options.source ?? "manual");
  }

  /** Current or final training rank, calculated from tactical choices and result. */
  getRank() {
    const decisions = this._state.decisionLog;
    const averageDecision = decisions.length
      ? decisions.reduce((sum, item) => sum + item.score, 0) / decisions.length
      : 55;
    const learnerKey = this.options.learnerTeam;
    const learnerScore = this._state.score[learnerKey];
    const opponentScore = this._state.score[learnerKey === "away" ? "home" : "away"];
    const hitBonus = this._team(learnerKey).stats.H * 1.5;
    const discipline = Math.max(0, this._team(learnerKey).stats.BB - this._team(learnerKey).stats.SO * 0.35) * 2;
    let score = 27 + averageDecision * 0.48 + hitBonus + discipline;
    if (this.gameOver) {
      if (learnerScore > opponentScore) score += 16;
      else if (learnerScore === opponentScore) score += 8;
      else score += 2;
    }
    score = clamp(Math.round(score), 0, 100);
    const tiers = [
      { min: 92, rank: "S", label: "傳奇戰術總教練", color: "#fbbf24" },
      { min: 82, rank: "A", label: "菁英戰術教練", color: "#a78bfa" },
      { min: 70, rank: "B", label: "穩健戰術教練", color: "#38bdf8" },
      { min: 56, rank: "C", label: "成長型教練", color: "#34d399" },
      { min: 0, rank: "D", label: "戰術實習生", color: "#fb7185" },
    ];
    const tier = tiers.find((item) => score >= item.min) ?? tiers.at(-1);
    const next = tiers[tiers.indexOf(tier) - 1] ?? null;
    return {
      score,
      rank: tier.rank,
      label: tier.label,
      color: tier.color,
      nextRank: next ? { rank: next.rank, scoreNeeded: Math.max(0, next.min - score) } : null,
      decisionAverage: Math.round(averageDecision),
      decisions: decisions.length,
      result: this.gameOver ? clone(this._state.final) : null,
      summary: this.gameOver
        ? `賽後評級：${tier.rank}｜${tier.label}`
        : `目前戰術評級：${tier.rank}｜完成比賽可取得最終評級`,
    };
  }

  getWinProbability() {
    const offenseKey = this._offenseKey();
    const scoreDiff = this._state.score[offenseKey] - this._state.score[this._defenseKey()];
    const inningFactor = clamp((this._state.inning - 1) / Math.max(1, this.options.maxInnings - 1), 0, 1);
    const runnerFactor = this._baseCount() * 0.035;
    const outPenalty = this._state.outs * 0.045;
    const probability = clamp(0.5 + scoreDiff * (0.075 + inningFactor * 0.065) + runnerFactor - outPenalty, 0.03, 0.97);
    return Math.round(probability * 100);
  }

  getLineScore() {
    const { away, home } = this._state.teams;
    return {
      innings: Math.max(this._state.lineScore.away.length, this._state.lineScore.home.length),
      away: [...this._state.lineScore.away],
      home: [...this._state.lineScore.home],
      totals: {
        away: { R: away.stats.R, H: away.stats.H, E: away.stats.E, LOB: away.stats.LOB },
        home: { R: home.stats.R, H: home.stats.H, E: home.stats.E, LOB: home.stats.LOB },
      },
    };
  }

  /** Compact box score payload for a results panel or downloadable report. */
  getBoxScore() {
    const teams = {};
    for (const key of ["away", "home"]) {
      const team = this._team(key);
      teams[key] = {
        name: team.name,
        shortName: team.shortName,
        totals: { R: team.stats.R, H: team.stats.H, E: team.stats.E, LOB: team.stats.LOB },
        batting: team.lineup.map((player) => ({
          name: player.name,
          number: player.number,
          position: player.position,
          ...withBattingRates(player.batting),
        })),
        pitching: team.lineup
          .filter((player) => player.pitching.P > 0 || player.id === team.pitcherId)
          .map((player) => ({ name: player.name, ...withPitchingRates(player.pitching) })),
        fielding: team.lineup.map((player) => ({ name: player.name, ...clone(player.fielding) })),
      };
    }
    return {
      final: clone(this._state.final),
      lineScore: this.getLineScore(),
      teams,
      rank: this.getRank(),
    };
  }

  getPlayLog(limit = 40) {
    return clone(this._state.playLog.slice(-Math.max(1, limit)));
  }

  validateState() {
    const errors = [];
    const runnerIds = [];
    for (const base of BASES) {
      const runner = this._state.bases[base];
      if (runner) runnerIds.push(runner.playerId);
    }
    if (new Set(runnerIds).size !== runnerIds.length) errors.push("同一位跑者不能同時站在兩個壘包。");
    if (this._state.balls < 0 || this._state.balls > 3) errors.push("壞球數必須介於 0 到 3。");
    if (this._state.strikes < 0 || this._state.strikes > 2) errors.push("好球數必須介於 0 到 2。");
    if (this._state.outs < 0 || this._state.outs > 2) errors.push("出局數必須介於 0 到 2。 ");
    for (const key of ["away", "home"]) {
      const scored = this._state.lineScore[key].reduce((sum, value) => sum + value, 0);
      if (scored !== this._state.score[key]) errors.push(`${key} 的逐局得分與總分不一致。`);
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Deliberately explicit debug/training setup.  It accepts only a narrow
   * structure, so UI code cannot accidentally mutate the engine's internals.
   * Example: `game.debugSetSituation({ inning: 9, half: "bottom", outs: 1,
   * score: { away: 3, home: 2 }, runners: { first: 0, third: 4 } })`.
   */
  debugSetSituation(situation = {}) {
    if (Object.hasOwn(situation, "inning")) this._state.inning = Math.max(1, asInteger(situation.inning, 1));
    if (situation.half === "top" || situation.half === "bottom") this._state.half = situation.half;
    if (Object.hasOwn(situation, "balls")) this._state.balls = clamp(asInteger(situation.balls), 0, 3);
    if (Object.hasOwn(situation, "strikes")) this._state.strikes = clamp(asInteger(situation.strikes), 0, 2);
    if (Object.hasOwn(situation, "outs")) this._state.outs = clamp(asInteger(situation.outs), 0, 2);
    if (situation.score) {
      for (const key of ["away", "home"]) {
        if (Object.hasOwn(situation.score, key)) {
          const value = Math.max(0, asInteger(situation.score[key]));
          this._state.score[key] = value;
          this._state.teams[key].stats.R = value;
        }
      }
    }
    this._ensureInning();
    if (situation.lineScore) {
      for (const key of ["away", "home"]) {
        if (Array.isArray(situation.lineScore[key])) {
          this._state.lineScore[key] = situation.lineScore[key].map((value) => Math.max(0, asInteger(value)));
          this._state.score[key] = this._state.lineScore[key].reduce((sum, value) => sum + value, 0);
          this._state.teams[key].stats.R = this._state.score[key];
        }
      }
    } else {
      // Keep the line score invariant while allowing a convenient score-only setup.
      for (const key of ["away", "home"]) {
        this._state.lineScore[key] = Array.from({ length: this._state.inning }, () => 0);
        this._state.lineScore[key][this._state.inning - 1] = this._state.score[key];
      }
    }
    if (situation.battingIndex != null) {
      const team = this._offense();
      team.battingIndex = ((asInteger(situation.battingIndex) % team.lineup.length) + team.lineup.length) % team.lineup.length;
    }
    if (situation.runners) {
      this._clearBases();
      const team = this._offense();
      for (const base of BASES) {
        const reference = situation.runners[base];
        if (reference == null) continue;
        const player = typeof reference === "number"
          ? team.lineup[clamp(reference, 0, team.lineup.length - 1)]
          : team.lineup.find((candidate) => candidate.id === reference || candidate.name === reference);
        if (player) this._state.bases[base] = this._makeRunner(player, { reachedBy: "debug" });
      }
    }
    // A live plate appearance cannot have the current batter already standing
    // on base.  Make debug scenarios obey that invariant automatically.
    const runnerIds = new Set(BASES.map((base) => this._state.bases[base]?.playerId).filter(Boolean));
    const offense = this._offense();
    if (runnerIds.has(this._currentBatter().id)) {
      const available = offense.lineup.findIndex((player) => !runnerIds.has(player.id));
      if (available >= 0) offense.battingIndex = available;
    }
    this._state.phase = "live";
    this._state.final = null;
    return this.snapshot();
  }

  snapshot() {
    const state = this._state;
    const teams = {};
    for (const key of ["away", "home"]) {
      const team = state.teams[key];
      teams[key] = {
        id: team.id,
        key,
        name: team.name,
        shortName: team.shortName,
        color: team.color,
        battingIndex: team.battingIndex,
        stats: clone(team.stats),
        totals: { R: team.stats.R, H: team.stats.H, E: team.stats.E, LOB: team.stats.LOB },
        pitcher: playerView(team.lineup.find((player) => player.id === team.pitcherId)),
        lineup: team.lineup.map(playerView),
      };
    }
    const batter = this._currentBatter();
    const pitcher = this._pitcher();
    return {
      version: state.version,
      seed: state.seed,
      phase: state.phase,
      gameOver: this.gameOver,
      final: clone(state.final),
      inning: state.inning,
      half: state.half,
      halfLabel: state.half === "top" ? "上半" : "下半",
      count: { balls: state.balls, strikes: state.strikes, outs: state.outs },
      balls: state.balls,
      strikes: state.strikes,
      outs: state.outs,
      learnerTeam: this.options.learnerTeam,
      battingTeam: this._offenseKey(),
      fieldingTeam: this._defenseKey(),
      batter: playerView(batter),
      pitcher: playerView(pitcher),
      bases: {
        first: runnerView(state.bases.first),
        second: runnerView(state.bases.second),
        third: runnerView(state.bases.third),
      },
      score: { ...state.score },
      lineScore: this.getLineScore(),
      teams,
      winProbability: this.getWinProbability(),
      rank: this.getRank(),
      lastPlay: clone(state.lastPlay),
      playCount: state.playLog.length,
      decisionCount: state.decisionLog.length,
    };
  }
}

/**
 * Small dependency-free sanity suite for terminal or browser-console checks.
 * It throws only when `throwOnError` is true; otherwise it returns diagnostics.
 */
export function runEngineSelfTest({ throwOnError = true } = {}) {
  const checks = [];
  const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });

  const walkGame = new BaseballGame({ maxInnings: 1, seed: 7 });
  walkGame.play(ACTIONS.WALK);
  walkGame.play(ACTIONS.WALK);
  walkGame.play(ACTIONS.WALK);
  walkGame.play(ACTIONS.WALK);
  check("bases-loaded walk scores exactly once", walkGame.snapshot().score.away === 1 && walkGame.snapshot().bases.first && walkGame.snapshot().bases.second && walkGame.snapshot().bases.third);

  const strikeoutGame = new BaseballGame({ maxInnings: 1, seed: 9 });
  strikeoutGame.play(ACTIONS.CALLED_STRIKE);
  strikeoutGame.play(ACTIONS.SWING_MISS);
  strikeoutGame.play(ACTIONS.FOUL);
  strikeoutGame.play(ACTIONS.SWING_MISS);
  check("third strike records an out", strikeoutGame.snapshot().outs === 1 && strikeoutGame.snapshot().batter.batting.PA === 0);

  const doublePlayGame = new BaseballGame({ maxInnings: 1, seed: 11 });
  doublePlayGame.play(ACTIONS.SINGLE);
  doublePlayGame.play(ACTIONS.DOUBLE_PLAY);
  check("double play clears first runner and records two outs", doublePlayGame.snapshot().outs === 2 && !doublePlayGame.snapshot().bases.first);

  const sacFlyGame = new BaseballGame({ maxInnings: 1, seed: 13 });
  sacFlyGame.play(ACTIONS.SINGLE);
  sacFlyGame.play(ACTIONS.DOUBLE, { advances: { first: "third" } });
  sacFlyGame.play(ACTIONS.SAC_FLY);
  check("sac fly scores runner from third", sacFlyGame.snapshot().score.away === 1 && sacFlyGame.snapshot().outs === 1);

  const replayA = new BaseballGame({ seed: "replay" });
  const replayB = new BaseballGame({ seed: "replay" });
  const sequenceA = Array.from({ length: 8 }, () => replayA.simulatePitch("contact").event?.action);
  const sequenceB = Array.from({ length: 8 }, () => replayB.simulatePitch("contact").event?.action);
  check("seeded simulation is deterministic", JSON.stringify(sequenceA) === JSON.stringify(sequenceB));
  check("state invariants hold", walkGame.validateState().valid && doublePlayGame.validateState().valid && sacFlyGame.validateState().valid);

  const passed = checks.every((entry) => entry.pass);
  const result = { passed, checks };
  if (!passed && throwOnError) {
    throw new Error(`BaseballGame self-test failed: ${checks.filter((entry) => !entry.pass).map((entry) => entry.name).join(", ")}`);
  }
  return result;
}

