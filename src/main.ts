import {
  Engine, Scene, FreeCamera, Vector3, MeshBuilder, StandardMaterial, Color3, TransformNode,
  DefaultRenderingPipeline, ImageProcessingConfiguration, ColorCurves, Mesh,
} from "@babylonjs/core";
import { buildWorld, heightAt } from "./world";
import { Battle, setupArmies, Unit } from "./battle";
import { Audio } from "./audio";

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("game") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
const { dust } = buildWorld(scene);

// ---------- camera & general ----------
const cam = new FreeCamera("cam", new Vector3(0, 0, 0), scene);
cam.minZ = 0.1; cam.maxZ = 2500; cam.fov = 1.05;
cam.inputs.clear();
const player = { x: 6, z: 205, yaw: Math.PI, pitch: 0.1, speed: 0, horseYaw: Math.PI, shake: 0, swing: -1 };

// The horse in front of the general: neck, mane, head and ears seen from the saddle.
const horse = new TransformNode("horse", scene);
const horseMat = new StandardMaterial("horseMat", scene);
horseMat.diffuseColor = new Color3(0.22, 0.15, 0.1); horseMat.specularColor = new Color3(0.15, 0.12, 0.1);
const maneMat = new StandardMaterial("maneMat", scene);
maneMat.diffuseColor = new Color3(0.06, 0.05, 0.04); maneMat.specularColor = Color3.Black();
const neck = MeshBuilder.CreateCylinder("neck", { height: 1.3, diameterTop: 0.32, diameterBottom: 0.55, tessellation: 10 }, scene);
neck.parent = horse; neck.position.set(0, 1.6, 0.95); neck.rotation.x = 1.0; neck.material = horseMat;
const mane = MeshBuilder.CreateBox("mane", { width: 0.08, height: 0.18, depth: 1.25 }, scene);
mane.parent = horse; mane.position.set(0, 1.88, 0.85); mane.rotation.x = -0.57; mane.material = maneMat;
const hhead = MeshBuilder.CreateBox("hhead", { width: 0.32, height: 0.36, depth: 0.75 }, scene);
hhead.parent = horse; hhead.position.set(0, 1.75, 1.6); hhead.rotation.x = 1.0; hhead.material = horseMat;
for (const sx of [-0.09, 0.09]) {
  const ear = MeshBuilder.CreateCylinder("ear", { height: 0.18, diameterTop: 0, diameterBottom: 0.08, tessellation: 4 }, scene);
  ear.parent = horse; ear.position.set(sx, 2.02, 1.38); ear.rotation.x = -0.3; ear.material = horseMat;
}
const reinMat = new StandardMaterial("rein", scene); reinMat.diffuseColor = new Color3(0.12, 0.08, 0.05);
for (const sx of [-0.2, 0.2]) {
  const rein = MeshBuilder.CreateCylinder("rein", { height: 1.0, diameter: 0.012, tessellation: 3 }, scene);
  rein.parent = horse; rein.position.set(sx * 0.7, 1.95, 0.75); rein.rotation.x = 1.15; rein.material = reinMat;
}
const body = MeshBuilder.CreateBox("hbody", { width: 0.8, height: 0.8, depth: 1.6 }, scene);
body.parent = horse; body.position.set(0, 1.35, -0.1); body.material = horseMat;

// The general's sword, held low on the right.
const sword = new TransformNode("swordRoot", scene); sword.parent = cam;
const blade = MeshBuilder.CreateBox("blade", { width: 0.05, height: 0.9, depth: 0.012 }, scene);
const bladeMat = new StandardMaterial("blade", scene); bladeMat.diffuseColor = new Color3(0.7, 0.7, 0.72); bladeMat.specularColor = new Color3(1, 1, 1); bladeMat.specularPower = 80;
blade.material = bladeMat; blade.parent = sword; blade.position.y = 0.55;
const hilt = MeshBuilder.CreateBox("hilt", { width: 0.22, height: 0.04, depth: 0.04 }, scene); hilt.parent = sword; hilt.position.y = 0.1; hilt.material = reinMat;
const grip = MeshBuilder.CreateCylinder("grip", { height: 0.18, diameter: 0.04 }, scene); grip.parent = sword; grip.material = reinMat;
sword.position.set(0.42, -0.42, 0.75); sword.rotation.set(0.5, 0, -0.35);
for (const m of [blade, hilt, grip] as Mesh[]) m.renderingGroupId = 1;

// ---------- cinematic look (teal shadows, warm highlights, grain, vignette) ----------
// Add ?low to the URL on weak machines: lower resolution, no post effects except the colour grade.
const low = new URLSearchParams(location.search).has("low");
if (low) engine.setHardwareScalingLevel(2);
const pipe = new DefaultRenderingPipeline("cine", !low, scene, [cam]);
pipe.fxaaEnabled = !low;
pipe.bloomEnabled = !low; pipe.bloomThreshold = 0.75; pipe.bloomWeight = 0.35; pipe.bloomKernel = 48;
pipe.grainEnabled = !low; pipe.grain.intensity = 9; pipe.grain.animated = true;
pipe.chromaticAberrationEnabled = !low; pipe.chromaticAberration.aberrationAmount = 12;
pipe.sharpenEnabled = !low; pipe.sharpen.edgeAmount = 0.25;
const ip = pipe.imageProcessing;
ip.toneMappingEnabled = true; ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
ip.contrast = 1.35; ip.exposure = 1.15;
ip.vignetteEnabled = true; ip.vignetteWeight = 1.1; ip.vignetteCameraFov = 0.5;
ip.colorCurvesEnabled = true;
const curves = new ColorCurves();
curves.globalSaturation = -18;
curves.highlightsHue = 40; curves.highlightsDensity = 15; curves.highlightsSaturation = 20;
ip.colorCurves = curves;

// ---------- armies ----------
const battle = new Battle(scene, dust);
setupArmies(battle);
const bg = battle.units.filter(u => u.team === 0);
const byz = battle.units.filter(u => u.team === 1);
const bgCav = bg.find(u => u.kind === "cav")!;
const bgArch = bg.find(u => u.kind === "arch")!;

// ---------- HUD ----------
let shoutTimer = 0, subTimer = 0;
function showShout(text: string) { const el = $("shout"); el.textContent = text; el.classList.add("on"); shoutTimer = 2.2; }
function say(who: string, text: string, dur = 5) {
  const el = $("subtitle"); el.innerHTML = who ? `<span class="who">${who}:</span> ${text}` : text;
  el.classList.add("on"); subTimer = dur;
}
function prompt(text: string) { const el = $("prompt"); el.textContent = text; el.classList.toggle("on", !!text); }
function unitsHud() {
  const row = (u: Unit) => {
    const n = battle.alive(u);
    return `<div class="${u.team ? "byz" : "bg"}">${u.name}${u.routed ? " · бяга" : ""}<span class="bar"><i style="width:${(n / u.total) * 100}%"></i></span></div>`;
  };
  $("units").innerHTML = bg.map(row).join("") + "<br>" + byz.map(row).join("");
}

// ---------- shouts (keys 1-6) ----------
let audio: Audio | null = null;
const shouts: Record<string, { text: string; voice: string; act: () => void }> = {
  "1": { text: "СТОЙТЕ С МЕЕЕЕЕН!", voice: "Стойте с мен!", act: () => { battle.command(0, ["inf", "arch"], "hold"); battle.rally = 10; } },
  "2": { text: "НАПРЕЕЕЕЕЕЕД!", voice: "Напред!", act: () => { battle.command(0, ["inf"], "advance"); battle.rally = 10; } },
  "3": { text: "СТРЕЛЦИ — СЕГАААААА!", voice: "Стрелци, сега!", act: () => battle.fire(0, 6) },
  "4": { text: "КОННИЦАТА С МЕЕЕЕЕН!", voice: "Конницата с мен!", act: () => battle.command(0, ["cav"], "follow") },
  "5": { text: "АТАКАААААААА!", voice: "Атака!", act: () => {
    const nearCav = Math.hypot(battle.center(bgCav)[0] - player.x, battle.center(bgCav)[1] - player.z) < 80;
    battle.command(0, nearCav || bgCav.order === "follow" ? ["inf", "cav"] : ["inf"], "charge"); battle.rally = 15;
  } },
  "6": { text: "НАЗАААД! ДРЪЖТЕ РЕДАААА!", voice: "Назад! Дръжте реда!", act: () => battle.command(0, ["inf"], "fallback") },
};
let lastShout = "", lastShoutAt = -99, clock = 0;
function doShout(k: string) {
  const s = shouts[k]; const now = performance.now() / 1000; if (!s || now - lastShoutAt < 1.0) return;
  lastShout = k; lastShoutAt = now;
  showShout(s.text); s.act();
  player.shake = 0.5;
  if (audio) { audio.shout(); audio.speak(s.voice); audio.horn(0.3); audio.cheer(0.9); }
}

// ---------- story: a guided, linear retelling ----------
type Beat = { when: () => boolean; run: () => void };
let beatT = 0;
const dist = (u: Unit, x: number, z: number) => { const c = battle.center(u); return Math.hypot(c[0] - x, c[1] - z); };
const gap = () => Math.min(...byz.filter(u => u.kind === "inf").map(u => dist(u, 0, 160)));
let ended = false;
const beats: Beat[] = [
  { when: () => beatT > 1, run: () => say("", "Ахелой, край Анхиало · 20 август 917 г.", 6) },
  { when: () => beatT > 7, run: () => say("Болярин", "Господарю, ромеите на Лъв Фока се строяват за бой. Повече са от нас.", 6) },
  { when: () => beatT > 14, run: () => { say("Болярин", "Хората чакат да чуят гласа ти.", 6); prompt("Натисни 1 · СТОЙТЕ С МЕН!"); } },
  { when: () => lastShout === "1" || beatT > 40, run: () => {
    prompt(""); audio?.horn(1.5, 0.8); audio?.horn(3.2, 0.8);
    battle.command(1, ["inf"], "advance");
    say("", "Ромейските рогове. Редиците им тръгват напред.", 6);
  } },
  { when: () => gap() < 125, run: () => { say("Болярин", "В обсега са!", 4); prompt("Натисни 3 · СТРЕЛЦИ, СЕГА!"); } },
  { when: () => bgArch.fireLeft > 0 || gap() < 60, run: () => { prompt(""); if (bgArch.fireLeft === 0) battle.fire(0, 6); } },
  { when: () => gap() < 40, run: () => prompt("Натисни 2 · НАПРЕД!  или  5 · АТАКА!") },
  { when: () => battle.fighting > 80, run: () => { prompt(""); say("", "Сблъсък. Щит в щит.", 4); battle.command(1, ["cav"], "charge"); } },
  { when: () => beatT > 25, run: () => { say("Болярин", "Центърът се огъва! Конницата чака на хълмовете на запад!", 7); prompt("Язди на запад към конницата (Shift = галоп)"); } },
  { when: () => dist(bgCav, player.x, player.z) < 45, run: () => prompt("Натисни 4 · КОННИЦАТА С МЕН!") },
  { when: () => bgCav.order === "follow", run: () => { say("", "Конниците обръщат конете след теб.", 4); prompt("Поведи ги към фланга на ромеите и натисни 5 · АТАКА!"); } },
  { when: () => bgCav.order === "charge", run: () => prompt("") },
  { when: () => byz.filter(u => u.routed).length >= 1, run: () => { say("", "Ромеите се огъват! Строят им се къса!", 6); audio?.cheer(0); } },
  { when: () => byz.every(u => u.routed || battle.alive(u) === 0), run: () => { say("", "Ромеите бягат към реката и морето. Ахелой е наш.", 8); audio?.cheer(0); audio?.horn(0.5, 1.1); ended = true; } },
  { when: () => beatT > 9, run: () => {
    say("", "Ахелой (917) е една от най-големите битки на Средновековието. Ходът на боя тук е художествена реконструкция.", 12);
  } },
];
let beatIdx = 0;

// ---------- input ----------
const keys = new Set<string>();
let started = false;
window.addEventListener("keydown", e => {
  keys.add(e.code);
  if (started && shouts[e.key]) doShout(e.key);
});
window.addEventListener("keyup", e => keys.delete(e.code));
document.addEventListener("mousemove", e => {
  if (document.pointerLockElement !== canvas) return;
  // Chrome sometimes reports a huge jump on the first event after locking the pointer.
  if (Math.abs(e.movementX) > 150 || Math.abs(e.movementY) > 150 || performance.now() - lockedAt < 150) return;
  player.yaw += e.movementX * 0.0022;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch + e.movementY * 0.0022));
});
canvas.addEventListener("mousedown", e => {
  if (!started) return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
  if (e.button === 0 && player.swing < 0) player.swing = 0;
});
let lockedAt = 0;
document.addEventListener("pointerlockchange", () => {
  lockedAt = performance.now();
  if (!started) return;
  $("menu").classList.toggle("hidden", document.pointerLockElement === canvas);
  ($("play") as HTMLButtonElement).textContent = "Продължи";
});
$("play").addEventListener("click", () => {
  canvas.requestPointerLock();
  $("menu").classList.add("hidden");
  if (!audio) audio = new Audio(); else audio.ctx.resume();
  if (!started) { started = true; $("fade").style.opacity = "0"; }
});

battle.onKill = s => { if (audio && Math.hypot(s.x - player.x, s.z - player.z) < 40 && Math.random() < 0.3) audio.clang(); };
battle.onVolley = () => audio?.volley();

// ---------- main loop ----------
let endT = 0, hudT = 0, hoofT = 0, clangT = 0;
scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (started) {
    clock += dt; beatT += dt;
    if (beatIdx < beats.length && beats[beatIdx].when()) { beats[beatIdx].run(); beatIdx++; beatT = 0; }
  }

  // general on horseback
  const fwd = keys.has("KeyW") ? 1 : keys.has("KeyS") ? -0.4 : 0;
  const side = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const top = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 14 : 5;
  const want = started ? fwd * top : 0;
  player.speed += (want - player.speed) * Math.min(1, dt * (want > player.speed ? 0.8 : 2));
  let dy = player.yaw - player.horseYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.horseYaw += dy * Math.min(1, dt * (1.5 + Math.abs(player.speed) * 0.3));
  player.x += Math.sin(player.horseYaw) * player.speed * dt + Math.cos(player.horseYaw) * side * 2.5 * dt * (started ? 1 : 0);
  player.z += Math.cos(player.horseYaw) * player.speed * dt - Math.sin(player.horseYaw) * side * 2.5 * dt * (started ? 1 : 0);
  player.x = Math.max(-600, Math.min(320, player.x)); player.z = Math.max(-600, Math.min(600, player.z));
  const gy = heightAt(player.x, player.z);
  const gait = Math.abs(player.speed);
  const bob = Math.sin(clock * (4 + gait * 0.9)) * (0.02 + gait * 0.012);
  horse.position.set(player.x, gy + bob * 0.6, player.z); horse.rotation.y = player.horseYaw;
  player.shake = Math.max(0, player.shake - dt);
  const sh = player.shake * 0.03;
  cam.position.set(player.x, gy + 2.65 + bob, player.z);
  cam.rotation.set(player.pitch + (Math.random() - 0.5) * sh, player.yaw + (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  battle.player.x = player.x; battle.player.z = player.z; battle.player.yaw = player.horseYaw;

  // sword swing
  if (player.swing >= 0) {
    player.swing += dt / 0.4;
    const t = Math.min(1, player.swing);
    sword.rotation.set(0.5 - Math.sin(t * Math.PI) * 1.6, -Math.sin(t * Math.PI) * 0.8, -0.35 + t * 1.2);
    if (player.swing >= 0.5 && player.swing - dt / 0.4 < 0.5) { if (battle.swing(player.x, player.z, player.yaw) && audio) audio.clang(); }
    if (player.swing >= 1) { player.swing = -1; sword.rotation.set(0.5, 0, -0.35); }
  }

  if (started) battle.update(dt);

  // sound of battle around the general
  if (audio) {
    const d = Math.hypot(battle.clashX - player.x, battle.clashZ - player.z);
    const level = battle.fighting / 600 * Math.max(0.15, 1 - d / 400);
    audio.setDin(level);
    clangT -= dt; if (clangT <= 0 && battle.fighting > 0) { clangT = Math.max(0.05, 0.6 - level * 2) * Math.random() * 2; if (d < 150) audio.clang(); }
    hoofT -= dt; if (hoofT <= 0 && gait > 0.5) { hoofT = 2.4 / (2 + gait); audio.hoof(0.15 + gait * 0.02); }
  }

  if (ended) {
    endT += dt;
    if (endT > 24 && !$("menu").dataset.end) {
      $("menu").dataset.end = "1";
      $("menu").querySelector("h2")!.textContent = "Победа · 20 август 917 г.";
      $("menu").querySelector("p")!.textContent = "Византийската армия е разбита. Преследването продължава до реката и морския бряг.";
      ($("play") as HTMLButtonElement).textContent = "Остани на бойното поле";
      document.exitPointerLock();
    }
  }
  shoutTimer -= dt; if (shoutTimer <= 0) $("shout").classList.remove("on");
  subTimer -= dt; if (subTimer <= 0) $("subtitle").classList.remove("on");
  hudT -= dt; if (hudT <= 0) { hudT = 0.5; unitsHud(); }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
(window as unknown as { game: unknown }).game = { battle, player, doShout, scene, cam };
