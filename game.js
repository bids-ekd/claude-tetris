'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Tipo de pieza "tuerca" y marcador de su agujero central.
// HOLE no es un tipo de pieza: es un valor de celda que viaja en la matriz de
// la pieza y queda fijado en el tablero, marcando un hueco permanente.
const NUT = 8;
const HOLE = 9;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - gris metálico
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[NUT,NUT,NUT],[NUT,HOLE,NUT],[NUT,NUT,NUT]], // Tuerca - reto: agujero permanente
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridLineColor = '#22222e';
let boardBgColor = '#1a1a25';

function updateThemeColors() {
  gridLineColor = getComputedStyle(document.body).getPropertyValue('--grid-line-color').trim();
  boardBgColor = getComputedStyle(document.body).getPropertyValue('--board-bg').trim();
}

function applyTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  themeToggle.checked = isLight;
  updateThemeColors();
}

function initTheme() {
  const saved = localStorage.getItem('tetris-theme');
  applyTheme(saved === 'light');
}

themeToggle.addEventListener('change', () => {
  const isLight = themeToggle.checked;
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    // Una fila con el agujero de una tuerca (HOLE) nunca cuenta como completa:
    // ese hueco es permanente y no se puede rellenar.
    if (board[r].every(v => v !== 0 && v !== HOLE)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return; // no revelar/redibujar la siguiente pieza: la partida acabó
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  // Delega en la función de dibujo de la skin activa (ver sección "Skins
  // visuales" al final del archivo). La firma pública se mantiene idéntica
  // para no romper las llamadas existentes desde draw()/drawNext().
  currentSkin.drawBlock(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!gameOver) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // current piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (paused || gameOver) return; // frame residual ya obsoleto
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece(); // puede disparar endGame() → gameOver = true
    }
  }
  draw(); // pinta el estado final una última vez
  if (gameOver || paused) return; // no se programa otro frame
  animId = requestAnimationFrame(loop);
}

function init() {
  initTheme();
  initSkin();
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Skins visuales ----
// Cada skin define su propia paleta y su propia función drawBlock(). La
// variable `currentSkin` decide en tiempo de ejecución qué implementación usa
// la función pública drawBlock() (definida más arriba, junto a draw()).

const NEON_COLORS = [
  null,
  '#00e5ff', // I - cian neón
  '#fff200', // O - amarillo neón
  '#e040fb', // T - magenta neón
  '#39ff14', // S - verde neón
  '#ff1744', // Z - rojo neón
  '#2979ff', // J - azul neón
  '#ff9100', // L - naranja neón
  '#e0e0e0', // Tuerca - plata neón
];

const PASTEL_COLORS = [
  null,
  '#b3e5fc', // I - celeste pastel
  '#fff9c4', // O - amarillo pastel
  '#e1bee7', // T - lila pastel
  '#c8e6c9', // S - verde pastel
  '#ffcdd2', // Z - rojo pastel
  '#bbdefb', // J - azul pastel
  '#ffe0b2', // L - naranja pastel
  '#cfd8dc', // Tuerca - gris pastel
];

// Aclara (percent > 0) u oscurece (percent < 0) un color hex, p.ej. '#4dd0e1'.
function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(255 * percent);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `rgb(${r}, ${g}, ${b})`;
}

// Dibuja el agujero permanente de la tuerca como un círculo del color de
// fondo del tablero. Todas las skins reutilizan esta misma forma para que el
// jugador siempre reconozca la señal, aunque cambien color/estilo del trazo.
function drawHoleCircle(context, x, y, size, radiusFactor, strokeStyle) {
  const cx = x * size + size / 2;
  const cy = y * size + size / 2;
  const radius = size * radiusFactor;
  context.fillStyle = boardBgColor;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = strokeStyle;
  context.lineWidth = 1;
  context.stroke();
}

// Retro (default): reproduce exactamente el render histórico del juego.
function drawBlockRetro(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = colorIndex === HOLE ? COLORS[NUT] : COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (colorIndex === HOLE) drawHoleCircle(context, x, y, size, 0.3, 'rgba(0,0,0,0.3)');
  context.globalAlpha = 1;
}

// Neon: paleta saturada sobre fondo oscuro, con brillo vía shadowBlur/shadowColor.
function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = colorIndex === HOLE ? NEON_COLORS[NUT] : NEON_COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // El glow no debe "contaminar" el grid ni el resto de bloques: se resetea
  // antes de seguir dibujando (highlight, agujero) y al final de la función.
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 3);
  if (colorIndex === HOLE) drawHoleCircle(context, x, y, size, 0.3, color);
  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

// Pastel: colores suaves y esquinas redondeadas (con fallback si roundRect no existe).
function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = colorIndex === HOLE ? PASTEL_COLORS[NUT] : PASTEL_COLORS[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  const radius = size * 0.2;
  const hasRoundRect = typeof context.roundRect === 'function';
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  if (hasRoundRect) {
    context.beginPath();
    context.roundRect(px, py, w, h, radius);
    context.fill();
  } else {
    context.fillRect(px, py, w, h);
  }
  context.fillStyle = 'rgba(255,255,255,0.35)';
  if (hasRoundRect) {
    context.beginPath();
    context.roundRect(px, py, w, h * 0.35, [radius, radius, 0, 0]);
    context.fill();
  } else {
    context.fillRect(px, py, w, 4);
  }
  if (colorIndex === HOLE) drawHoleCircle(context, x, y, size, 0.28, 'rgba(0,0,0,0.15)');
  context.globalAlpha = 1;
}

// Pixel art: rejilla de sub-píxeles con dithering en vez de un fillRect plano.
function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = colorIndex === HOLE ? COLORS[NUT] : COLORS[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(px, py, w, h);
  const sub = w / 3;
  const light = shadeColor(color, 0.25);
  const dark = shadeColor(color, -0.25);
  for (let sr = 0; sr < 3; sr++) {
    for (let sc = 0; sc < 3; sc++) {
      if ((sr + sc) % 2 === 0) continue; // dithering: solo celdas alternas
      context.fillStyle = (sr + sc) % 3 === 0 ? light : dark;
      context.fillRect(px + sc * sub, py + sr * sub, sub, sub);
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.4)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  if (colorIndex === HOLE) drawHoleCircle(context, x, y, size, 0.3, 'rgba(0,0,0,0.4)');
  context.globalAlpha = 1;
}

const SKINS = [
  { id: 'retro', label: 'Retro', drawBlock: drawBlockRetro },
  { id: 'neon', label: 'Neón', drawBlock: drawBlockNeon },
  { id: 'pastel', label: 'Pastel', drawBlock: drawBlockPastel },
  { id: 'pixel', label: 'Pixel Art', drawBlock: drawBlockPixel },
];

const skinSelect = document.getElementById('skin-select');
let currentSkin = SKINS[0];

function applySkin(id) {
  currentSkin = SKINS.find(s => s.id === id) || SKINS[0];
  SKINS.forEach(s => document.body.classList.remove(`skin-${s.id}`));
  document.body.classList.add(`skin-${currentSkin.id}`);
  if (skinSelect) skinSelect.value = currentSkin.id;
  // La skin puede cambiar variables CSS (--board-bg/--grid-line-color) que
  // afectan boardBgColor/gridLineColor usados por el propio dibujo.
  updateThemeColors();
}

function initSkin() {
  // Solo fija el estado (clase en <body>, currentSkin, colores de tema); no
  // fuerza un draw()/drawNext() aquí porque initSkin() se llama al principio
  // de init(), antes de que board/current/next se (re)creen — dibujar en ese
  // punto pintaría un frame con el estado obsoleto de la partida anterior.
  // El primer requestAnimationFrame (o spawn(), en el caso de drawNext) ya se
  // encarga de pintar con la skin correcta una vez el estado es válido.
  const saved = localStorage.getItem('tetris-skin');
  applySkin(SKINS.some(s => s.id === saved) ? saved : SKINS[0].id);
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    localStorage.setItem('tetris-skin', skinSelect.value);
    applySkin(skinSelect.value);
    // Redibujado inmediato: aquí sí board/current/next ya existen (el select
    // solo es interactuable con una partida en curso), y queremos ver el
    // cambio al instante aunque el juego esté en pausa.
    draw();
    drawNext();
  });
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
