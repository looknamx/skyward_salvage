import Phaser from 'phaser';
import { GameScene } from './GameScene.ts';
import { MOBILE_INFO } from '../shared/game.ts';
import type { ClientAction, GameState, MatchSummary, MobileKind, ServerEvent } from '../shared/game.ts';
import './style.css';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const scene = new GameScene();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280, height: 720,
  transparent: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [scene],
});

let playerId = '';
let gameState: GameState | null = null;
let selectedMobile: MobileKind = 'loom';
let teleportMode = false;
let specialMode = false;
let lastOwnTurn = 0;
let toastTimer: number | undefined;
const pressed = { left: false, right: false };
const touchPressed = { left: false, right: false };
const touchReleaseHandlers: Array<() => void> = [];
let sentDirection: -1 | 0 | 1 = 0;
let chargeStartedAt: number | null = null;
let chargeFrame = 0;
let suppressFireClick = false;
const CHARGE_MS = 2400;
const SESSION_KEY = 'skyward-room-session';
let socket: WebSocket | null = null;
let reconnectTimer = 0;
let reconnectAttempt = 0;
let resumePending = false;
let leavingRoom = false;
const bgm = new Audio('/assets/sound/BGM.mp3');
const fireSound = new Audio('/assets/sound/FIRE.mp3');
const itemSound = new Audio('/assets/sound/USE_ITEM.mp3');
const movementSound = new Audio('/assets/sound/MOVEMENT.mp3');
const hitSound = new Audio('/assets/sound/HIT.mp3');
const dropSound = new Audio('/assets/sound/DROP_ITEM.mp3');
const clockSound = new Audio('/assets/sound/CLOCK_TICKING.mp3');
bgm.loop = true;
movementSound.loop = true;
clockSound.loop = true;
bgm.volume = 0.35;
fireSound.volume = 0.7;
itemSound.volume = 0.7;
movementSound.volume = 0.45;
hitSound.volume = 0.7;
dropSound.volume = 0.7;
clockSound.volume = 0.55;
let soundEnabled = true;
let audioWantsStart = false;
let movementStopTimer = 0;
let hitTimer = 0;

function startBgm(): void {
  if (soundEnabled && audioWantsStart && bgm.paused) void bgm.play().catch(() => { /* Retry on the next user gesture. */ });
}
function playEffect(sound: HTMLAudioElement): void {
  if (!soundEnabled) return;
  try { sound.currentTime = 0; } catch { /* The file may still be loading. */ }
  void sound.play().catch(() => { /* Audio needs a user gesture on some devices. */ });
}
function stopClockSound(): void {
  clockSound.pause();
  try { clockSound.currentTime = 0; } catch { /* The file may still be loading. */ }
}
function stopMovementSound(): void {
  clearTimeout(movementStopTimer);
  movementStopTimer = 0;
  movementSound.pause();
  try { movementSound.currentTime = 0; } catch { /* The file may still be loading. */ }
}
function updateMovementSound(previous: GameState | null, current: GameState): void {
  if (!soundEnabled || current.phase !== 'playing' || previous?.phase !== 'playing' || previous.activeId !== current.activeId || !current.activeId) {
    stopMovementSound();
    return;
  }
  const before = previous.players.find(player => player.id === current.activeId);
  const after = current.players.find(player => player.id === current.activeId);
  const distance = before && after ? Math.abs(after.x - before.x) : 0;
  if (distance < 0.1 || distance > 32) return;
  if (movementSound.paused) void movementSound.play().catch(() => { /* Retry when more movement arrives. */ });
  clearTimeout(movementStopTimer);
  movementStopTimer = window.setTimeout(stopMovementSound, 300);
}
document.addEventListener('pointerdown', startBgm);
document.addEventListener('keydown', startBgm);

function send(action: ClientAction): void {
  if (socket?.readyState !== WebSocket.OPEN) { toast('กำลังเชื่อมต่อเซิร์ฟเวอร์'); return; }
  socket.send(JSON.stringify(action));
}
function toast(message: string): void {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove('show'), 3200);
}
function pickMobile(kind: MobileKind): void {
  selectedMobile = kind;
  document.querySelectorAll<HTMLButtonElement>('.mobile-option').forEach(button => button.classList.toggle('selected', button.dataset.mobile === kind));
  if (gameState?.phase === 'lobby') send({ type: 'select', mobile: kind });
}
document.querySelectorAll<HTMLButtonElement>('.mobile-option').forEach(button => button.addEventListener('click', () => pickMobile(button.dataset.mobile as MobileKind)));

function userName(): string {
  const value = $('name') as HTMLInputElement;
  const name = value.value.trim();
  if (!name) { $('landing-error').textContent = 'กรุณาใส่ชื่อก่อน'; value.focus(); }
  return name;
}
function enterRoom(create: boolean): void {
  const name = userName();
  if (!name) return;
  $('landing-error').textContent = '';
  if (create) { audioWantsStart = true; startBgm(); send({ type: 'create', name, mobile: selectedMobile }); }
  else {
    const code = (($('room-code') as HTMLInputElement).value || '').trim().toUpperCase();
    if (code.length !== 6) { $('landing-error').textContent = 'รหัสห้องมี 6 ตัว'; return; }
    audioWantsStart = true;
    startBgm();
    send({ type: 'join', code, name, mobile: selectedMobile });
  }
}
$('create').addEventListener('click', () => enterRoom(true));
$('join').addEventListener('click', () => enterRoom(false));
$('start').addEventListener('click', () => send({ type: 'start' }));
($('match-mode') as HTMLSelectElement).addEventListener('change', event => send({ type: 'set-mode', mode: (event.target as HTMLSelectElement).value as GameState['mode'] }));
$('copy-link').addEventListener('click', async () => {
  if (!gameState) return;
  const link = `${location.origin}/?room=${gameState.code}`;
  try { await navigator.clipboard.writeText(link); toast('คัดลอกลิงก์แล้ว'); }
  catch { toast(link); }
});
$('again').addEventListener('click', () => {
  leavingRoom = true;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage can be unavailable. */ }
  socket?.close();
  location.href = '/';
});

const angleInput = $('angle') as HTMLInputElement;
const powerMeter = $('power') as HTMLProgressElement;
const fireButton = $('fire') as HTMLButtonElement;
function updateAim(): void {
  $('angle-value').textContent = `${angleInput.value}°`;
  $('power-value').textContent = `${Math.round(powerMeter.value)}%`;
  const facing = gameState?.players.find(player => player.id === playerId)?.facing ?? 1;
  $('dial-needle').style.transform = `translateX(-50%) rotate(${facing * (90 - Number(angleInput.value))}deg)`;
}
angleInput.addEventListener('input', updateAim);
updateAim();
function setPower(value: number): void {
  powerMeter.value = Math.max(20, Math.min(100, value));
  updateAim();
}
function fireChargedShot(): void {
  const angle = Number(angleInput.value), power = Math.round(powerMeter.value);
  if (teleportMode) send({ type: 'item', item: 'teleport', angle, power });
  else send({ type: 'fire', angle, power, special: specialMode });
}
function chargePower(): void {
  if (chargeStartedAt === null) return;
  setPower(20 + Math.min(1, (performance.now() - chargeStartedAt) / CHARGE_MS) * 80);
  if (powerMeter.value < 100) chargeFrame = requestAnimationFrame(chargePower);
}
function beginCharge(): void {
  if (!canControl() || fireButton.disabled || chargeStartedAt !== null) return;
  chargeStartedAt = performance.now();
  setPower(20);
  fireButton.classList.add('charging');
  chargeFrame = requestAnimationFrame(chargePower);
}
function endCharge(shouldFire: boolean): void {
  if (chargeStartedAt === null) return;
  const elapsed = performance.now() - chargeStartedAt;
  chargeStartedAt = null;
  cancelAnimationFrame(chargeFrame);
  fireButton.classList.remove('charging');
  if (!shouldFire || !canControl()) { setPower(20); return; }
  setPower(20 + Math.min(1, elapsed / CHARGE_MS) * 80);
  fireChargedShot();
  suppressFireClick = true;
  window.setTimeout(() => { suppressFireClick = false; }, 0);
}
fireButton.addEventListener('pointerdown', event => {
  if (!canControl()) return;
  event.preventDefault();
  suppressFireClick = false;
  fireButton.setPointerCapture(event.pointerId);
  beginCharge();
});
fireButton.addEventListener('pointerup', () => endCharge(true));
fireButton.addEventListener('pointercancel', () => endCharge(false));
fireButton.addEventListener('lostpointercapture', () => endCharge(false));
fireButton.addEventListener('click', event => {
  if (suppressFireClick) { event.preventDefault(); return; }
  if (event.detail === 0 && canControl()) { setPower(20); fireChargedShot(); }
});
for (const eventName of ['contextmenu', 'selectstart', 'dragstart']) {
  fireButton.addEventListener(eventName, event => event.preventDefault());
}
fireButton.addEventListener('touchstart', event => event.preventDefault(), { passive: false });
$('item-double').addEventListener('click', () => send({ type: 'item', item: 'double' }));
$('item-repair').addEventListener('click', () => send({ type: 'item', item: 'repair' }));
$('item-teleport').addEventListener('click', () => { setTeleportMode(!teleportMode); if (teleportMode) toast('เล็งมุม กดยิงค้างเพื่อเพิ่มพลัง แล้วปล่อยเพื่อย้าย'); });
$('item-special').addEventListener('click', () => { if (canControl()) setSpecialMode(!specialMode); });
function setTeleportMode(value: boolean): void {
  if (value) setSpecialMode(false);
  teleportMode = value;
  $('item-teleport').classList.toggle('selected', value);
  $('fire').classList.toggle('portal-armed', value);
  $('fire').textContent = value ? 'PORTAL' : specialMode ? 'SKILL' : 'FIRE';
}
function setSpecialMode(value: boolean): void {
  if (value) setTeleportMode(false);
  specialMode = value;
  $('item-special').classList.toggle('selected', value);
  $('fire').classList.toggle('special-armed', value);
  $('fire').textContent = value ? 'SKILL' : teleportMode ? 'PORTAL' : 'FIRE';
}

function canControl(): boolean {
  return socket?.readyState === WebSocket.OPEN && !resumePending && gameState?.phase === 'playing' && gameState.activeId === playerId;
}
function syncMovement(): void {
  const left = pressed.left || touchPressed.left;
  const right = pressed.right || touchPressed.right;
  const direction: -1 | 0 | 1 = !canControl() ? 0 : left === right ? 0 : left ? -1 : 1;
  if (direction === sentDirection) return;
  sentDirection = direction;
  if (socket?.readyState === WebSocket.OPEN && !resumePending) send({ type: 'move', direction });
}
function releaseMovement(): void {
  pressed.left = false; pressed.right = false;
  touchReleaseHandlers.forEach(release => release());
  syncMovement();
}
function adjustAngle(amount: number): void {
  angleInput.value = String(Math.max(10, Math.min(80, Number(angleInput.value) + amount)));
  updateAim();
}

const settingsToggle = $('settings-toggle') as HTMLButtonElement;
const settingsPopup = $('settings-popup');
const touchToggle = $('touch-controls-toggle') as HTMLInputElement;
const touchDpad = $('touch-dpad');
const soundToggle = $('sound-toggle') as HTMLInputElement;
function closeSettings(): void {
  settingsPopup.classList.add('hidden');
  settingsToggle.setAttribute('aria-expanded', 'false');
}
function setTouchControls(visible: boolean): void {
  touchToggle.checked = visible;
  touchDpad.classList.toggle('hidden', !visible);
  if (!visible) touchReleaseHandlers.forEach(release => release());
  try { localStorage.setItem('skyward-touch-controls', visible ? 'on' : 'off'); } catch { /* Storage can be unavailable. */ }
}
try {
  const savedTouchControls = localStorage.getItem('skyward-touch-controls');
  setTouchControls(savedTouchControls === null ? matchMedia('(pointer: coarse)').matches : savedTouchControls === 'on');
} catch { setTouchControls(matchMedia('(pointer: coarse)').matches); }
settingsToggle.addEventListener('click', () => {
  const opening = settingsPopup.classList.contains('hidden');
  settingsPopup.classList.toggle('hidden', !opening);
  settingsToggle.setAttribute('aria-expanded', String(opening));
});
$('settings-close').addEventListener('click', closeSettings);
touchToggle.addEventListener('change', () => setTouchControls(touchToggle.checked));
function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  soundToggle.checked = enabled;
  if (enabled) startBgm();
  else {
    bgm.pause(); fireSound.pause(); itemSound.pause(); hitSound.pause(); dropSound.pause(); stopClockSound();
    clearTimeout(hitTimer);
    stopMovementSound();
  }
  try { localStorage.setItem('skyward-sound', enabled ? 'on' : 'off'); } catch { /* Storage can be unavailable. */ }
}
try { setSoundEnabled(localStorage.getItem('skyward-sound') !== 'off'); }
catch { setSoundEnabled(true); }
soundToggle.addEventListener('change', () => setSoundEnabled(soundToggle.checked));
document.addEventListener('pointerdown', event => {
  if (!settingsPopup.classList.contains('hidden') && !settingsPopup.contains(event.target as Node) && !settingsToggle.contains(event.target as Node)) closeSettings();
});
window.addEventListener('keydown', event => { if (event.key === 'Escape') closeSettings(); });

document.querySelectorAll<HTMLButtonElement>('#touch-dpad button').forEach(button => {
  const direction = button.dataset.direction as 'left' | 'right' | 'up' | 'down';
  let activePointer: number | null = null;
  let repeatDelay = 0;
  let repeatTimer = 0;
  const release = (): void => {
    if (activePointer === null) return;
    activePointer = null;
    clearTimeout(repeatDelay);
    clearInterval(repeatTimer);
    if (direction === 'left' || direction === 'right') {
      touchPressed[direction] = false;
      syncMovement();
    }
  };
  touchReleaseHandlers.push(release);
  button.addEventListener('pointerdown', event => {
    if (!canControl() || activePointer !== null) return;
    event.preventDefault();
    activePointer = event.pointerId;
    button.setPointerCapture(event.pointerId);
    if (direction === 'left' || direction === 'right') {
      touchPressed[direction] = true;
      syncMovement();
    } else {
      const amount = direction === 'up' ? 1 : -1;
      adjustAngle(amount);
      repeatDelay = window.setTimeout(() => {
        repeatTimer = window.setInterval(() => { if (canControl()) adjustAngle(amount); else release(); }, 80);
      }, 280);
    }
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(eventName, event => { if (activePointer === (event as PointerEvent).pointerId) release(); });
  }
});
window.addEventListener('keydown', event => {
  if (!canControl() || (event.target instanceof HTMLInputElement && event.target.type !== 'range')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    pressed[event.key === 'ArrowLeft' ? 'left' : 'right'] = true;
    syncMovement(); event.preventDefault();
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    adjustAngle(event.key === 'ArrowUp' ? 1 : -1); event.preventDefault();
  } else if (event.code === 'KeyR') {
    if (!event.repeat) { releaseMovement(); send({ type: 'turn' }); }
    event.preventDefault();
  } else if (event.code === 'Space') { if (!event.repeat) beginCharge(); event.preventDefault(); }
});
window.addEventListener('keyup', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    pressed[event.key === 'ArrowLeft' ? 'left' : 'right'] = false;
    syncMovement(); event.preventDefault();
  } else if (event.code === 'Space') { endCharge(true); event.preventDefault(); }
});
window.addEventListener('blur', () => { releaseMovement(); endCharge(false); });

function render(state: GameState): void {
  const previous = gameState;
  if (previous?.phase === 'finished' && state.phase === 'playing') {
    setTeleportMode(false);
    setSpecialMode(false);
    $('result-stats').replaceChildren();
  }
  if (previous?.phase === 'playing') {
    const newDrop = state.drops.find(drop => !previous.drops.some(old => old.id === drop.id));
    if (newDrop) { playEffect(dropSound); toast('ไอเทมตกลงมาจากฟ้า! เดินไปเก็บเมื่อช่องว่าง'); }
  }
  updateMovementSound(gameState, state);
  gameState = state;
  scene.setSnapshot(state, playerId);
  $('landing').classList.add('hidden');
  $('lobby').classList.toggle('hidden', state.phase !== 'lobby');
  $('hud').classList.toggle('hidden', state.phase === 'lobby');
  $('result').classList.toggle('hidden', state.phase !== 'finished');
  if (state.phase === 'lobby') {
    $('lobby-code').textContent = state.code;
    const modeSelect = $('match-mode') as HTMLSelectElement;
    modeSelect.value = state.mode;
    modeSelect.disabled = state.hostId !== playerId;
    $('lobby-players').replaceChildren(...state.players.map((player, index) => {
      const element = document.createElement('div');
      element.className = 'lobby-player';
      const name = document.createElement('span'); name.textContent = player.name + (player.id === state.hostId ? ' ★' : '') + (state.mode === 'teams' ? ` · ทีม ${index % 2 === 0 ? 'A' : 'B'}` : '') + (player.connected ? '' : ' · หลุด');
      const mobile = document.createElement('b'); mobile.textContent = MOBILE_INFO[player.mobile].label;
      element.append(name, mobile);
      return element;
    }));
    ($('start') as HTMLButtonElement).disabled = state.hostId !== playerId || state.players.some(player => !player.connected) || state.players.length < 2 || (state.mode === 'teams' && state.players.length !== 4);
    $('lobby-status').textContent = `${state.players.filter(player => player.connected).length}/4 คนเข้าห้องแล้ว${state.mode === 'teams' ? ' · ทีม A/B สลับตามลำดับเข้าห้อง' : ''}`;
    return;
  }
  $('player-strip').replaceChildren(...state.players.map(player => {
    const card = document.createElement('div');
    card.className = `player-card${player.id === state.activeId ? ' active' : ''}${player.hp <= 0 ? ' dead' : ''}`;
    card.style.setProperty('--player-color', `#${MOBILE_INFO[player.mobile].color.toString(16).padStart(6, '0')}`);
    const portrait = document.createElement('img'); portrait.className = 'player-portrait';
    portrait.src = `/assets/characters/${player.mobile}.png`; portrait.alt = MOBILE_INFO[player.mobile].label;
    const info = document.createElement('div'); info.className = 'player-info';
    const head = document.createElement('div'); head.className = 'player-head';
    const name = document.createElement('b'); name.textContent = player.name + (state.mode === 'teams' ? ` · ${player.team === 0 ? 'A' : 'B'}` : '');
    const meta = document.createElement('small'); meta.textContent = `${MOBILE_INFO[player.mobile].label} ${player.hp}/100`;
    head.append(name, meta);
    const track = document.createElement('div'); track.className = 'hp-track';
    const fill = document.createElement('div'); fill.className = 'hp-fill'; fill.style.width = `${player.hp}%`;
    track.append(fill); info.append(head, track); card.append(portrait, info);
    return card;
  }));
  $('wind').textContent = `WIND ${state.wind < 0 ? '←' : '→'} ${Math.abs(state.wind)}`;
  $('turn').textContent = `TURN ${String(state.turn).padStart(2, '0')}`;
  $('turn-banner').textContent = state.activeId === playerId ? 'เทิร์นของคุณ • เล็งแล้ว FIRE' : state.message;
  const me = state.players.find(player => player.id === playerId);
  const canAct = socket?.readyState === WebSocket.OPEN && !resumePending && state.phase === 'playing' && state.activeId === playerId && !!me && me.hp > 0;
  if (canAct && state.turn !== lastOwnTurn) {
    lastOwnTurn = state.turn;
    releaseMovement();
    setTeleportMode(false);
    setSpecialMode(false);
    angleInput.value = '45';
    setPower(20);
    updateAim();
  }
  for (const id of ['angle', 'fire']) ($<HTMLInputElement | HTMLButtonElement>(id)).disabled = !canAct;
  ($('item-special') as HTMLButtonElement).disabled = !canAct || !me?.specialAvailable;
  $('count-special').textContent = me?.specialAvailable ? '1' : '0';
  document.querySelectorAll<HTMLButtonElement>('#touch-dpad button').forEach(button => { button.disabled = !canAct; });
  for (const item of ['double', 'repair', 'teleport'] as const) {
    ($<HTMLButtonElement>(`item-${item}`)).disabled = !canAct || !me?.items[item] || (item === 'double' && me.doubleArmed);
    $(`count-${item}`).textContent = String(me?.items[item] ?? 0);
  }
  $('item-double').classList.toggle('selected', !!me?.doubleArmed);
  if (!canAct) { endCharge(false); setTeleportMode(false); setSpecialMode(false); releaseMovement(); }
  if (state.phase === 'finished') {
    $('result-title').textContent = state.mode === 'teams' && state.winnerTeam !== null ? `ทีม ${state.winnerTeam === 0 ? 'A' : 'B'} ชนะ!` : state.winnerId ? `${state.players.find(player => player.id === state.winnerId)?.name ?? ''} ชนะ!` : 'เสมอ!';
    const connectedCount = state.players.filter(player => player.connected).length;
    const enoughPlayers = connectedCount >= 2 && (state.mode !== 'teams' || connectedCount === 4);
    $('ready-status').textContent = enoughPlayers ? `พร้อมเล่นอีกครั้ง ${state.rematchReady.length}/${connectedCount} คน` : state.mode === 'teams' ? 'รีแมตช์ทีมต้องมีครบ 4 คน' : 'รีแมตช์ต้องมีอย่างน้อย 2 คน';
    $('rematch-ready').textContent = state.rematchReady.includes(playerId) ? 'ยกเลิกพร้อม' : 'พร้อมเล่นอีกครั้ง';
    ($('rematch-ready') as HTMLButtonElement).disabled = !enoughPlayers;
  }
  updateAim();
  updateTimer();
}
function renderSummary(summary: MatchSummary): void {
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['ผู้เล่น', 'ยิง/โดน', 'ดาเมจ', 'รับดาเมจ', 'ไอเทม']) {
    const cell = document.createElement('th'); cell.textContent = label; headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement('tbody');
  for (const player of summary.players) {
    const row = document.createElement('tr');
    for (const value of [player.name + (summary.mode === 'teams' ? ` (${player.team === 0 ? 'A' : 'B'})` : ''), `${player.stats.shots}/${player.stats.hits}`, String(player.stats.damageDealt), String(player.stats.damageTaken), `${player.stats.itemsUsed} · เก็บ ${player.stats.pickups}`]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  $('result-stats').replaceChildren(table);
}
$('rematch-ready').addEventListener('click', () => send({ type: 'rematch-ready', ready: !gameState?.rematchReady.includes(playerId) }));
function updateTimer(): void {
  if (!gameState || gameState.phase !== 'playing' || !gameState.activeId) { stopClockSound(); return; }
  const seconds = Math.max(0, Math.ceil((gameState.deadline - Date.now()) / 1000));
  $('timer').textContent = `${seconds}s`;
  if (seconds > 0 && seconds <= 10 && soundEnabled && audioWantsStart && socket?.readyState === WebSocket.OPEN && !resumePending) {
    if (clockSound.paused) void clockSound.play().catch(() => { /* Audio needs a user gesture on some devices. */ });
  } else if (!clockSound.paused) stopClockSound();
}
setInterval(updateTimer, 100);

const roomFromLink = new URLSearchParams(location.search).get('room');
if (roomFromLink) ($('room-code') as HTMLInputElement).value = roomFromLink.toUpperCase();
function savedSession(): { code: string; token: string } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    return saved && typeof saved.code === 'string' && typeof saved.token === 'string' ? saved : null;
  } catch { return null; }
}
function connect(): void {
  clearTimeout(reconnectTimer);
  const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket = connection;
  connection.addEventListener('open', () => {
    reconnectAttempt = 0;
    const saved = savedSession();
    if (saved && (!roomFromLink || roomFromLink.toUpperCase() === saved.code)) {
      resumePending = true;
      send({ type: 'resume', token: saved.token });
    } else {
      if (saved) { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage can be unavailable. */ } }
      $('connection-status').classList.add('hidden');
    }
  });
  connection.addEventListener('message', event => {
    try {
      const message = JSON.parse(event.data) as ServerEvent;
      if (message.type === 'welcome') {
        playerId = message.id;
        resumePending = false;
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: message.code, token: message.token })); } catch { /* Storage can be unavailable. */ }
        history.replaceState(null, '', `/?room=${message.code}`);
        $('connection-status').classList.add('hidden');
        if (message.resumed) { audioWantsStart = true; startBgm(); toast('กลับเข้าห้องแล้ว'); }
      } else if (message.type === 'state') render(message.state);
      else if (message.type === 'shot') { scene.showShot(message.shot); if (message.shot.kind === 'damage') playEffect(fireSound); }
      else if (message.type === 'hit') { clearTimeout(hitTimer); hitTimer = window.setTimeout(() => playEffect(hitSound), 820); }
      else if (message.type === 'item-used' || message.type === 'item-picked') {
        playEffect(itemSound);
        if (message.type === 'item-picked' && message.playerId === playerId) toast('เก็บไอเทมได้แล้ว');
      } else if (message.type === 'match-summary') renderSummary(message.summary);
      else if (message.type === 'error') {
        toast(message.message);
        $('landing-error').textContent = message.message;
        if (resumePending) {
          resumePending = false;
          try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage can be unavailable. */ }
          gameState = null; playerId = '';
          $('landing').classList.remove('hidden');
          $('lobby').classList.add('hidden'); $('hud').classList.add('hidden'); $('result').classList.add('hidden');
          $('connection-status').classList.add('hidden');
          history.replaceState(null, '', '/');
        }
      }
    } catch { toast('อ่านข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ'); }
  });
  connection.addEventListener('close', () => {
    if (socket !== connection || leavingRoom) return;
    stopMovementSound(); stopClockSound(); bgm.pause(); releaseMovement(); endCharge(false);
    $('connection-status').classList.remove('hidden');
    reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** reconnectAttempt++, 8000));
  });
  connection.addEventListener('error', () => connection.close());
}
connect();
