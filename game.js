const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const playButton = document.getElementById('playButton');
const statusLabel = document.getElementById('statusLabel');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const sideBestEl = document.getElementById('sideBest');
const livesEl = document.getElementById('lives');
const toastEl = document.getElementById('toast');
const soundButton = document.getElementById('soundButton');

const BOARD = [
  '###################',
  '#P..o....#....k..o#',
  '#.##.###.#.###.#.##',
  '#...#...#.#...#...#',
  '###.#.#.#.#.#.###.#',
  '#...#...#...#...#.#',
  '#.###.###.###.###.#',
  '#.....#...#.....#.#',
  '#.###.#.#.#.###.#.#',
  '#...#.#...#...#...#',
  '#.#.#.#####.#.#.#.#',
  '#.#...#...#...#...#',
  '#.###.#.###.#.###G#',
  '#o..k....s....#k.o#',
  '###################',
];

const TILE = 26;
const DIRS = [
  { x: 0, y: -1, key: 'up' },
  { x: 1, y: 0, key: 'right' },
  { x: 0, y: 1, key: 'down' },
  { x: -1, y: 0, key: 'left' },
];

const colorMap = {
  red: '#ff4d6d',
  pink: '#ff77c8',
  cyan: '#44d9ff',
  amber: '#ffbf5a',
};

let bestScore = Number(localStorage.getItem('neonMazeBest') || 0);
const state = {
  started: false,
  running: false,
  paused: false,
  gameOver: false,
  victory: false,
  score: 0,
  lives: 3,
  keysFound: 0,
  pelletsLeft: 0,
  ghostModeTimer: 0,
  shockPulse: 0,
  time: 0,
  lastTimestamp: 0,
  safeFlash: 0,
  gateOpen: false,
  player: null,
  ghosts: [],
  pellets: new Set(),
  powerPellets: new Set(),
  keyShards: new Set(),
  shockTiles: new Set(),
  gate: { x: -1, y: -1 },
};

let audioCtx = null;
let lastHitTime = 0;

function init() {
  canvas.width = BOARD[0].length * TILE;
  canvas.height = BOARD.length * TILE;
  attachEvents();
  hideOverlay();
  resetBoardState();
  updateHud();
  render();
}

function attachEvents() {
  window.addEventListener('keydown', handleKeydown);
  playButton.addEventListener('click', () => startGame());
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundButton.textContent = soundEnabled ? '♪' : '♫';
    soundButton.title = soundEnabled ? 'Toggle sound' : 'Sound off';
  });

  document.querySelectorAll('[data-dir]').forEach((button) => {
    const dir = button.dataset.dir;
    const press = (event) => {
      event.preventDefault();
      if (state.started && !state.gameOver && !state.victory) {
        state.player.nextDir = parseDirection(dir);
      } else if (!state.started) {
        startGame();
      }
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('touchstart', press, { passive: false });
  });
}

let soundEnabled = true;

function ensureAudio() {
  if (!soundEnabled) return;
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioCtx = new AudioCtor();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, duration = 0.08, type = 'square', volume = 0.03) {
  if (!soundEnabled) return;
  ensureAudio();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gainNode.gain.value = volume;
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  const endTime = audioCtx.currentTime + duration;
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);
  osc.stop(endTime);
}

function resetBoardState() {
  state.pellets = new Set();
  state.powerPellets = new Set();
  state.keyShards = new Set();
  state.shockTiles = new Set();
  state.score = 0;
  state.lives = 3;
  state.keysFound = 0;
  state.started = false;
  state.running = false;
  state.paused = false;
  state.gameOver = false;
  state.victory = false;
  state.ghostModeTimer = 0;
  state.shockPulse = 0;
  state.time = 0;
  state.safeFlash = 0;
  state.gateOpen = false;

  const playerStart = { x: 1, y: 1 };
  const ghostStarts = [
    { x: 8, y: 7, name: 'Hunter', type: 'hunter', color: colorMap.red },
    { x: 9, y: 7, name: 'Oracle', type: 'oracle', color: colorMap.pink },
    { x: 7, y: 9, name: 'Drifter', type: 'drifter', color: colorMap.cyan },
    { x: 9, y: 9, name: 'Glitch', type: 'glitch', color: colorMap.amber },
  ];

  for (let row = 0; row < BOARD.length; row += 1) {
    for (let col = 0; col < BOARD[row].length; col += 1) {
      const tile = BOARD[row][col];
      if (tile === '.') {
        state.pellets.add(keyFor(col, row));
      }
      if (tile === 'o') {
        state.powerPellets.add(keyFor(col, row));
      }
      if (tile === 'k') {
        state.keyShards.add(keyFor(col, row));
      }
      if (tile === 's') {
        state.shockTiles.add(keyFor(col, row));
      }
      if (tile === 'P') {
        playerStart.x = col;
        playerStart.y = row;
      }
      if (tile === 'G') {
        state.gate = { x: col, y: row };
      }
    }
  }

  state.player = {
    x: playerStart.x,
    y: playerStart.y,
    dir: { x: 0, y: 0 },
    nextDir: { x: 1, y: 0 },
    speed: 7.4,
    radius: 0.33,
    invulnerable: 0,
  };

  state.ghosts = ghostStarts.map((start, index) => ({
    ...start,
    x: start.x,
    y: start.y,
    startX: start.x,
    startY: start.y,
    dir: randomDir(),
    scatterTarget: { x: 14 - index, y: 2 + (index % 2) },
    color: start.color,
    pause: index * 0.4,
    moveTimer: 0,
    offset: Math.random() * Math.PI * 2,
  }));

  state.pelletsLeft = state.pellets.size + state.powerPellets.size + state.keyShards.size;
  state.gateOpen = false;
  updateHud();
  statusLabel.textContent = 'READY';
  overlayTitle.innerHTML = 'THE MAZE<br><em>IS ALIVE.</em>';
  overlayText.textContent = 'One grid. Four hunters. Can you clear the sector?';
  showOverlay();
}

function startGame() {
  ensureAudio();
  if (state.gameOver) {
    resetBoardState();
  }
  if (state.victory) {
    resetBoardState();
  }
  state.started = true;
  state.running = true;
  state.paused = false;
  state.lastTimestamp = performance.now();
  hideOverlay();
  statusLabel.textContent = 'RUNNING';
}

function togglePause() {
  if (!state.started || state.gameOver || state.victory) return;
  state.paused = !state.paused;
  if (state.paused) {
    statusLabel.textContent = 'PAUSED';
    overlayTitle.innerHTML = 'SYSTEM<br><em>HOLD.</em>';
    overlayText.textContent = 'The grid is locked. Press P or tap start to continue.';
    showOverlay();
  } else {
    hideOverlay();
    statusLabel.textContent = 'RUNNING';
  }
}

function showOverlay() {
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function keyFor(col, row) {
  return `${col},${row}`;
}

function isWallAt(x, y) {
  const col = Math.floor(x);
  const row = Math.floor(y);
  if (col < 0 || row < 0 || row >= BOARD.length || col >= BOARD[row].length) return true;
  const tile = BOARD[row][col];
  return tile === '#';
}

function isGateAt(x, y) {
  if (!state.gateOpen && state.gate.x === Math.floor(x) && state.gate.y === Math.floor(y)) {
    return true;
  }
  return false;
}

function isShockTileAt(x, y) {
  return state.shockTiles.has(keyFor(Math.floor(x), Math.floor(y)));
}

function parseDirection(dirValue) {
  const lookup = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };
  return lookup[dirValue] || { x: 0, y: 0 };
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();
  if (key === 'p' || key === 'escape') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (key === 'enter') {
    if (!state.started || state.gameOver || state.victory) {
      startGame();
    }
    return;
  }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key) || ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    const dir = {
      arrowup: 'up', w: 'up',
      arrowright: 'right', d: 'right',
      arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left',
    }[key] || key;
    if (state.started && !state.gameOver && !state.victory) {
      state.player.nextDir = parseDirection(dir);
    }
  }
}

function updateHud() {
  scoreEl.textContent = String(state.score).padStart(6, '0');
  bestScoreEl.textContent = String(bestScore).padStart(6, '0');
  sideBestEl.textContent = String(bestScore).padStart(6, '0');
  const livesHtml = Array.from({ length: 3 }, (_, index) => `<span class="${index < state.lives ? '' : 'lost'}">♥</span>`).join('');
  livesEl.innerHTML = livesHtml;
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 1200);
}

function update(dt) {
  if (!state.started || state.paused || state.gameOver || state.victory) return;

  state.time += dt;
  state.ghostModeTimer += dt;
  state.safeFlash += dt;
  state.player.invulnerable = Math.max(0, state.player.invulnerable - dt);

  const activeShock = ((Math.sin(state.time * 4) + 1) / 2) > 0.48;
  if (activeShock) {
    const shockPos = getPlayerTile();
    if (state.shockTiles.has(keyFor(shockPos.x, shockPos.y))) {
      if (state.player.invulnerable <= 0 && performance.now() - lastHitTime > 800) {
        lastHitTime = performance.now();
        takeDamage('Shock tile surge!');
      }
    }
  }

  updatePlayer(dt);
  updateGhosts(dt);
  handleCollectibles();
  updateHud();
}

function getPlayerTile() {
  return { x: Math.floor(state.player.x), y: Math.floor(state.player.y) };
}

function handleCollectibles() {
  const tile = keyFor(Math.floor(state.player.x), Math.floor(state.player.y));
  let collected = false;
  if (state.pellets.has(tile)) {
    state.pellets.delete(tile);
    state.score += 10;
    playTone(770, 0.05, 'square', 0.03);
    collected = true;
  }
  if (state.powerPellets.has(tile)) {
    state.powerPellets.delete(tile);
    state.score += 30;
    state.player.invulnerable = 7.5;
    for (const ghost of state.ghosts) {
      ghost.scared = 6.5;
    }
    playTone(520, 0.07, 'triangle', 0.04);
    showToast('POWER CELL!');
    collected = true;
  }
  if (state.keyShards.has(tile)) {
    state.keyShards.delete(tile);
    state.keysFound += 1;
    state.score += 120;
    playTone(880, 0.1, 'triangle', 0.04);
    showToast(`KEY SHARD ${state.keysFound}/3`);
    collected = true;
  }

  const remainingPellets = state.pellets.size + state.powerPellets.size + state.keyShards.size;
  state.pelletsLeft = remainingPellets;
  const gateWasClosed = !state.gateOpen;
  state.gateOpen = state.keysFound >= 3 && remainingPellets === 0;
  if (gateWasClosed && state.gateOpen) showToast('CORE GATE UNLOCKED!');
  if (collected) updateScoreHigh();
}

function updatePlayer(dt) {
  const player = state.player;
  const nextDir = player.nextDir;

  if ((nextDir.x !== 0 || nextDir.y !== 0) && !isWallAt(player.x + nextDir.x, player.y + nextDir.y)) {
    player.dir = nextDir;
  }

  if (player.dir.x !== 0 || player.dir.y !== 0) {
    const moveX = player.x + player.dir.x * dt * player.speed;
    const moveY = player.y + player.dir.y * dt * player.speed;
    const targetX = player.x + player.dir.x * Math.min(dt * player.speed, 0.6);
    const targetY = player.y + player.dir.y * Math.min(dt * player.speed, 0.6);

    if (!isWallAt(targetX, targetY) && !isGateAt(targetX, targetY)) {
      player.x = moveX;
      player.y = moveY;
    } else {
      player.dir = { x: 0, y: 0 };
    }
  }

  if (player.x < 0) player.x = BOARD[0].length - 1;
  if (player.x >= BOARD[0].length) player.x = 0;
  if (player.y < 0) player.y = BOARD.length - 1;
  if (player.y >= BOARD.length) player.y = 0;

  const tile = { x: Math.floor(player.x), y: Math.floor(player.y) };
  const gateCell = { x: state.gate.x, y: state.gate.y };
  if (tile.x === gateCell.x && tile.y === gateCell.y && state.gateOpen) {
    onVictory();
  }
}

function updateGhosts(dt) {
  for (const ghost of state.ghosts) {
    ghost.pause = Math.max(0, ghost.pause - dt);
    if (ghost.scared > 0) {
      ghost.scared = Math.max(0, ghost.scared - dt);
    }
    if (ghost.pause > 0) continue;

    ghost.moveTimer += dt;
    if (ghost.moveTimer < 0.22) continue;
    ghost.moveTimer %= 0.22;

    const dir = chooseGhostDirection(ghost);
    if (dir) {
      ghost.dir = dir;
      const nextX = ghost.x + dir.x;
      const nextY = ghost.y + dir.y;
      if (!isWallAt(nextX, nextY) && !isGateAt(nextX, nextY)) {
        ghost.x = nextX;
        ghost.y = nextY;
      }
    }
  }

  for (const ghost of state.ghosts) {
    if (Math.abs(ghost.x - state.player.x) < 0.65 && Math.abs(ghost.y - state.player.y) < 0.65) {
      if (ghost.scared > 0) {
        ghost.x = 8;
        ghost.y = 7;
        ghost.scared = 0;
        state.score += 200;
        playTone(240, 0.08, 'sawtooth', 0.04);
        showToast('GHOST DOWN!');
      } else if (state.player.invulnerable > 0) {
        state.player.invulnerable = 0;
      } else {
        takeDamage('A ghost caught you.');
      }
    }
  }
}

function chooseGhostDirection(ghost) {
  const options = getValidDirections(ghost.x, ghost.y, ghost.dir);
  if (!options.length) return null;

  if (ghost.type === 'drifter') {
    return options[Math.floor(Math.random() * options.length)];
  }

  if (ghost.type === 'glitch') {
    if (Math.random() < 0.25) {
      return options[Math.floor(Math.random() * options.length)];
    }
  }

  let target = { x: state.player.x, y: state.player.y };
  if (ghost.type === 'oracle') {
    const prediction = {
      x: state.player.x + state.player.dir.x * 2,
      y: state.player.y + state.player.dir.y * 2,
    };
    target = prediction;
  }
  if (ghost.type === 'hunter') {
    target = { x: state.player.x, y: state.player.y };
  }
  if (ghost.type === 'drifter') {
    const opposite = { x: -ghost.dir.x, y: -ghost.dir.y };
    return options.reduce((best, next) => {
      const bestDist = manhattan(best, target); 
      const nextDist = manhattan(next, target);
      if (nextDist < bestDist && !(next.x === opposite.x && next.y === opposite.y)) return next;
      return best;
    }, options[0]);
  }

  if (ghost.scared > 0) {
    target = { x: 0, y: 0 };
  }

  const candidates = options.map((dir) => ({
    dir,
    distance: manhattan({ x: ghost.x + dir.x, y: ghost.y + dir.y }, target),
  }));

  if (ghost.scared > 0) {
    candidates.sort((a, b) => b.distance - a.distance);
  } else {
    candidates.sort((a, b) => a.distance - b.distance);
  }

  return candidates[0].dir;
}

function getValidDirections(x, y, currentDir) {
  const dirs = [];
  for (const dir of DIRS) {
    const nextX = x + dir.x;
    const nextY = y + dir.y;
    const reverse = currentDir && dir.x === -currentDir.x && dir.y === -currentDir.y;
    if (!isWallAt(nextX, nextY) && !isGateAt(nextX, nextY) && !reverse) {
      dirs.push(dir);
    }
  }
  if (!dirs.length && currentDir) {
    const reverseDir = { x: -currentDir.x, y: -currentDir.y };
    const testX = x + reverseDir.x;
    const testY = y + reverseDir.y;
    if (!isWallAt(testX, testY) && !isGateAt(testX, testY)) dirs.push(reverseDir);
  }
  return dirs;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function takeDamage(reason) {
  if (state.player.invulnerable > 0) return;
  state.lives -= 1;
  state.player.invulnerable = 2.2;
  state.player.x = 1;
  state.player.y = 1;
  state.player.dir = { x: 1, y: 0 };
  state.player.nextDir = { x: 1, y: 0 };
  for (const ghost of state.ghosts) {
    ghost.x = ghost.startX;
    ghost.y = ghost.startY;
    ghost.dir = randomDir();
    ghost.pause = 0.6;
    ghost.moveTimer = 0;
    ghost.scared = 0;
  }
  playTone(130, 0.18, 'sawtooth', 0.05);
  showToast(reason || 'A ghost got you!');
  if (state.lives <= 0) {
    onGameOver();
  }
  updateHud();
}

function randomDir() {
  return DIRS[Math.floor(Math.random() * DIRS.length)];
}

function onVictory() {
  state.victory = true;
  state.running = false;
  state.started = true;
  state.gateOpen = true;
  overlayTitle.innerHTML = 'SECTOR<br><em>CLEARED.</em>';
  overlayText.textContent = 'You survived the maze and outran every hunter.';
  showOverlay();
  playTone(740, 0.1, 'triangle', 0.04);
  playTone(960, 0.1, 'triangle', 0.05);
  showToast('SECTOR CLEARED');
}

function onGameOver() {
  state.gameOver = true;
  state.running = false;
  overlayTitle.innerHTML = 'SYSTEM<br><em>FAIL.</em>';
  overlayText.textContent = 'The grid has claimed another runner. Hit start to retry.';
  showOverlay();
  playTone(180, 0.2, 'sawtooth', 0.06);
  showToast('RUN FAILED');
}

function updateScoreHigh() {
  bestScore = Math.max(bestScore, state.score);
  localStorage.setItem('neonMazeBest', String(bestScore));
  updateHud();
}

function render() {
  if (!state.player) return;
  const cols = BOARD[0].length;
  const rows = BOARD.length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pulse = Math.sin(state.time * 0.005) * 0.5 + 0.5;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tile = BOARD[row][col];
      const x = col * TILE;
      const y = row * TILE;
      if (tile === '#') {
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#1b2a45';
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        ctx.fillStyle = '#122339';
        ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
      }

      if (tile === 'G') {
        const active = state.gateOpen;
        ctx.fillStyle = active ? 'rgba(217,255,87,0.18)' : 'rgba(255,77,154,0.12)';
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = active ? '#d9ff57' : '#ff4d9a';
        ctx.lineWidth = active ? 2 : 1.2;
        ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
      }
    }
  }

  for (const key of state.pellets) {
    const [col, row] = key.split(',').map(Number);
    const x = col * TILE + TILE / 2;
    const y = row * TILE + TILE / 2;
    ctx.fillStyle = '#dfe6ff';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const key of state.powerPellets) {
    const [col, row] = key.split(',').map(Number);
    const x = col * TILE + TILE / 2;
    const y = row * TILE + TILE / 2;
    ctx.fillStyle = 'rgba(217,255,87,0.4)';
    ctx.beginPath();
    ctx.arc(x, y, 8 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d9ff57';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const key of state.keyShards) {
    const [col, row] = key.split(',').map(Number);
    const x = col * TILE + TILE / 2;
    const y = row * TILE + TILE / 2;
    ctx.fillStyle = '#7ef9ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fill();
  }

  for (const key of state.shockTiles) {
    const [col, row] = key.split(',').map(Number);
    const x = col * TILE + TILE / 2;
    const y = row * TILE + TILE / 2;
    const active = Math.sin(state.time * 0.008 + (row + col)) > 0;
    ctx.fillStyle = active ? 'rgba(255, 77, 154, 0.8)' : 'rgba(255, 77, 154, 0.14)';
    ctx.beginPath();
    ctx.arc(x, y, active ? 6.5 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPlayer();
  for (const ghost of state.ghosts) drawGhost(ghost);

  if (!state.started && !state.gameOver && !state.victory) {
    ctx.fillStyle = 'rgba(4, 10, 18, 0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawPlayer() {
  const x = state.player.x * TILE + TILE / 2;
  const y = state.player.y * TILE + TILE / 2;
  const radius = 9.3;
  ctx.save();
  ctx.translate(x, y);
  const blink = Math.sin(state.time * 0.02) > 0 ? 1 : 0;
  ctx.fillStyle = '#ffd95f';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0c1020';
  ctx.beginPath();
  ctx.arc(-3, -3, 2.2, 0, Math.PI * 2);
  ctx.arc(3, -3, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, 3);
  ctx.arc(0, 3, 6, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = '#ffd95f';
  ctx.fill();
  if (blink) {
    ctx.strokeStyle = '#0c1020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.lineTo(6, 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGhost(ghost) {
  const x = ghost.x * TILE + TILE / 2;
  const y = ghost.y * TILE + TILE / 2;
  const radius = 9.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = ghost.scared > 0 ? '#7dc5ff' : ghost.color;
  ctx.beginPath();
  ctx.arc(0, -1, radius, Math.PI, 0, false);
  ctx.lineTo(radius, radius + 4);
  ctx.lineTo(radius - 5, radius + 2);
  ctx.lineTo(radius - 10, radius + 4);
  ctx.lineTo(-radius + 10, radius + 4);
  ctx.lineTo(-radius + 5, radius + 2);
  ctx.lineTo(-radius, radius + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f1f7ff';
  ctx.beginPath();
  ctx.arc(-3, -1, 2, 0, Math.PI * 2);
  ctx.arc(3, -1, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#081018';
  ctx.beginPath();
  ctx.arc(-3, -1, 0.9, 0, Math.PI * 2);
  ctx.arc(3, -1, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function gameLoop(timestamp) {
  if (!state.lastTimestamp) state.lastTimestamp = timestamp;
  const dt = (timestamp - state.lastTimestamp) / 1000;
  state.lastTimestamp = timestamp;

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

requestAnimationFrame(gameLoop);

setInterval(() => {
  if (!state.gameOver && !state.victory && state.started && !state.paused) {
    updateScoreHigh();
  }
}, 250);
