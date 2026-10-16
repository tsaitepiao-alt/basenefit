/**
 * A lightweight, dependency-free-at-load-time Three.js baseball field.
 *
 * The shipped app injects a locally vendored Three.js module, so the game has no
 * CDN dependency when it is placed in an iframe or opened from its dist folder.
 * The relative fallback below keeps direct consumers self-contained too.  When
 * WebGL is disabled, BaseballScene renders a small DOM field instead of throwing
 * during module evaluation.
 *
 * Typical use from app.js:
 *
 *   import { BaseballScene } from './scene.js';
 *   const scene = new BaseballScene(document.querySelector('#field-3d'));
 *   await scene.init();
 *   scene.renderState({ balls: 2, strikes: 1, outs: 1, bases: { first: true } });
 *   await scene.animatePitch({ type: 'slider', outcome: 'strike' });
 *   await scene.animateOutcome({ outcome: 'single', runnerMoves: [{ from: 'home', to: 'first' }] });
 */

const THREE_URLS = [
  new URL('./vendor/three.module.min.js', import.meta.url).href,
];

const BASE_KEYS = ['first', 'second', 'third'];

const DEFAULT_STATE = Object.freeze({
  inning: 1,
  half: 'top',
  balls: 0,
  strikes: 0,
  outs: 0,
  bases: Object.freeze({ first: false, second: false, third: false }),
  score: Object.freeze({ away: 0, home: 0 }),
  teams: Object.freeze({ away: 'VISITORS', home: 'HOME' }),
  batter: 'BATTER',
  pitcher: 'PITCHER',
  message: '',
});

const OUTCOME_COPY = Object.freeze({
  ball: 'BALL',
  calledstrike: 'CALLED STRIKE',
  swingmiss: 'SWING AND MISS',
  foul: 'FOUL BALL',
  single: 'SINGLE',
  double: 'DOUBLE',
  triple: 'TRIPLE',
  homerun: 'HOME RUN',
  home_run: 'HOME RUN',
  grand_slam: 'GRAND SLAM',
  flyout: 'FLY OUT',
  groundout: 'GROUND OUT',
  forceout: 'FORCE OUT',
  doubleplay: 'DOUBLE PLAY',
  double_play: 'DOUBLE PLAY',
  tripleplay: 'TRIPLE PLAY',
  triple_play: 'TRIPLE PLAY',
  strikeout: 'STRIKEOUT',
  walk: 'WALK',
  intentionalwalk: 'INTENTIONAL WALK',
  hitbypitch: 'HIT BY PITCH',
  steal: 'STOLEN BASE',
  caughtstealing: 'CAUGHT STEALING',
  error: 'ERROR',
  sacrifice: 'SACRIFICE',
  sacfly: 'SACRIFICE FLY',
  sacrificefly: 'SACRIFICE FLY',
  sacbunt: 'SACRIFICE BUNT',
  sacrificebunt: 'SACRIFICE BUNT',
  fielderschoice: "FIELDER'S CHOICE",
  wildpitch: 'WILD PITCH',
  passedball: 'PASSED BALL',
  pickoff: 'PICKOFF',
  balk: 'BALK',
  bunt: 'BUNT',
});

const OUTCOME_TARGETS = Object.freeze({
  // The camera sits behind home plate, so world -x appears on screen right.
  // Keep automated ball destinations in the same mirrored space as defenders.
  single: [-7.2, 0.45, 18.5],
  double: [10.5, 0.55, 23.5],
  triple: [-11.5, 0.6, 26.5],
  homerun: [0, 7.2, 37],
  home_run: [0, 7.2, 37],
  grand_slam: [0, 8, 38],
  flyout: [2.5, 1.7, 19.5],
  groundout: [-2.4, 0.45, 8.7],
  forceout: [-4.9, 0.5, 7.2],
  doubleplay: [2.8, 0.55, 10.4],
  double_play: [2.8, 0.55, 10.4],
  tripleplay: [-0.3, 0.55, 9.2],
  triple_play: [-0.3, 0.55, 9.2],
  sacfly: [2.7, 1.7, 19.8],
  sacrificefly: [2.7, 1.7, 19.8],
  sacbunt: [-1.1, 0.32, 4.8],
  sacrificebunt: [-1.1, 0.32, 4.8],
  fielderschoice: [-2.2, 0.45, 8.7],
  bunt: [-1.1, 0.32, 4.8],
  error: [4.5, 0.55, 12.7],
});

const TEAM_COLORS = Object.freeze({
  home: 0x38c9ff,
  away: 0xff5e72,
  neutral: 0xf7f7f7,
  runner: 0xffd76a,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).slice(0, 28);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function displayName(value, fallback = '') {
  if (isObject(value)) return text(value.shortName ?? value.name ?? value.label ?? value.id, fallback);
  return text(value, fallback);
}

function resolveElement(elementOrSelector) {
  if (typeof document === 'undefined') return null;
  if (typeof elementOrSelector === 'string') return document.querySelector(elementOrSelector);
  return elementOrSelector && elementOrSelector.nodeType === 1 ? elementOrSelector : null;
}

function easeInOut(value) {
  return value < 0.5
    ? 2 * value * value
    : 1 - ((-2 * value + 2) ** 2) / 2;
}

function normalizeBaseKey(value) {
  const raw = String(value || '').toLowerCase().replace(/[\s_\-]/g, '');
  if (raw === '1' || raw === '1b' || raw === 'first' || raw === 'firstbase') return 'first';
  if (raw === '2' || raw === '2b' || raw === 'second' || raw === 'secondbase') return 'second';
  if (raw === '3' || raw === '3b' || raw === 'third' || raw === 'thirdbase') return 'third';
  if (raw === 'home' || raw === 'plate' || raw === 'homeplate') return 'home';
  return null;
}

function normalizeBases(value, runners) {
  const bases = { first: false, second: false, third: false };

  if (Array.isArray(value)) {
    BASE_KEYS.forEach((base, index) => {
      bases[base] = Boolean(value[index]);
    });
  } else if (isObject(value)) {
    BASE_KEYS.forEach((base, index) => {
      const numericKey = String(index + 1);
      bases[base] = Boolean(value[base] ?? value[`${index + 1}b`] ?? value[numericKey]);
    });
  }

  if (Array.isArray(runners)) {
    runners.forEach((runner) => {
      const base = normalizeBaseKey(runner?.base ?? runner?.onBase ?? runner?.at);
      if (base && base !== 'home') bases[base] = true;
    });
  } else if (isObject(runners)) {
    BASE_KEYS.forEach((base) => {
      if (runners[base]) bases[base] = true;
    });
  }

  return bases;
}

function normalizeScore(state) {
  const source = state.score ?? state.scores ?? {};
  const explicitAway = state.awayScore ?? state.visitorScore;
  const explicitHome = state.homeScore;
  return {
    away: Math.max(0, Math.floor(number(explicitAway ?? source.away, 0))),
    home: Math.max(0, Math.floor(number(explicitHome ?? source.home, 0))),
  };
}

function normalizeTeams(state) {
  const source = state.teams ?? {};
  const explicitAway = state.awayTeam ?? state.visitorTeam;
  const explicitHome = state.homeTeam;
  return {
    away: displayName(explicitAway ?? source.away, 'VISITORS').toUpperCase(),
    home: displayName(explicitHome ?? source.home, 'HOME').toUpperCase(),
  };
}

function normalizeOutcome(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]/g, '_');
}

function webglAvailable() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext
      && (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

async function loadThree(options) {
  if (options?.THREE?.WebGLRenderer) return options.THREE;
  if (globalThis.THREE?.WebGLRenderer) return globalThis.THREE;

  const urls = options?.threeUrl
    ? [options.threeUrl]
    : Array.isArray(options?.threeUrls) && options.threeUrls.length
      ? options.threeUrls
      : THREE_URLS;

  let finalError;
  for (const url of urls) {
    try {
      // A dynamic import preserves a usable module when an offline browser cannot fetch Three.js.
      // eslint-disable-next-line no-await-in-loop
      const module = await import(/* @vite-ignore */ url);
      if (module?.WebGLRenderer) return module;
      finalError = new Error(`The module from ${url} did not expose WebGLRenderer.`);
    } catch (error) {
      finalError = error;
    }
  }

  throw finalError || new Error('Unable to load Three.js.');
}

/**
 * Render a perspective 3D baseball diamond and game-state driven play animations.
 */
export class BaseballScene {
  constructor(elementOrSelector, options = {}) {
    this.container = resolveElement(elementOrSelector);
    this.options = {
      clearColor: 0x06142a,
      interactive: true,
      maxPixelRatio: 2,
      autoRotate: true,
      ...options,
    };

    this.mode = 'pending';
    this.ready = false;
    this.disposed = false;
    this.state = {
      ...DEFAULT_STATE,
      bases: { ...DEFAULT_STATE.bases },
      score: { ...DEFAULT_STATE.score },
      teams: { ...DEFAULT_STATE.teams },
    };

    this.animations = new Set();
    this.listeners = [];
    this.runnerGhosts = new Set();
    this._lastTick = 0;
    this._elapsed = 0;
    this._messageUntil = 0;
    this._cameraOrbit = {
      azimuth: 2.58,
      elevation: 0.46,
      distance: 44,
      dragging: false,
      pointerX: 0,
      pointerY: 0,
    };
  }

  /**
   * Initializes Three.js. Resolves to the instance in either 3D or fallback mode.
   */
  async init() {
    if (this.disposed) return this;
    if (this.ready || this.mode === 'fallback') return this;

    if (!this.container || typeof document === 'undefined') {
      this.mode = 'unavailable';
      return this;
    }

    if (!webglAvailable()) {
      this._createFallback('此瀏覽器未啟用 WebGL，已使用戰術示意球場。');
      return this;
    }

    try {
      this.THREE = await loadThree(this.options);
      if (this.disposed) return this;
      this._buildThreeScene();
      this.mode = 'three';
      this.ready = true;
      this.renderState(this.state);
      this._startRenderLoop();
    } catch (error) {
      this.error = error;
      this._createFallback('3D 球場暫時無法載入，已切換為戰術示意球場。');
    }

    return this;
  }

  /**
   * Updates bases, B/S/O, inning, score, team names, and the 3D scoreboard.
   * This is safe to call before init(); the state will be rendered after init().
   */
  renderState(nextState = {}) {
    if (this.disposed || !isObject(nextState)) return this;

    const incomingScore = nextState.score ?? nextState.scores;
    const incomingTeams = nextState.teams;
    const incomingBases = nextState.bases ?? nextState.onBases;
    const merged = {
      ...this.state,
      ...nextState,
      score: {
        ...this.state.score,
        ...(isObject(incomingScore) ? incomingScore : {}),
      },
      teams: {
        ...this.state.teams,
        ...(isObject(incomingTeams) ? incomingTeams : {}),
      },
      bases: incomingBases === undefined
        ? { ...this.state.bases }
        : normalizeBases(incomingBases, nextState.runners),
    };

    // A callers' runner list is also a valid source of occupancy even if the
    // caller has omitted `bases` (a convenient shape for simulation engines).
    if (incomingBases === undefined && nextState.runners) {
      merged.bases = normalizeBases(this.state.bases, nextState.runners);
    }

    merged.score = normalizeScore(merged);
    merged.teams = normalizeTeams(merged);
    merged.balls = clamp(Math.floor(number(merged.balls, 0)), 0, 3);
    merged.strikes = clamp(Math.floor(number(merged.strikes, 0)), 0, 2);
    merged.outs = clamp(Math.floor(number(merged.outs, 0)), 0, 2);
    merged.inning = Math.max(1, Math.floor(number(merged.inning, 1)));
    merged.half = String(merged.half ?? 'top').toLowerCase() === 'bottom' ? 'bottom' : 'top';
    this.state = merged;

    if (this.mode === 'fallback') {
      this._renderFallbackState();
      return this;
    }
    if (!this.ready) return this;

    this._updateScoreboard();
    this._updateRunners();
    this._updatePlayerLabels();
    this._applyFieldingState(nextState);

    if (nextState.message) this.showMessage(nextState.message, nextState.messageColor);
    if (nextState.ballPosition) this._setBallPosition(nextState.ballPosition);
    return this;
  }

  /**
   * Animates a pitch from the mound to home plate.  Resolves rather than rejects
   * when an animation is cancelled, which makes button handlers easy to compose.
   */
  animatePitch(data = {}) {
    if (this.disposed) return Promise.resolve({ cancelled: true, reason: 'disposed' });
    if (this.mode === 'fallback') {
      this._fallbackMessage(`投球：${text(data.type ?? data.pitchType, 'PITCH').toUpperCase()}`);
      return Promise.resolve({ fallback: true });
    }
    if (!this.ready) return Promise.resolve({ cancelled: true, reason: 'not-ready' });

    if (data.cancelExisting !== false) this._cancelAnimations('superseded', 'pitch');

    const T = this.THREE;
    const start = this._pitcherHand.clone();
    const target = this._toVector3(
      data.target ?? data.location ?? {
        x: number(data.x, 0),
        y: number(data.y, 1.12),
        z: number(data.z, -0.05),
      },
      new T.Vector3(0, 1.12, -0.05),
    );
    const breakX = number(data.breakX ?? data.break ?? data.horizontalBreak, 0);
    const breakY = number(data.breakY ?? data.verticalBreak, 0);
    const control = start.clone().lerp(target, 0.48);
    control.x += breakX * 0.42;
    control.y += 1.1 + breakY * 0.18;
    control.z += number(data.releaseExtension, 0);
    const duration = clamp(number(data.duration, 720), 260, 2200);
    const pitchName = text(data.type ?? data.pitchType, 'PITCH').toUpperCase();

    this.ball.visible = true;
    this._clearBallTrail();
    this.showMessage(pitchName, 0x91dcff, Math.min(duration + 360, 1180));

    const result = this._addAnimation({
      channel: 'pitch',
      duration,
      onUpdate: (progress) => {
        const curveProgress = easeInOut(progress);
        const point = this._quadraticBezier(start, control, target, curveProgress);
        this.ball.position.copy(point);
        this.ball.rotation.x += 0.38;
        this.ball.rotation.z += 0.52;
        this._appendBallTrail(point);

        this._animatePitcherDelivery(progress);
      },
      onComplete: () => {
        this._resetPitcherPose();
        this.ball.position.copy(target);
        if (data.afterState) this.renderState(data.afterState);
      },
      onCancel: () => {
        this._resetPitcherPose();
      },
    });

    return result;
  }

  /**
   * Animates batted balls, outs, walks, steals, and supplied runner moves.
   * `runnerMoves` is an array such as [{ from: 'first', to: 'third' }].
   */
  animateOutcome(data = {}) {
    if (this.disposed) return Promise.resolve({ cancelled: true, reason: 'disposed' });
    const outcome = normalizeOutcome(data.outcome ?? data.type ?? data.result);
    const label = text(data.label, OUTCOME_COPY[outcome] || (outcome ? outcome.replace(/_/g, ' ').toUpperCase() : 'PLAY'));

    if (this.mode === 'fallback') {
      this._fallbackMessage(label);
      if (data.afterState) this.renderState(data.afterState);
      return Promise.resolve({ fallback: true, outcome });
    }
    if (!this.ready) return Promise.resolve({ cancelled: true, reason: 'not-ready' });

    const color = this._outcomeColor(outcome);
    this.showMessage(label, color, number(data.messageDuration, 1500));
    const tasks = [];
    const hasBattedBall = data.battedBall !== false && Boolean(OUTCOME_TARGETS[outcome] || data.landing || data.target);

    if (hasBattedBall) tasks.push(this._animateBattedBall(outcome, data));
    const moves = Array.isArray(data.runnerMoves)
      ? data.runnerMoves
      : Array.isArray(data.runners)
        ? data.runners
        : [];
    if (moves.length) tasks.push(this.animateRunnerMoves(moves, data.runnerDuration ?? data.duration));

    if (!tasks.length) {
      const duration = clamp(number(data.duration, 620), 260, 1800);
      tasks.push(this._addAnimation({ channel: 'outcome', duration }));
    }

    return Promise.all(tasks).then((results) => {
      if (data.afterState) this.renderState(data.afterState);
      return { outcome, results };
    });
  }

  /**
   * Moves temporary runner figures along the base paths. It does not infer game
   * rules: the game engine remains the source of truth for final occupancy.
   */
  animateRunnerMoves(moves = [], duration) {
    if (this.disposed || !Array.isArray(moves)) return Promise.resolve([]);
    if (this.mode === 'fallback') return Promise.resolve([]);
    if (!this.ready) return Promise.resolve([]);

    const validMoves = moves
      .map((move) => {
        const from = normalizeBaseKey(move?.from ?? move?.start ?? move?.origin);
        const to = normalizeBaseKey(move?.to ?? move?.end ?? move?.destination);
        return from && to ? { ...move, from, to } : null;
      })
      .filter(Boolean);

    if (!validMoves.length) return Promise.resolve([]);
    const T = this.THREE;
    const playDuration = clamp(number(duration, 1080), 360, 2600);
    const ghosts = validMoves.map((move, index) => {
      const from = this._baseAnchor(move.from);
      const to = this._baseAnchor(move.to);
      const ghost = this._makeRunnerToken(move.team === 'away' ? TEAM_COLORS.away : TEAM_COLORS.runner);
      ghost.position.copy(from);
      ghost.position.x += (index - (validMoves.length - 1) / 2) * 0.24;
      this.transientGroup.add(ghost);
      this.runnerGhosts.add(ghost);

      if (move.from !== 'home' && this.runners?.[move.from]) this.runners[move.from].visible = false;
      return { ...move, from, to, ghost, offset: ghost.position.x - from.x };
    });

    return this._addAnimation({
      channel: 'runner',
      duration: playDuration,
      onUpdate: (progress) => {
        const p = easeInOut(progress);
        ghosts.forEach((runner) => {
          runner.ghost.position.lerpVectors(runner.from, runner.to, p);
          runner.ghost.position.x += runner.offset;
          runner.ghost.position.y = 0.12 + Math.abs(Math.sin(progress * Math.PI * 4)) * 0.08;
          runner.ghost.rotation.y = Math.atan2(runner.to.x - runner.from.x, runner.to.z - runner.from.z);
        });
      },
      onComplete: () => {
        ghosts.forEach((runner) => {
          this._removeRunnerGhost(runner.ghost);
          if (runner.to !== 'home' && !runner.out && this.runners?.[runner.to]) {
            this.runners[runner.to].visible = true;
            this._pulseBase(runner.to, TEAM_COLORS.runner);
          }
        });
      },
      onCancel: () => ghosts.forEach((runner) => this._removeRunnerGhost(runner.ghost)),
    });
  }

  /** Pulse selected bags without changing the game state. */
  highlightBases(bases, color = TEAM_COLORS.runner) {
    const selected = Array.isArray(bases) ? bases : [bases];
    selected.forEach((base) => {
      const normalized = normalizeBaseKey(base);
      if (normalized && normalized !== 'home') this._pulseBase(normalized, color);
    });
    return this;
  }

  /** Displays a transient 3D play call. */
  showMessage(message, color = 0xffffff, duration = 1400) {
    if (!message) return this;
    if (this.mode === 'fallback') {
      this._fallbackMessage(message);
      return this;
    }
    if (!this.ready || !this.messageBoard) return this;

    this._paintSprite(this.messageBoard, text(message).toUpperCase(), {
      foreground: `#${Number(color).toString(16).padStart(6, '0')}`,
      background: 'rgba(3, 11, 27, 0.83)',
      fontSize: 94,
      align: 'center',
    });
    this.messageBoard.sprite.visible = true;
    this._messageUntil = this._elapsed + Math.max(250, number(duration, 1400));
    return this;
  }

  /** Recalculates renderer dimensions after a panel resize. */
  resize() {
    if (this.disposed || !this.container) return this;
    if (this.mode === 'fallback') return this;
    if (!this.ready || !this.renderer || !this.camera) return this;

    const width = Math.max(1, this.container.clientWidth || 820);
    const height = Math.max(1, this.container.clientHeight || 480);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    return this;
  }

  /** Stops rendering, releases GPU resources, and removes only this scene's DOM. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._cancelAnimations('disposed');

    if (this._raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
    this.listeners.forEach(({ target, type, handler, options }) => target.removeEventListener(type, handler, options));
    this.listeners = [];
    this.resizeObserver?.disconnect();

    if (this.scene) this._disposeObject(this.scene);
    this.renderer?.dispose?.();
    this.renderer?.forceContextLoss?.();

    if (this.canvas?.parentNode === this.container) this.container.removeChild(this.canvas);
    if (this.fallback?.parentNode === this.container) this.container.removeChild(this.fallback);

    this.runnerGhosts.clear();
    this.animations.clear();
    this.ready = false;
  }

  _buildThreeScene() {
    const T = this.THREE;
    this.scene = new T.Scene();
    this.scene.background = new T.Color(this.options.clearColor);
    this.scene.fog = new T.Fog(0x06142a, 37, 89);

    this.camera = new T.PerspectiveCamera(43, 1, 0.1, 140);
    this.cameraTarget = new T.Vector3(0, 0.7, 11);
    this._updateCamera();

    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'baseball-3d-canvas';
    this.canvas.setAttribute('aria-label', '可旋轉檢視的 3D 棒球場');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.container.appendChild(this.canvas);

    this.world = new T.Group();
    this.scene.add(this.world);
    this.fieldGroup = new T.Group();
    this.playerGroup = new T.Group();
    this.transientGroup = new T.Group();
    this.world.add(this.fieldGroup, this.playerGroup, this.transientGroup);

    this._buildLighting();
    this._buildField();
    this._buildPlayers();
    this._buildScoreboard();
    this._buildBall();
    this._bindInteraction();
    this.resize();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    } else {
      this._listen(window, 'resize', () => this.resize());
    }
  }

  _buildLighting() {
    const T = this.THREE;
    const hemi = new T.HemisphereLight(0x93d6ff, 0x103a20, 2.25);
    this.scene.add(hemi);

    const key = new T.DirectionalLight(0xfff0d2, 2.9);
    key.position.set(-17, 31, -11);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -38;
    key.shadow.camera.right = 38;
    key.shadow.camera.top = 38;
    key.shadow.camera.bottom = -20;
    this.scene.add(key);

    const towerPositions = [
      [-27, 19, 2], [27, 19, 2], [-25, 20, 35], [25, 20, 35],
    ];
    const towerMaterial = new T.MeshStandardMaterial({ color: 0x273a54, roughness: 0.56, metalness: 0.45 });
    const lampMaterial = new T.MeshStandardMaterial({ color: 0xeef9ff, emissive: 0xb9e8ff, emissiveIntensity: 3.4 });
    towerPositions.forEach(([x, y, z]) => {
      const tower = new T.Group();
      const mast = new T.Mesh(new T.CylinderGeometry(0.12, 0.22, y, 8), towerMaterial);
      mast.position.y = y / 2;
      tower.add(mast);
      const crossbar = new T.Mesh(new T.BoxGeometry(3.1, 0.25, 0.28), towerMaterial);
      crossbar.position.set(0, y - 0.55, 0);
      tower.add(crossbar);
      [-1.1, -0.36, 0.36, 1.1].forEach((offset) => {
        const lamp = new T.Mesh(new T.BoxGeometry(0.46, 0.34, 0.2), lampMaterial);
        lamp.position.set(offset, y - 0.66, -0.13);
        tower.add(lamp);
      });
      tower.position.set(x, 0, z);
      this.world.add(tower);

      const flood = new T.SpotLight(0xcfeaff, 670, 78, Math.PI / 4.8, 0.6, 1.2);
      flood.position.set(x, y - 0.8, z);
      flood.target.position.set(0, 0, 11);
      flood.castShadow = false;
      this.scene.add(flood, flood.target);
    });
  }

  _buildField() {
    const T = this.THREE;
    const grass = new T.Mesh(
      new T.CircleGeometry(39, 96),
      new T.MeshStandardMaterial({ color: 0x176c3d, roughness: 0.96, metalness: 0 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.z = 12;
    grass.receiveShadow = true;
    this.fieldGroup.add(grass);

    // Alternating mow stripes lend depth without loading an image texture.
    for (let index = 0; index < 13; index += 1) {
      const stripe = new T.Mesh(
        new T.PlaneGeometry(58, 3.1),
        new T.MeshBasicMaterial({ color: index % 2 ? 0x1e7943 : 0x155f36, transparent: true, opacity: 0.24, depthWrite: false }),
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.011, -4 + index * 3.08);
      this.fieldGroup.add(stripe);
    }

    const dirt = new T.Mesh(
      new T.PlaneGeometry(18.6, 18.6),
      new T.MeshStandardMaterial({ color: 0xa86d42, roughness: 0.98 }),
    );
    // Lay the dirt on the ground before turning it into a diamond. A Y-axis
    // turn here tilts the plane upright and creates the obstructing rhombus.
    dirt.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    dirt.position.set(0, 0.025, 6.5);
    dirt.receiveShadow = true;
    this.fieldGroup.add(dirt);

    const homeDirt = new T.Mesh(
      new T.CircleGeometry(3.4, 40),
      new T.MeshStandardMaterial({ color: 0x9f643d, roughness: 1 }),
    );
    homeDirt.rotation.x = -Math.PI / 2;
    homeDirt.position.set(0, 0.03, -0.35);
    this.fieldGroup.add(homeDirt);

    this._addChalkLines();
    this._addBasesAndMound();
    this._addOutfieldAndStands();
  }

  _addChalkLines() {
    const T = this.THREE;
    const chalk = new T.LineBasicMaterial({ color: 0xf5f5e8, transparent: true, opacity: 0.95 });
    const line = (points) => {
      const geometry = new T.BufferGeometry().setFromPoints(points.map(([x, y, z]) => new T.Vector3(x, y, z)));
      this.fieldGroup.add(new T.Line(geometry, chalk));
    };
    line([[0, 0.08, 0], [28, 0.08, 28]]);
    line([[0, 0.08, 0], [-28, 0.08, 28]]);
    line([[0, 0.085, 0], [-6.5, 0.085, 6.5], [0, 0.085, 13], [6.5, 0.085, 6.5], [0, 0.085, 0]]);
  }

  _addBasesAndMound() {
    const T = this.THREE;
    this.baseAnchors = {
      home: new T.Vector3(0, 0.12, 0),
      first: new T.Vector3(-6.5, 0.12, 6.5),
      second: new T.Vector3(0, 0.12, 13),
      third: new T.Vector3(6.5, 0.12, 6.5),
    };
    this.baseVisuals = {};

    const baseMaterial = new T.MeshStandardMaterial({ color: 0xfdfbf2, roughness: 0.62, metalness: 0.04 });
    const ringMaterial = () => new T.MeshStandardMaterial({
      color: 0x9cecff,
      emissive: 0x167fc0,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.33,
      roughness: 0.28,
    });

    BASE_KEYS.forEach((base) => {
      const marker = new T.Group();
      const bag = new T.Mesh(new T.BoxGeometry(1.02, 0.22, 1.02), baseMaterial.clone());
      bag.position.y = 0.2;
      bag.rotation.y = Math.PI / 4;
      bag.castShadow = true;
      marker.add(bag);
      const ring = new T.Mesh(new T.TorusGeometry(0.78, 0.045, 10, 32), ringMaterial());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.045;
      marker.add(ring);
      marker.position.copy(this.baseAnchors[base]);
      this.fieldGroup.add(marker);
      this.baseVisuals[base] = { marker, bag, ring, pulse: 0, pulseColor: TEAM_COLORS.runner };
    });

    const mound = new T.Mesh(
      new T.CylinderGeometry(1.8, 2.3, 0.38, 48),
      new T.MeshStandardMaterial({ color: 0xa96a42, roughness: 0.93 }),
    );
    mound.position.set(0, 0.19, 7.05);
    mound.receiveShadow = true;
    mound.castShadow = true;
    this.fieldGroup.add(mound);
    const rubber = new T.Mesh(new T.BoxGeometry(0.92, 0.08, 0.22), baseMaterial.clone());
    rubber.position.set(0, 0.42, 7.42);
    rubber.castShadow = true;
    this.fieldGroup.add(rubber);

    const shape = new T.Shape();
    shape.moveTo(-0.88, -0.68);
    shape.lineTo(0.88, -0.68);
    shape.lineTo(0.88, 0.22);
    shape.lineTo(0, 0.95);
    shape.lineTo(-0.88, 0.22);
    shape.closePath();
    const plate = new T.Mesh(new T.ShapeGeometry(shape), baseMaterial.clone());
    plate.rotation.x = Math.PI / 2;
    plate.position.set(0, 0.12, 0);
    plate.castShadow = true;
    this.fieldGroup.add(plate);
  }

  _addOutfieldAndStands() {
    const T = this.THREE;
    const fencePoints = [];
    const fenceMaterial = new T.LineBasicMaterial({ color: 0x90d5bf, transparent: true, opacity: 0.82 });
    const postMaterial = new T.MeshStandardMaterial({ color: 0x1b6270, metalness: 0.58, roughness: 0.38 });
    for (let index = 0; index <= 32; index += 1) {
      const angle = (index / 32) * Math.PI;
      const x = Math.cos(angle) * 32;
      const z = Math.sin(angle) * 32;
      fencePoints.push(new T.Vector3(x, 2.25, z));
      if (index % 2 === 0) {
        const post = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 2.3, 8), postMaterial);
        post.position.set(x, 1.15, z);
        this.fieldGroup.add(post);
      }
    }
    const fenceGeometry = new T.BufferGeometry().setFromPoints(fencePoints);
    this.fieldGroup.add(new T.Line(fenceGeometry, fenceMaterial));

    const stands = new T.Mesh(
      new T.RingGeometry(32.2, 42, 64, 2, 0, Math.PI),
      new T.MeshStandardMaterial({ color: 0x1b3149, roughness: 0.7, metalness: 0.12, side: T.DoubleSide }),
    );
    stands.rotation.x = -Math.PI / 2;
    stands.position.y = 0.16;
    stands.receiveShadow = true;
    this.fieldGroup.add(stands);

    // Crowd bands are a restrained way to make the ballpark feel occupied.
    const crowdColors = [0x1d5f80, 0x8e4454, 0xe0ad5d, 0x60738e];
    for (let index = 0; index < 28; index += 1) {
      const angle = ((index + 0.5) / 28) * Math.PI;
      const radius = 35.5;
      const block = new T.Mesh(
        new T.BoxGeometry(2.3, 1.2 + (index % 3) * 0.23, 1.8),
        new T.MeshStandardMaterial({ color: crowdColors[index % crowdColors.length], roughness: 0.93 }),
      );
      block.position.set(Math.cos(angle) * radius, 0.82, Math.sin(angle) * radius);
      block.rotation.y = -angle;
      this.fieldGroup.add(block);
    }
  }

  _buildPlayers() {
    const T = this.THREE;
    this.pitcher = this._makePlayer({ color: TEAM_COLORS.home, label: 'P', role: 'pitcher' });
    this.pitcher.position.set(0, 0.38, 7.05);
    this.pitcher.lookAt(0, 0.4, 0);
    this.playerGroup.add(this.pitcher);
    this._pitcherHand = new T.Vector3(-0.42, 1.7, 6.34);

    this.batter = this._makePlayer({ color: TEAM_COLORS.away, label: 'B', role: 'batter' });
    this.batter.position.set(-1.22, 0.11, -0.7);
    this.batter.lookAt(0, 0.8, 7);
    this.playerGroup.add(this.batter);

    this.catcher = this._makePlayer({ color: 0x405b74, label: 'C', role: 'catcher' });
    this.catcher.position.set(0, 0.1, -1.13);
    this.catcher.lookAt(0, 0.8, 7);
    this.playerGroup.add(this.catcher);

    const fielderPositions = {
      first: [-5.5, 6.2, '1B'],
      second: [-3.15, 10.1, '2B'],
      shortstop: [3.15, 10.1, 'SS'],
      third: [5.5, 6.2, '3B'],
      left: [13.4, 18.5, 'LF'],
      center: [0, 23.5, 'CF'],
      right: [-13.4, 18.5, 'RF'],
    };
    this.fielders = {};
    Object.entries(fielderPositions).forEach(([key, [x, z, label]]) => {
      const player = this._makePlayer({ color: TEAM_COLORS.home, label, role: 'fielder' });
      player.position.set(x, 0.1, z);
      player.lookAt(0, 0.1, 2.3);
      this.fielders[key] = player;
      this.playerGroup.add(player);
    });

    this.runners = {};
    BASE_KEYS.forEach((base) => {
      const runner = this._makeRunnerToken(TEAM_COLORS.away);
      runner.position.copy(this.baseAnchors[base]);
      runner.visible = false;
      this.runners[base] = runner;
      this.playerGroup.add(runner);
    });
  }

  _makePlayer({ color, label, role }) {
    const T = this.THREE;
    const group = new T.Group();
    const uniform = new T.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.04 });
    const dark = new T.MeshStandardMaterial({ color: 0x142032, roughness: 0.72 });
    const skin = new T.MeshStandardMaterial({ color: 0xdfaa7c, roughness: 0.88 });
    const cap = new T.MeshStandardMaterial({ color: role === 'batter' ? 0xa71e39 : 0x17608d, roughness: 0.58 });
    const glove = new T.MeshStandardMaterial({ color: 0x563621, roughness: 0.9 });
    const isPitcher = role === 'pitcher';
    const isBatter = role === 'batter';
    const isCatcher = role === 'catcher';
    const posture = isCatcher
      ? { y: -0.28, lean: 0.24, stance: 0.27, knee: 0.32 }
      : isBatter
        ? { y: -0.13, lean: 0.13, stance: 0.3, knee: 0.17 }
        : isPitcher
          ? { y: -0.07, lean: 0.09, stance: 0.23, knee: 0.08 }
          : { y: -0.05, lean: 0.1, stance: 0.24, knee: 0.1 };

    const shadow = new T.Mesh(new T.CircleGeometry(0.55, 20), new T.MeshBasicMaterial({ color: 0x061d17, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    group.add(shadow);

    // Keep the label and shadow steady while the nested pose rig leans, breathes,
    // and moves through a delivery. It gives each player a grounded stance instead
    // of a single upright cylinder.
    const pose = new T.Group();
    pose.position.y = posture.y;
    pose.rotation.x = posture.lean;
    group.add(pose);

    const torso = new T.Mesh(new T.CylinderGeometry(0.35, 0.42, 0.84, 12), uniform);
    torso.position.set(0, 1.14, isCatcher ? 0.05 : 0);
    torso.castShadow = true;
    pose.add(torso);
    const belt = new T.Mesh(new T.TorusGeometry(0.37, 0.035, 8, 16), dark);
    belt.rotation.x = Math.PI / 2;
    belt.position.set(0, 0.78, isCatcher ? 0.05 : 0);
    pose.add(belt);

    const headRig = new T.Group();
    headRig.position.set(0, 1.77, isCatcher ? 0.1 : 0);
    headRig.rotation.x = isCatcher ? -0.08 : 0;
    const head = new T.Mesh(new T.SphereGeometry(0.26, 14, 12), skin);
    head.castShadow = true;
    headRig.add(head);
    const hat = new T.Mesh(new T.CylinderGeometry(0.29, 0.29, 0.11, 14), cap);
    hat.position.y = 0.2;
    hat.castShadow = true;
    headRig.add(hat);
    const brim = new T.Mesh(new T.BoxGeometry(0.36, 0.045, 0.18), cap);
    brim.position.set(0, 0.16, 0.25);
    headRig.add(brim);
    pose.add(headRig);

    const legs = [-1, 1].map((side, index) => {
      const legRig = new T.Group();
      const stride = isBatter ? (side < 0 ? 0.11 : -0.08) : isPitcher ? (side < 0 ? 0.05 : -0.06) : 0;
      legRig.position.set(side * posture.stance, 0.82, stride);
      legRig.rotation.z = side * (isBatter ? 0.13 : 0.075);
      legRig.rotation.x = posture.knee + (index ? -0.025 : 0.025);

      const thigh = new T.Mesh(new T.CylinderGeometry(0.115, 0.135, 0.45, 10), dark);
      thigh.position.y = -0.22;
      thigh.castShadow = true;
      legRig.add(thigh);
      const knee = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), dark);
      knee.position.y = -0.46;
      legRig.add(knee);
      const shinRig = new T.Group();
      shinRig.position.y = -0.44;
      shinRig.rotation.x = isCatcher ? 0.27 : isBatter ? 0.12 : 0.06;
      const shin = new T.Mesh(new T.CylinderGeometry(0.095, 0.11, 0.37, 10), dark);
      shin.position.y = -0.18;
      shin.castShadow = true;
      shinRig.add(shin);
      const shoe = new T.Mesh(new T.BoxGeometry(0.25, 0.13, 0.43), new T.MeshStandardMaterial({ color: 0x0a101c, roughness: 0.65 }));
      shoe.position.set(0, -0.39, 0.08);
      shoe.castShadow = true;
      shinRig.add(shoe);
      legRig.add(shinRig);
      pose.add(legRig);
      return legRig;
    });

    const makeArm = ({ side, zRotation, xRotation, forward = 0, hasGlove = false }) => {
      const arm = new T.Group();
      arm.position.set(side * 0.43, 1.44, forward);
      arm.rotation.set(xRotation, 0, zRotation);
      const upper = new T.Mesh(new T.CylinderGeometry(0.095, 0.11, 0.47, 10), uniform);
      upper.position.y = -0.22;
      upper.castShadow = true;
      arm.add(upper);
      const elbow = new T.Mesh(new T.SphereGeometry(0.105, 10, 8), uniform);
      elbow.position.y = -0.46;
      arm.add(elbow);
      const forearmRig = new T.Group();
      forearmRig.position.y = -0.44;
      forearmRig.rotation.x = isCatcher ? -0.34 : isBatter ? -0.22 : -0.08;
      const forearm = new T.Mesh(new T.CylinderGeometry(0.08, 0.095, 0.37, 10), uniform);
      forearm.position.y = -0.17;
      forearm.castShadow = true;
      forearmRig.add(forearm);
      const hand = new T.Mesh(new T.SphereGeometry(0.105, 10, 8), skin);
      hand.position.y = -0.4;
      forearmRig.add(hand);
      if (hasGlove) {
        const mitt = new T.Mesh(new T.SphereGeometry(0.15, 12, 10), glove);
        mitt.scale.set(1.1, 0.74, 0.8);
        mitt.position.y = -0.42;
        mitt.castShadow = true;
        forearmRig.add(mitt);
      }
      arm.add(forearmRig);
      pose.add(arm);
      return arm;
    };

    // Local x offsets are mirrored too: the active arm, glove, and bat follow
    // the same x-axis convention as the corrected batter and pitch release.
    const throwingArm = makeArm({
      side: -1,
      zRotation: isPitcher ? 0.34 : isBatter ? 0.78 : isCatcher ? 0.58 : 0.38,
      xRotation: isPitcher ? 0.04 : isBatter ? -0.28 : isCatcher ? -0.3 : -0.08,
      forward: isCatcher ? 0.14 : 0,
    });
    const gloveArm = makeArm({
      side: 1,
      zRotation: isPitcher ? -0.5 : isBatter ? -0.68 : isCatcher ? -0.62 : -0.48,
      xRotation: isPitcher ? -0.04 : isBatter ? -0.24 : isCatcher ? -0.34 : -0.06,
      forward: isCatcher ? 0.15 : 0,
      hasGlove: !isBatter,
    });

    let bat = null;
    if (isBatter) {
      bat = new T.Group();
      bat.position.set(-0.39, 1.2, -0.02);
      bat.rotation.set(-0.18, -0.22, 0.46);
      const barrel = new T.Mesh(new T.CylinderGeometry(0.055, 0.09, 1.42, 10), new T.MeshStandardMaterial({ color: 0xc88843, roughness: 0.55 }));
      barrel.position.y = 0.62;
      barrel.castShadow = true;
      bat.add(barrel);
      const knob = new T.Mesh(new T.SphereGeometry(0.095, 10, 8), new T.MeshStandardMaterial({ color: 0x9d622e, roughness: 0.58 }));
      knob.position.y = -0.08;
      bat.add(knob);
      pose.add(bat);
    }

    const labelSprite = this._makeSprite(label, {
      width: 160,
      height: 78,
      scale: [1.35, 0.66],
      foreground: '#f4fbff',
      background: 'rgba(2, 18, 37, 0.65)',
      fontSize: 47,
    });
    labelSprite.sprite.position.set(0, 2.53, 0);
    group.add(labelSprite.sprite);
    group.userData = {
      role,
      labelSprite,
      uniform,
      pose,
      torso,
      headRig,
      throwingArm,
      gloveArm,
      legs,
      bat,
      restPose: {
        poseY: pose.position.y,
        poseX: pose.rotation.x,
        throwingArmZ: throwingArm.rotation.z,
        throwingArmX: throwingArm.rotation.x,
        gloveArmZ: gloveArm.rotation.z,
        gloveArmX: gloveArm.rotation.x,
        legs: legs.map((leg) => ({ x: leg.rotation.x, z: leg.rotation.z })),
        bat: bat ? { x: bat.rotation.x, y: bat.rotation.y, z: bat.rotation.z } : null,
      },
    };
    return group;
  }

  _animatePitcherDelivery(progress) {
    const rig = this.pitcher?.userData;
    const rest = rig?.restPose;
    if (!rig || !rest) return;
    const drive = Math.sin(progress * Math.PI);
    const followThrough = Math.max(0, (progress - 0.55) / 0.45);

    rig.pose.position.y = rest.poseY - drive * 0.085;
    rig.pose.rotation.x = rest.poseX + drive * 0.12 - followThrough * 0.2;
    rig.throwingArm.rotation.z = rest.throwingArmZ + drive * 1.18;
    rig.throwingArm.rotation.x = rest.throwingArmX - drive * 0.66;
    rig.gloveArm.rotation.z = rest.gloveArmZ - drive * 0.42;
    rig.gloveArm.rotation.x = rest.gloveArmX - drive * 0.19;
    rig.legs.forEach((leg, index) => {
      const legRest = rest.legs[index];
      leg.rotation.x = legRest.x + (index ? -0.24 : 0.22) * drive;
      leg.rotation.z = legRest.z + (index ? -0.045 : 0.045) * drive;
    });
  }

  _resetPitcherPose() {
    const rig = this.pitcher?.userData;
    const rest = rig?.restPose;
    if (!rig || !rest) return;
    rig.pose.position.y = rest.poseY;
    rig.pose.rotation.x = rest.poseX;
    rig.throwingArm.rotation.z = rest.throwingArmZ;
    rig.throwingArm.rotation.x = rest.throwingArmX;
    rig.gloveArm.rotation.z = rest.gloveArmZ;
    rig.gloveArm.rotation.x = rest.gloveArmX;
    rig.legs.forEach((leg, index) => {
      const legRest = rest.legs[index];
      leg.rotation.x = legRest.x;
      leg.rotation.z = legRest.z;
    });
  }

  _animatePlayerPoses(time) {
    const setIdle = (player, speed, phase = 0) => {
      const rig = player?.userData;
      const rest = rig?.restPose;
      if (!rig || !rest) return;
      const breath = Math.sin(time * speed + phase);
      rig.pose.position.y = rest.poseY + breath * 0.012;
      rig.pose.rotation.x = rest.poseX + breath * 0.012;
      rig.throwingArm.rotation.z = rest.throwingArmZ + breath * 0.025;
      rig.gloveArm.rotation.z = rest.gloveArmZ - breath * 0.018;
    };

    const pitcherIsDelivering = [...this.animations].some((animation) => animation.channel === 'pitch');
    if (!pitcherIsDelivering) setIdle(this.pitcher, 1.7, 0.2);

    setIdle(this.catcher, 2.15, 0.8);
    Object.values(this.fielders ?? {}).forEach((fielder, index) => setIdle(fielder, 1.45 + index * 0.08, index * 0.7));

    const batterRig = this.batter?.userData;
    const batterRest = batterRig?.restPose;
    if (!batterRig || !batterRest) return;
    const settle = Math.sin(time * 2.1);
    batterRig.pose.position.y = batterRest.poseY + settle * 0.014;
    batterRig.pose.rotation.x = batterRest.poseX + settle * 0.018;
    batterRig.throwingArm.rotation.z = batterRest.throwingArmZ + settle * 0.028;
    batterRig.gloveArm.rotation.z = batterRest.gloveArmZ - settle * 0.024;
    if (batterRig.bat && batterRest.bat) {
      batterRig.bat.rotation.x = batterRest.bat.x + Math.sin(time * 3.2) * 0.035;
      batterRig.bat.rotation.y = batterRest.bat.y + Math.sin(time * 2.15) * 0.055;
      batterRig.bat.rotation.z = batterRest.bat.z + Math.sin(time * 3.2) * 0.07;
    }
  }

  _makeRunnerToken(color) {
    const T = this.THREE;
    const group = new T.Group();
    const bodyMaterial = new T.MeshStandardMaterial({ color, roughness: 0.64 });
    const body = new T.Mesh(new T.CylinderGeometry(0.23, 0.3, 0.62, 10), bodyMaterial);
    body.position.y = 0.53;
    body.castShadow = true;
    const head = new T.Mesh(new T.SphereGeometry(0.18, 12, 10), new T.MeshStandardMaterial({ color: 0xe1aa7a, roughness: 0.85 }));
    head.position.y = 1.02;
    head.castShadow = true;
    const ring = new T.Mesh(new T.TorusGeometry(0.43, 0.04, 8, 18), new T.MeshBasicMaterial({ color: TEAM_COLORS.runner, transparent: true, opacity: 0.75 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    group.add(body, head, ring);
    return group;
  }

  _buildScoreboard() {
    const T = this.THREE;
    const board = new T.Group();
    const panel = new T.Mesh(
      new T.BoxGeometry(14, 4.8, 0.4),
      new T.MeshStandardMaterial({ color: 0x071524, emissive: 0x071524, emissiveIntensity: 0.9, roughness: 0.43, metalness: 0.45 }),
    );
    panel.position.y = 2.4;
    board.add(panel);
    const frame = new T.Mesh(new T.BoxGeometry(14.55, 5.34, 0.28), new T.MeshStandardMaterial({ color: 0x3c5d77, metalness: 0.68, roughness: 0.3 }));
    frame.position.set(0, 2.4, 0.18);
    board.add(frame);
    const face = new T.Mesh(new T.BoxGeometry(13.9, 4.7, 0.12), new T.MeshBasicMaterial({ color: 0x071524 }));
    face.position.set(0, 2.4, -0.2);
    board.add(face);

    this.scoreboard = this._makeSprite('', {
      width: 1024,
      height: 330,
      scale: [13.3, 4.3],
      foreground: '#ddf9ff',
      background: 'rgba(0, 0, 0, 0)',
      fontSize: 56,
      align: 'left',
      padding: 40,
    });
    this.scoreboard.sprite.position.set(0, 2.36, -0.31);
    board.add(this.scoreboard.sprite);
    board.position.set(0, 5.6, 32.5);
    this.world.add(board);

    this.messageBoard = this._makeSprite('', {
      width: 760,
      height: 155,
      scale: [8.4, 1.7],
      foreground: '#ffffff',
      background: 'rgba(3, 11, 27, 0.83)',
      fontSize: 94,
      align: 'center',
    });
    this.messageBoard.sprite.position.set(0, 4.5, 7.2);
    this.messageBoard.sprite.visible = false;
    this.scene.add(this.messageBoard.sprite);
  }

  _buildBall() {
    const T = this.THREE;
    this.ball = new T.Group();
    const core = new T.Mesh(new T.SphereGeometry(0.2, 18, 16), new T.MeshStandardMaterial({ color: 0xfdf9e9, roughness: 0.58 }));
    core.castShadow = true;
    this.ball.add(core);
    const seamMaterial = new T.MeshBasicMaterial({ color: 0xc8393e });
    const seamA = new T.Mesh(new T.TorusGeometry(0.17, 0.011, 6, 20, Math.PI * 1.45), seamMaterial);
    seamA.rotation.set(0.9, 0.24, 0.24);
    const seamB = seamA.clone();
    seamB.rotation.set(-0.9, -0.24, 2.9);
    this.ball.add(seamA, seamB);
    this.ball.position.copy(this._pitcherHand);
    this.scene.add(this.ball);

    this.ballTrailGeometry = new T.BufferGeometry();
    this.ballTrailMaterial = new T.LineBasicMaterial({ color: 0xe9fbff, transparent: true, opacity: 0.66 });
    this.ballTrail = new T.Line(this.ballTrailGeometry, this.ballTrailMaterial);
    this.ballTrail.frustumCulled = false;
    this.scene.add(this.ballTrail);
    this._trailPoints = [];
  }

  _makeSprite(value, options = {}) {
    const T = this.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = options.width ?? 512;
    canvas.height = options.height ?? 160;
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.minFilter = T.LinearFilter;
    const material = new T.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new T.Sprite(material);
    const scale = options.scale ?? [3.6, 1.1];
    sprite.scale.set(scale[0], scale[1], 1);
    const record = { canvas, context: canvas.getContext('2d'), texture, sprite, options };
    this._paintSprite(record, value, options);
    return record;
  }

  _paintSprite(record, value, paintOptions = {}) {
    if (!record?.context) return;
    const options = { ...record.options, ...paintOptions };
    const { canvas, context, texture } = record;
    const foreground = options.foreground ?? '#ffffff';
    const background = options.background ?? 'rgba(0,0,0,0)';
    const padding = options.padding ?? 22;
    const fontSize = options.fontSize ?? Math.floor(canvas.height * 0.52);
    const lines = String(value || '').split('\n').slice(0, 4);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = foreground;
    context.font = `800 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = options.align ?? 'center';
    const x = options.align === 'left' ? padding : options.align === 'right' ? canvas.width - padding : canvas.width / 2;
    const spacing = lines.length > 1 ? canvas.height / (lines.length + 0.35) : canvas.height / 2;
    lines.forEach((line, index) => context.fillText(line, x, lines.length > 1 ? spacing * (index + 0.72) : spacing));
    texture.needsUpdate = true;
  }

  _updateScoreboard() {
    if (!this.scoreboard) return;
    const { teams, score, balls, strikes, outs, inning, half, bases } = this.state;
    const arrows = half === 'bottom' ? '▼ BOT' : '▲ TOP';
    const occupied = [bases.first ? '1B' : '--', bases.second ? '2B' : '--', bases.third ? '3B' : '--'].join('  ');
    const firstLine = `${teams.away.padEnd(10, ' ').slice(0, 10)} ${String(score.away).padStart(2, ' ')}     ${teams.home.padEnd(10, ' ').slice(0, 10)} ${String(score.home).padStart(2, ' ')}`;
    const secondLine = `${arrows} ${inning}     B ${balls}   S ${strikes}   O ${outs}     ON: ${occupied}`;
    this._paintSprite(this.scoreboard, `${firstLine}\n${secondLine}`, {
      foreground: '#ddf9ff',
      background: 'rgba(0,0,0,0)',
      fontSize: 49,
      align: 'left',
      padding: 40,
    });
  }

  _updateRunners() {
    if (!this.runners) return;
    BASE_KEYS.forEach((base) => {
      const occupied = Boolean(this.state.bases?.[base]);
      this.runners[base].visible = occupied;
      if (occupied) this._pulseBase(base, TEAM_COLORS.away, 760);
    });
  }

  _updatePlayerLabels() {
    if (!this.pitcher || !this.batter) return;
    const pitcher = displayName(this.state.pitcher ?? this.state.currentPitcher, 'P').toUpperCase().slice(0, 4);
    const batter = displayName(this.state.batter ?? this.state.currentBatter, 'B').toUpperCase().slice(0, 4);
    this._paintSprite(this.pitcher.userData.labelSprite, pitcher, { fontSize: 40 });
    this._paintSprite(this.batter.userData.labelSprite, batter, { fontSize: 40 });
  }

  _applyFieldingState(nextState) {
    if (!this.fielders || !nextState?.fieldingPosition) return;
    const position = String(nextState.fieldingPosition).toLowerCase();
    Object.entries(this.fielders).forEach(([key, player]) => {
      const isTarget = key === position || player.userData?.labelSprite?.value === position;
      const material = player.userData?.uniform;
      if (material?.emissive) material.emissive.setHex(isTarget ? 0x2c7e9b : 0x000000);
      if (material) material.emissiveIntensity = isTarget ? 0.76 : 0;
    });
  }

  _animateBattedBall(outcome, data) {
    const T = this.THREE;
    this._cancelAnimations('superseded', 'batted-ball');
    const start = this._toVector3(data.start, new T.Vector3(-0.3, 1.15, 0));
    const suppliedTarget = data.landing ?? data.target ?? data.destination;
    const fallback = OUTCOME_TARGETS[outcome] || OUTCOME_TARGETS.single;
    const end = this._toVector3(suppliedTarget, new T.Vector3(fallback[0], fallback[1], fallback[2]));
    const isGrounder = ['groundout', 'forceout', 'bunt', 'error'].includes(outcome) || data.trajectory === 'ground';
    const isHomeRun = ['homerun', 'home_run', 'grand_slam'].includes(outcome);
    const height = number(data.arcHeight, isGrounder ? 0.55 : isHomeRun ? 11 : 5.4);
    const duration = clamp(number(data.duration, isHomeRun ? 1500 : 1100), 420, 3000);
    this.ball.visible = true;
    this._clearBallTrail();

    return this._addAnimation({
      channel: 'batted-ball',
      duration,
      onUpdate: (progress) => {
        const p = easeInOut(progress);
        const point = start.clone().lerp(end, p);
        const parabola = Math.sin(Math.PI * p) * height;
        point.y += parabola;
        if (isGrounder) point.y += Math.abs(Math.sin(progress * Math.PI * 7)) * 0.13 * (1 - progress);
        this.ball.position.copy(point);
        this.ball.rotation.x += 0.56;
        this.ball.rotation.z += 0.71;
        this._appendBallTrail(point);
      },
      onComplete: () => this.ball.position.copy(end),
    });
  }

  _addAnimation({ channel = 'general', duration = 500, onUpdate, onComplete, onCancel }) {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const item = {
      channel,
      duration: Math.max(1, duration),
      started: this._elapsed,
      onUpdate,
      onComplete,
      onCancel,
      resolve,
    };
    this.animations.add(item);
    return promise;
  }

  _cancelAnimations(reason, onlyChannel) {
    [...this.animations].forEach((animation) => {
      if (onlyChannel && animation.channel !== onlyChannel) return;
      this.animations.delete(animation);
      try { animation.onCancel?.(); } catch { /* no-op: visuals must not stop the game */ }
      animation.resolve?.({ cancelled: true, reason });
    });
  }

  _pulseBase(base, color = TEAM_COLORS.runner, duration = 820) {
    const visual = this.baseVisuals?.[base];
    if (!visual) return;
    visual.pulse = Math.max(visual.pulse, this._elapsed + duration);
    visual.pulseColor = color;
  }

  _baseAnchor(base) {
    if (!this.baseAnchors?.[base]) return this.baseAnchors?.home?.clone?.() ?? new this.THREE.Vector3();
    return this.baseAnchors[base].clone();
  }

  _toVector3(value, fallback) {
    const T = this.THREE;
    if (value?.isVector3) return value.clone();
    if (Array.isArray(value)) return new T.Vector3(number(value[0]), number(value[1]), number(value[2]));
    if (isObject(value)) return new T.Vector3(number(value.x), number(value.y), number(value.z));
    return fallback.clone();
  }

  _setBallPosition(value) {
    if (!this.ball || !value) return;
    this.ball.visible = true;
    this.ball.position.copy(this._toVector3(value, this._pitcherHand));
  }

  _quadraticBezier(start, control, end, progress) {
    const oneMinus = 1 - progress;
    return start.clone().multiplyScalar(oneMinus * oneMinus)
      .add(control.clone().multiplyScalar(2 * oneMinus * progress))
      .add(end.clone().multiplyScalar(progress * progress));
  }

  _appendBallTrail(point) {
    this._trailPoints.push(point.clone());
    if (this._trailPoints.length > 18) this._trailPoints.shift();
    this.ballTrailGeometry.setFromPoints(this._trailPoints);
    this.ballTrailGeometry.computeBoundingSphere();
  }

  _clearBallTrail() {
    if (!this._trailPoints) return;
    this._trailPoints.length = 0;
    this.ballTrailGeometry?.setFromPoints([]);
  }

  _removeRunnerGhost(ghost) {
    if (!ghost) return;
    this.runnerGhosts.delete(ghost);
    ghost.parent?.remove(ghost);
    this._disposeObject(ghost);
  }

  _outcomeColor(outcome) {
    if (['homerun', 'home_run', 'grand_slam', 'triple'].includes(outcome)) return 0xffd166;
    if (['single', 'double', 'walk', 'steal', 'sacrifice'].includes(outcome)) return 0x71e6a1;
    if (['strikeout', 'flyout', 'groundout', 'forceout', 'doubleplay', 'double_play', 'caughtstealing'].includes(outcome)) return 0xff8c9b;
    return 0x9edbff;
  }

  _startRenderLoop() {
    const render = (now) => {
      if (this.disposed || !this.ready) return;
      const delta = this._lastTick ? Math.min(50, now - this._lastTick) : 16;
      this._lastTick = now;
      this._elapsed += delta;
      this._advanceAnimations();
      this._animateEnvironment(delta);
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(render);
    };
    this._raf = requestAnimationFrame(render);
  }

  _advanceAnimations() {
    [...this.animations].forEach((animation) => {
      const progress = clamp((this._elapsed - animation.started) / animation.duration, 0, 1);
      try {
        animation.onUpdate?.(progress);
        if (progress >= 1) {
          this.animations.delete(animation);
          animation.onComplete?.();
          animation.resolve?.({ cancelled: false });
        }
      } catch (error) {
        this.animations.delete(animation);
        animation.resolve?.({ cancelled: true, reason: 'animation-error', error });
      }
    });
  }

  _animateEnvironment(delta) {
    const time = this._elapsed / 1000;
    if (this.options.autoRotate && !this._cameraOrbit.dragging && !this.animations.size) {
      this._cameraOrbit.azimuth += delta * 0.000012;
      this._updateCamera();
    }
    if (this.messageBoard && this._messageUntil && this._elapsed > this._messageUntil) {
      this.messageBoard.sprite.visible = false;
      this._messageUntil = 0;
    }
    Object.values(this.baseVisuals ?? {}).forEach((visual) => {
      const isPulsing = visual.pulse > this._elapsed;
      const amount = isPulsing ? 0.55 + Math.sin(time * 9) * 0.25 : 0.18;
      visual.ring.material.opacity = amount;
      visual.ring.material.emissive.setHex(isPulsing ? visual.pulseColor : 0x167fc0);
      visual.ring.material.emissiveIntensity = isPulsing ? 1.55 : 0.35;
      visual.ring.scale.setScalar(isPulsing ? 1 + Math.sin(time * 9) * 0.08 : 1);
    });
    this._animatePlayerPoses(time);
  }

  _updateCamera() {
    if (!this.camera || !this.cameraTarget) return;
    const orbit = this._cameraOrbit;
    const horizontal = orbit.distance * Math.cos(orbit.elevation);
    this.camera.position.set(
      this.cameraTarget.x + Math.sin(orbit.azimuth) * horizontal,
      this.cameraTarget.y + Math.sin(orbit.elevation) * orbit.distance,
      this.cameraTarget.z + Math.cos(orbit.azimuth) * horizontal,
    );
    this.camera.lookAt(this.cameraTarget);
  }

  _bindInteraction() {
    if (!this.options.interactive || !this.canvas) return;
    const orbit = this._cameraOrbit;
    const down = (event) => {
      orbit.dragging = true;
      orbit.pointerX = event.clientX;
      orbit.pointerY = event.clientY;
      this.canvas.setPointerCapture?.(event.pointerId);
    };
    const move = (event) => {
      if (!orbit.dragging) return;
      const dx = event.clientX - orbit.pointerX;
      const dy = event.clientY - orbit.pointerY;
      orbit.pointerX = event.clientX;
      orbit.pointerY = event.clientY;
      orbit.azimuth -= dx * 0.008;
      orbit.elevation = clamp(orbit.elevation + dy * 0.006, 0.18, 0.93);
      this._updateCamera();
    };
    const up = (event) => {
      orbit.dragging = false;
      this.canvas.releasePointerCapture?.(event.pointerId);
    };
    const wheel = (event) => {
      event.preventDefault();
      orbit.distance = clamp(orbit.distance + event.deltaY * 0.025, 27, 68);
      this._updateCamera();
    };
    this._listen(this.canvas, 'pointerdown', down);
    this._listen(this.canvas, 'pointermove', move);
    this._listen(this.canvas, 'pointerup', up);
    this._listen(this.canvas, 'pointercancel', up);
    this._listen(this.canvas, 'wheel', wheel, { passive: false });
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.listeners.push({ target, type, handler, options });
  }

  _createFallback(message) {
    if (this.disposed || !this.container || typeof document === 'undefined') return;
    this.mode = 'fallback';
    this.ready = false;
    const shell = document.createElement('section');
    shell.className = 'baseball-3d-fallback';
    shell.setAttribute('aria-label', '棒球戰術示意球場');
    Object.assign(shell.style, {
      position: 'relative',
      display: 'grid',
      placeItems: 'center',
      minHeight: '320px',
      width: '100%',
      overflow: 'hidden',
      color: '#e9f6ff',
      background: 'radial-gradient(circle at 50% 48%, #227442 0 27%, #153a55 28% 100%)',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    });
    const diamond = document.createElement('div');
    Object.assign(diamond.style, {
      width: '168px', height: '168px', transform: 'rotate(45deg)', border: '2px solid rgba(255,255,235,.95)',
      background: 'linear-gradient(135deg, #a86d42, #8f5939)', boxShadow: '0 0 0 34px rgba(18,103,57,.73)', position: 'relative',
    });
    const bagBits = {};
    BASE_KEYS.forEach((base, index) => {
      const bag = document.createElement('i');
      Object.assign(bag.style, {
        position: 'absolute', width: '18px', height: '18px', borderRadius: '3px', background: '#fffbed',
        transform: 'rotate(-45deg)', transition: 'box-shadow .15s ease, background .15s ease',
      });
      const positions = [{ right: '-10px', top: '-10px' }, { right: '-10px', bottom: '-10px' }, { left: '-10px', bottom: '-10px' }];
      Object.assign(bag.style, positions[index]);
      diamond.appendChild(bag);
      bagBits[base] = bag;
    });
    const home = document.createElement('i');
    Object.assign(home.style, { position: 'absolute', left: '-10px', top: '-10px', width: '18px', height: '18px', background: '#fffbed', transform: 'rotate(-45deg)', borderRadius: '3px' });
    diamond.appendChild(home);
    const mound = document.createElement('b');
    Object.assign(mound.style, { position: 'absolute', left: '72px', top: '72px', width: '23px', height: '23px', background: '#744126', borderRadius: '50%', transform: 'rotate(-45deg)' });
    diamond.appendChild(mound);
    shell.appendChild(diamond);
    const notice = document.createElement('p');
    Object.assign(notice.style, { position: 'absolute', left: '16px', right: '16px', bottom: '6px', margin: 0, textAlign: 'center', fontSize: '12px', opacity: '.84' });
    notice.textContent = message;
    shell.appendChild(notice);
    const score = document.createElement('output');
    Object.assign(score.style, { position: 'absolute', top: '14px', left: '16px', right: '16px', textAlign: 'center', fontWeight: '800', fontSize: '13px', letterSpacing: '.04em' });
    shell.appendChild(score);
    this.fallback = shell;
    this.fallbackBits = { bagBits, score, notice };
    this.container.appendChild(shell);
    this._renderFallbackState();
  }

  _renderFallbackState() {
    if (!this.fallbackBits) return;
    const { teams, score, inning, half, balls, strikes, outs, bases } = this.state;
    this.fallbackBits.score.textContent = `${teams.away} ${score.away}  ·  ${teams.home} ${score.home}   |   ${half === 'bottom' ? '▼' : '▲'} ${inning}   B${balls} S${strikes} O${outs}`;
    BASE_KEYS.forEach((base) => {
      const bag = this.fallbackBits.bagBits[base];
      if (!bag) return;
      const occupied = Boolean(bases?.[base]);
      bag.style.background = occupied ? '#ffd76a' : '#fffbed';
      bag.style.boxShadow = occupied ? '0 0 0 5px rgba(255,215,106,.32), 0 0 20px rgba(255,215,106,.9)' : 'none';
    });
  }

  _fallbackMessage(message) {
    if (!this.fallbackBits?.notice) return;
    this.fallbackBits.notice.textContent = message;
  }

  _disposeObject(object) {
    if (!object?.traverse) return;
    object.traverse((node) => {
      node.geometry?.dispose?.();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.filter(Boolean).forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    });
  }
}

/** Convenience factory for callers that prefer a one-line async setup. */
export async function createBaseballScene(elementOrSelector, options) {
  const scene = new BaseballScene(elementOrSelector, options);
  await scene.init();
  return scene;
}

export default BaseballScene;
