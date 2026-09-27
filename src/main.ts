import Phaser from 'phaser';
import { GameScene } from './GameScene.ts';
import { equipmentBonus, maxHpFor, MIN_POWER, MOBILE_INFO, TURN_MOVE_LIMIT } from '../shared/game.ts';
import type { ClientAction, EquipmentSet, EquipmentSlot, GameState, MatchSummary, OrdinaryMobileKind, ServerEvent } from '../shared/game.ts';
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
let teleportMode = false;
let specialMode = false;
let lastOwnTurn = 0;
let toastTimer: number | undefined;
const keysDown = new Set<string>();
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
const windSound = new Audio('/assets/sound/WIND.mp3');
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
windSound.volume = 0.65;
let bgmEnabled = true;
let sfxEnabled = true;
let audioWantsStart = false;
let movementStopTimer = 0;
let hitTimer = 0;

function startBgm(): void {
  if (bgmEnabled && audioWantsStart && bgm.paused) void bgm.play().catch(() => { /* Retry on the next user gesture. */ });
}
function playEffect(sound: HTMLAudioElement): void {
  if (!sfxEnabled) return;
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
  if (!sfxEnabled || current.phase !== 'playing' || previous?.phase !== 'playing' || previous.activeId !== current.activeId || !current.activeId) {
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
function pickMobile(kind: OrdinaryMobileKind): void {
  if (gameState?.phase === 'lobby' && !gameState.lobbyReady.includes(playerId) && !gameState.players.find(player => player.id === playerId)?.randomUsed) send({ type: 'select', mobile: kind });
}
document.querySelectorAll<HTMLButtonElement>('.mobile-option').forEach(button => button.addEventListener('click', () => pickMobile(button.dataset.mobile as OrdinaryMobileKind)));
document.querySelectorAll<HTMLButtonElement>('.equipment-row button').forEach(button => button.addEventListener('click', () => {
  const me = gameState?.players.find(player => player.id === playerId);
  if (gameState?.phase !== 'lobby' || !me || gameState.lobbyReady.includes(playerId)) return;
  const slot = button.closest<HTMLElement>('.equipment-row')?.dataset.slot as EquipmentSlot;
  const set = button.dataset.set === 'none' ? null : button.dataset.set as EquipmentSet;
  send({ type: 'equip', slot, set });
}));
$('random-mobile').addEventListener('click', () => {
  const me = gameState?.players.find(player => player.id === playerId);
  if (gameState?.phase === 'lobby' && me && !me.randomUsed && !gameState.lobbyReady.includes(playerId)) send({ type: 'random-mobile' });
});

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
  if (create) { audioWantsStart = true; startBgm(); send({ type: 'create', name }); }
  else {
    const code = (($('room-code') as HTMLInputElement).value || '').trim().toUpperCase();
    if (code.length !== 6) { $('landing-error').textContent = 'รหัสห้องมี 6 ตัว'; return; }
    audioWantsStart = true;
    startBgm();
    send({ type: 'join', code, name });
  }
}
$('create').addEventListener('click', () => enterRoom(true));
$('join').addEventListener('click', () => enterRoom(false));
$('practice').addEventListener('click', () => {
  const name = userName();
  if (!name) return;
  $('landing-error').textContent = '';
  audioWantsStart = true;
  startBgm();
  send({ type: 'practice', name, mobile: ($('practice-mobile') as HTMLSelectElement).value as OrdinaryMobileKind });
});
$('start').addEventListener('click', () => send({ type: 'start' }));
$('lobby-ready').addEventListener('click', () => send({ type: 'lobby-ready', ready: !gameState?.lobbyReady.includes(playerId) }));
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
$('practice-reset').addEventListener('click', () => { closeSettings(); send({ type: 'reset-practice' }); });
$('practice-exit').addEventListener('click', () => {
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
  powerMeter.value = Math.max(MIN_POWER, Math.min(100, value));
  updateAim();
}
function fireChargedShot(): void {
  const angle = Number(angleInput.value), power = Math.round(powerMeter.value);
  if (teleportMode) send({ type: 'item', item: 'teleport', angle, power });
  else send({ type: 'fire', angle, power, special: specialMode });
}
function chargePower(): void {
  if (chargeStartedAt === null) return;
  setPower(MIN_POWER + Math.min(1, (performance.now() - chargeStartedAt) / CHARGE_MS) * (100 - MIN_POWER));
  if (powerMeter.value < 100) chargeFrame = requestAnimationFrame(chargePower);
}
function beginCharge(): void {
  if (!canControl() || fireButton.disabled || chargeStartedAt !== null) return;
  chargeStartedAt = performance.now();
  setPower(MIN_POWER);
  fireButton.classList.add('charging');
  chargeFrame = requestAnimationFrame(chargePower);
}
function endCharge(shouldFire: boolean): void {
  if (chargeStartedAt === null) return;
  const elapsed = performance.now() - chargeStartedAt;
  chargeStartedAt = null;
  cancelAnimationFrame(chargeFrame);
  fireButton.classList.remove('charging');
  if (!shouldFire || !canControl()) { setPower(MIN_POWER); return; }
  setPower(MIN_POWER + Math.min(1, elapsed / CHARGE_MS) * (100 - MIN_POWER));
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
  if (event.detail === 0 && canControl()) { setPower(MIN_POWER); fireChargedShot(); }
});
for (const eventName of ['contextmenu', 'selectstart', 'dragstart']) {
  fireButton.addEventListener(eventName, event => event.preventDefault());
}
fireButton.addEventListener('touchstart', event => event.preventDefault(), { passive: false });
$('item-double').addEventListener('click', () => send({ type: 'item', item: 'double' }));
$('item-repair').addEventListener('click', () => send({ type: 'item', item: 'repair' }));
$('item-teleport').addEventListener('click', () => { setTeleportMode(!teleportMode); if (teleportMode) toast('เล็งมุม กดยิงค้างเพื่อเพิ่มพลัง แล้วปล่อยเพื่อย้าย'); });
$('item-special').addEventListener('click', () => { if (canControl()) setSpecialMode(!specialMode); });
function updateFireLabel(): void {
  $('fire').textContent = teleportMode ? 'WARP' : specialMode ? 'SKILL' : 'FIRE';
}
function setTeleportMode(value: boolean): void {
  if (value) setSpecialMode(false);
  teleportMode = value;
  $('item-teleport').classList.toggle('selected', value);
  $('fire').classList.toggle('warp-armed', value);
  updateFireLabel();
}
function setSpecialMode(value: boolean): void {
  if (value) setTeleportMode(false);
  specialMode = value;
  $('item-special').classList.toggle('selected', value);
  $('fire').classList.toggle('special-armed', value);
  updateFireLabel();
}
updateFireLabel();

function canControl(): boolean {
  return socket?.readyState === WebSocket.OPEN && !resumePending && gameState?.phase === 'playing' && gameState.activeId === playerId;
}
function syncMovement(): void {
  const left = keysDown.has('ArrowLeft') || keysDown.has('KeyA') || touchPressed.left;
  const right = keysDown.has('ArrowRight') || keysDown.has('KeyD') || touchPressed.right;
  const direction: -1 | 0 | 1 = !canControl() ? 0 : left === right ? 0 : left ? -1 : 1;
  if (direction === sentDirection) return;
  sentDirection = direction;
  if (socket?.readyState === WebSocket.OPEN && !resumePending) send({ type: 'move', direction });
}
function releaseMovement(): void {
  keysDown.clear();
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
const bgmToggle = $('bgm-toggle') as HTMLInputElement;
const sfxToggle = $('sfx-toggle') as HTMLInputElement;
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
function setBgmEnabled(enabled: boolean): void {
  bgmEnabled = enabled;
  bgmToggle.checked = enabled;
  if (enabled) startBgm();
  else bgm.pause();
  try { localStorage.setItem('skyward-bgm', enabled ? 'on' : 'off'); } catch { /* Storage can be unavailable. */ }
}
function setSfxEnabled(enabled: boolean): void {
  sfxEnabled = enabled;
  sfxToggle.checked = enabled;
  if (!enabled) {
    fireSound.pause(); itemSound.pause(); hitSound.pause(); dropSound.pause(); windSound.pause(); stopClockSound();
    clearTimeout(hitTimer);
    stopMovementSound();
  }
  try { localStorage.setItem('skyward-sfx', enabled ? 'on' : 'off'); } catch { /* Storage can be unavailable. */ }
}
try {
  const oldSoundSetting = localStorage.getItem('skyward-sound');
  setBgmEnabled((localStorage.getItem('skyward-bgm') ?? oldSoundSetting) !== 'off');
  setSfxEnabled((localStorage.getItem('skyward-sfx') ?? oldSoundSetting) !== 'off');
} catch { setBgmEnabled(true); setSfxEnabled(true); }
bgmToggle.addEventListener('change', () => setBgmEnabled(bgmToggle.checked));
sfxToggle.addEventListener('change', () => setSfxEnabled(sfxToggle.checked));
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
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'KeyA' || event.code === 'KeyD') {
    keysDown.add(event.code);
    syncMovement(); event.preventDefault();
  } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown' || event.code === 'KeyW' || event.code === 'KeyS') {
    adjustAngle(event.code === 'ArrowUp' || event.code === 'KeyW' ? 1 : -1); event.preventDefault();
  } else if (event.code === 'KeyR') {
    if (!event.repeat) { releaseMovement(); send({ type: 'turn' }); }
    event.preventDefault();
  } else if (event.code === 'Space') { if (!event.repeat) beginCharge(); event.preventDefault(); }
});
window.addEventListener('keyup', event => {
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'KeyA' || event.code === 'KeyD') {
    keysDown.delete(event.code);
    syncMovement(); event.preventDefault();
  } else if (event.code === 'Space') { endCharge(true); event.preventDefault(); }
});
window.addEventListener('blur', () => { releaseMovement(); endCharge(false); });

function render(state: GameState): void {
  const previous = gameState;
  if (previous?.phase === 'finished' && state.phase !== 'finished') {
    setTeleportMode(false);
    setSpecialMode(false);
    lastOwnTurn = 0;
    $('result-stats').replaceChildren();
  }
  if (previous?.phase === 'playing') {
    const newDrop = state.drops.find(drop => !previous.drops.some(old => old.id === drop.id));
    if (newDrop) { playEffect(dropSound); toast('ไอเทมตกลงมาจากฟ้า! เดินไปเก็บเมื่อช่องว่าง'); }
    if (state.meteor && state.meteor.turn !== previous.meteor?.turn) {
      toast(state.meteor.hitIds.length ? 'อุกกาบาตตก! มี Mobile โดนโจมตี 20 HP' : 'อุกกาบาตตก! พื้นสนามถูกทำลาย');
      if (state.meteor.hitIds.length) playEffect(hitSound);
    }
    if (state.turn !== previous.turn && state.wind !== previous.wind) playEffect(windSound);
    const previousMe = previous.players.find(player => player.id === playerId);
    const currentMe = state.players.find(player => player.id === playerId);
    if (currentMe && state.activeId === playerId && previousMe && previousMe.walkedThisTurn < TURN_MOVE_LIMIT - 0.01 && currentMe.walkedThisTurn >= TURN_MOVE_LIMIT - 0.01) toast('เดินครบระยะของเทิร์นนี้แล้ว');
  }
  updateMovementSound(gameState, state);
  gameState = state;
  if (previous?.phase === 'lobby' && state.phase === 'playing') {
    const me = state.players.find(player => player.id === playerId);
    if (me?.randomUsed) toast(`สุ่มได้ ${MOBILE_INFO[me.mobile].label}!`);
  }
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
    const me = state.players.find(player => player.id === playerId);
    const isHost = state.hostId === playerId;
    const isReady = state.lobbyReady.includes(playerId);
    document.querySelectorAll<HTMLButtonElement>('.mobile-option').forEach(button => {
      button.classList.toggle('selected', !me?.randomUsed && button.dataset.mobile === me?.mobile);
      button.disabled = isReady || !me?.connected || !!me.randomUsed;
    });
    ($('random-mobile') as HTMLButtonElement).disabled = isReady || !me?.connected || !!me.randomUsed;
    $('random-mobile').textContent = me?.randomUsed ? '🎲 สุ่มแล้ว' : '🎲 สุ่ม Mobile';
    document.querySelectorAll<HTMLButtonElement>('.equipment-row button').forEach(button => {
      const slot = button.closest<HTMLElement>('.equipment-row')?.dataset.slot as EquipmentSlot;
      const set = button.dataset.set === 'none' ? null : button.dataset.set as EquipmentSet;
      button.classList.toggle('selected', !!me && me.equipment[slot] === set);
      button.disabled = isReady || !me?.connected;
    });
    $('equipment-stats').textContent = me ? `โจมตี +${equipmentBonus(me, 'attack')} · ป้องกัน +${equipmentBonus(me, 'defense')} · เลือด +${equipmentBonus(me, 'health')}` : '';
    $('lobby-players').replaceChildren(...state.players.map((player, index) => {
      const element = document.createElement('div');
      element.className = 'lobby-player';
      const name = document.createElement('span'); name.textContent = player.name + (player.id === state.hostId ? ' ★' : '') + (state.mode === 'teams' ? ` · ทีม ${index % 2 === 0 ? 'A' : 'B'}` : '') + (player.connected ? '' : ' · หลุด');
      const mobile = document.createElement('b'); mobile.className = 'lobby-player-mobile'; mobile.textContent = player.randomUsed ? '🎲 รอเปิดเผย' : MOBILE_INFO[player.mobile].label;
      const gear = document.createElement('span'); gear.className = 'lobby-player-gear';
      for (const slot of ['hat', 'armor', 'boots'] as const) {
        const set = player.equipment[slot];
        if (!set) continue;
        const icon = document.createElement('img'); icon.src = `/assets/equipment/${set}-${slot}.png`; icon.alt = `${slot} ${set}`;
        gear.append(icon);
      }
      const ready = document.createElement('span'); ready.className = `lobby-player-ready${state.lobbyReady.includes(player.id) ? ' is-ready' : ''}`;
      ready.textContent = player.id === state.hostId ? 'หัวหน้าห้อง' : state.lobbyReady.includes(player.id) ? 'พร้อมแล้ว' : 'ยังไม่พร้อม';
      element.append(name, mobile, gear, ready);
      return element;
    }));
    $('start').classList.toggle('hidden', !isHost);
    $('lobby-ready').classList.toggle('hidden', isHost);
    ($('start') as HTMLButtonElement).disabled = !isHost || state.players.some(player => !player.connected) || state.players.length < 2 || (state.mode === 'teams' && state.players.length !== 4) || state.players.some(player => player.id !== state.hostId && !state.lobbyReady.includes(player.id));
    ($('lobby-ready') as HTMLButtonElement).disabled = !me?.connected;
    $('lobby-ready').textContent = isReady ? 'ยกเลิกพร้อม' : 'พร้อมเล่น';
    $('lobby-status').textContent = `${state.players.filter(player => player.connected).length}/4 คนเข้าห้อง · พร้อม ${state.lobbyReady.length}/${Math.max(0, state.players.length - 1)}${state.mode === 'teams' ? ' · ทีม A/B สลับตามลำดับเข้าห้อง' : ''}`;
    return;
  }
  $('player-strip').replaceChildren(...state.players.map(player => {
    const card = document.createElement('div');
    card.className = `player-card${player.id === state.activeId ? ' active' : ''}${player.hp <= 0 ? ' dead' : ''}`;
    card.style.setProperty('--player-color', `#${MOBILE_INFO[player.mobile].color.toString(16).padStart(6, '0')}`);
    const portrait = document.createElement('img'); portrait.className = 'player-portrait';
    portrait.src = `/assets/characters/${player.mobile}.png`; portrait.alt = MOBILE_INFO[player.mobile].label;
    const portraitWrap = document.createElement('div'); portraitWrap.className = 'player-portrait-wrap'; portraitWrap.append(portrait);
    for (const slot of ['hat', 'armor', 'boots'] as const) {
      const set = player.equipment[slot];
      if (!set) continue;
      const gear = document.createElement('img'); gear.className = `player-gear player-gear-${slot}`;
      gear.src = `/assets/equipment/${set}-${slot}.png`; gear.alt = '';
      portraitWrap.append(gear);
    }
    const info = document.createElement('div'); info.className = 'player-info';
    const head = document.createElement('div'); head.className = 'player-head';
    const name = document.createElement('b'); name.textContent = player.name + (state.mode === 'teams' ? ` · ${player.team === 0 ? 'A' : 'B'}` : '');
    const maxHp = maxHpFor(player);
    const meta = document.createElement('small'); meta.textContent = `${MOBILE_INFO[player.mobile].label} ${player.hp}/${maxHp}`;
    head.append(name, meta);
    const track = document.createElement('div'); track.className = 'hp-track';
    const fill = document.createElement('div'); fill.className = 'hp-fill'; fill.style.width = `${100 * player.hp / maxHp}%`;
    track.append(fill); info.append(head, track); card.append(portraitWrap, info);
    return card;
  }));
  $('wind').textContent = `WIND ${state.wind < 0 ? '←' : '→'} ${Math.abs(state.wind)}`;
  $('practice-options').classList.toggle('hidden', state.mode !== 'practice');
  $('turn').textContent = `TURN ${String(state.turn).padStart(2, '0')}`;
  $('turn-banner').textContent = state.activeId === playerId ? 'เทิร์นของคุณ • เล็งแล้ว FIRE' : state.message;
  if (state.mode === 'practice') $('turn-banner').textContent = 'โหมดฝึก · ยิงเป้าได้ต่อเนื่อง';
  const me = state.players.find(player => player.id === playerId);
  const canAct = socket?.readyState === WebSocket.OPEN && !resumePending && state.phase === 'playing' && state.activeId === playerId && !!me && me.hp > 0;
  if (canAct && state.turn !== lastOwnTurn) {
    lastOwnTurn = state.turn;
    releaseMovement();
    setTeleportMode(false);
    setSpecialMode(false);
    setPower(MIN_POWER);
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
    $('ready-status').textContent = enoughPlayers ? `พร้อมกลับห้องเตรียมเกม ${state.rematchReady.length}/${connectedCount} คน` : state.mode === 'teams' ? 'รีแมตช์ทีมต้องมีครบ 4 คน' : 'รีแมตช์ต้องมีอย่างน้อย 2 คน';
    $('rematch-ready').textContent = state.rematchReady.includes(playerId) ? 'ยกเลิกพร้อม' : 'รีแมตช์ · เลือกรถใหม่';
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
  if (gameState.mode === 'practice') { $('timer').textContent = '∞'; stopClockSound(); return; }
  const seconds = Math.max(0, Math.ceil((gameState.deadline - Date.now()) / 1000));
  $('timer').textContent = `${seconds}s`;
  if (seconds > 0 && seconds <= 5 && sfxEnabled && audioWantsStart && socket?.readyState === WebSocket.OPEN && !resumePending) {
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
      else if (message.type === 'shot') { scene.showShot(message.shot); if (message.shot.kind === 'damage' && !message.shot.special) playEffect(fireSound); }
      else if (message.type === 'hit') { clearTimeout(hitTimer); hitTimer = window.setTimeout(() => playEffect(hitSound), 820); }
      else if (message.type === 'item-used' || message.type === 'item-picked') {
        playEffect(itemSound);
        if (message.type === 'item-picked' && message.playerId === playerId) toast(message.item === 'special' ? 'เก็บท่าพิเศษได้อีกครั้ง!' : 'เก็บไอเทมได้แล้ว');
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
