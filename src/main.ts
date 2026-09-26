import Phaser from 'phaser';
import { GameScene } from './GameScene.ts';
import { MOBILE_INFO } from '../shared/game.ts';
import type { ClientAction, GameState, MobileKind, ServerEvent } from '../shared/game.ts';
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
const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);

function send(action: ClientAction): void {
  if (socket.readyState !== WebSocket.OPEN) { toast('กำลังเชื่อมต่อเซิร์ฟเวอร์'); return; }
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
  if (create) send({ type: 'create', name, mobile: selectedMobile });
  else {
    const code = (($('room-code') as HTMLInputElement).value || '').trim().toUpperCase();
    if (code.length !== 6) { $('landing-error').textContent = 'รหัสห้องมี 6 ตัว'; return; }
    send({ type: 'join', code, name, mobile: selectedMobile });
  }
}
$('create').addEventListener('click', () => enterRoom(true));
$('join').addEventListener('click', () => enterRoom(false));
$('start').addEventListener('click', () => send({ type: 'start' }));
$('copy-link').addEventListener('click', async () => {
  if (!gameState) return;
  const link = `${location.origin}/?room=${gameState.code}`;
  try { await navigator.clipboard.writeText(link); toast('คัดลอกลิงก์แล้ว'); }
  catch { toast(link); }
});
$('again').addEventListener('click', () => { location.href = '/'; });

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
  else send({ type: 'fire', angle, power });
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
$('item-double').addEventListener('click', () => send({ type: 'item', item: 'double' }));
$('item-repair').addEventListener('click', () => send({ type: 'item', item: 'repair' }));
$('item-teleport').addEventListener('click', () => { setTeleportMode(!teleportMode); if (teleportMode) toast('เล็งมุม กดยิงค้างเพื่อเพิ่มพลัง แล้วปล่อยเพื่อย้าย'); });
function setTeleportMode(value: boolean): void {
  teleportMode = value;
  $('item-teleport').classList.toggle('selected', value);
  $('fire').classList.toggle('portal-armed', value);
  $('fire').textContent = value ? 'PORTAL' : 'FIRE';
}

function canControl(): boolean {
  return gameState?.phase === 'playing' && gameState.activeId === playerId;
}
function syncMovement(): void {
  const left = pressed.left || touchPressed.left;
  const right = pressed.right || touchPressed.right;
  const direction: -1 | 0 | 1 = !canControl() ? 0 : left === right ? 0 : left ? -1 : 1;
  if (direction === sentDirection) return;
  sentDirection = direction;
  send({ type: 'move', direction });
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
try { setTouchControls(localStorage.getItem('skyward-touch-controls') === 'on'); }
catch { setTouchControls(false); }
settingsToggle.addEventListener('click', () => {
  const opening = settingsPopup.classList.contains('hidden');
  settingsPopup.classList.toggle('hidden', !opening);
  settingsToggle.setAttribute('aria-expanded', String(opening));
});
$('settings-close').addEventListener('click', closeSettings);
touchToggle.addEventListener('change', () => setTouchControls(touchToggle.checked));
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
  if (gameState?.phase !== 'playing' || gameState.activeId !== playerId || (event.target instanceof HTMLInputElement && event.target.type !== 'range')) return;
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
  gameState = state;
  scene.setSnapshot(state, playerId);
  $('landing').classList.add('hidden');
  $('lobby').classList.toggle('hidden', state.phase !== 'lobby');
  $('hud').classList.toggle('hidden', state.phase === 'lobby');
  $('result').classList.toggle('hidden', state.phase !== 'finished');
  if (state.phase === 'lobby') {
    $('lobby-code').textContent = state.code;
    $('lobby-players').replaceChildren(...state.players.map(player => {
      const element = document.createElement('div');
      element.className = 'lobby-player';
      const name = document.createElement('span'); name.textContent = player.name + (player.id === state.hostId ? ' ★' : '');
      const mobile = document.createElement('b'); mobile.textContent = MOBILE_INFO[player.mobile].label;
      element.append(name, mobile);
      return element;
    }));
    ($('start') as HTMLButtonElement).disabled = state.hostId !== playerId || state.players.length < 2;
    $('lobby-status').textContent = `${state.players.length}/4 คนเข้าห้องแล้ว`;
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
    const name = document.createElement('b'); name.textContent = player.name;
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
  const canAct = state.phase === 'playing' && state.activeId === playerId && !!me && me.hp > 0;
  if (canAct && state.turn !== lastOwnTurn) {
    lastOwnTurn = state.turn;
    releaseMovement();
    angleInput.value = '45';
    setPower(20);
    updateAim();
  }
  for (const id of ['angle', 'fire']) ($<HTMLInputElement | HTMLButtonElement>(id)).disabled = !canAct;
  document.querySelectorAll<HTMLButtonElement>('#touch-dpad button').forEach(button => { button.disabled = !canAct; });
  for (const item of ['double', 'repair', 'teleport'] as const) {
    ($<HTMLButtonElement>(`item-${item}`)).disabled = !canAct || !me?.items[item] || (item === 'double' && me.doubleArmed);
    $(`count-${item}`).textContent = String(me?.items[item] ?? 0);
  }
  $('item-double').classList.toggle('selected', !!me?.doubleArmed);
  if (!canAct) { endCharge(false); setTeleportMode(false); releaseMovement(); }
  if (state.phase === 'finished') $('result-title').textContent = state.winnerId ? `${state.players.find(player => player.id === state.winnerId)?.name ?? ''} ชนะ!` : 'เสมอ!';
  updateAim();
  updateTimer();
}
function updateTimer(): void {
  if (!gameState || gameState.phase !== 'playing') return;
  const seconds = Math.max(0, Math.ceil((gameState.deadline - Date.now()) / 1000));
  $('timer').textContent = `${seconds}s`;
}
setInterval(updateTimer, 100);

socket.addEventListener('message', event => {
  try {
    const message = JSON.parse(event.data) as ServerEvent;
    if (message.type === 'welcome') {
      playerId = message.id;
      history.replaceState(null, '', `/?room=${message.code}`);
    } else if (message.type === 'state') render(message.state);
    else if (message.type === 'shot') scene.showShot(message.shot);
    else if (message.type === 'error') { toast(message.message); $('landing-error').textContent = message.message; }
  } catch { toast('อ่านข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ'); }
});
socket.addEventListener('close', () => toast('การเชื่อมต่อขาด กรุณารีเฟรชหน้าเว็บ'));
const roomFromLink = new URLSearchParams(location.search).get('room');
if (roomFromLink) ($('room-code') as HTMLInputElement).value = roomFromLink.toUpperCase();
