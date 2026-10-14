import {
  Engine, Scene, FreeCamera, Vector3, MeshBuilder, StandardMaterial, Color3, TransformNode,
  DefaultRenderingPipeline, ImageProcessingConfiguration, ColorCurves, Mesh, AnimationGroup,
} from "@babylonjs/core";
import { buildWorld, heightAt } from "./world";
import { loadHorse, HORSE_SCALE, SADDLE } from "./models";
const HORSE_URL = `${import.meta.env.BASE_URL}models/horse.glb`;
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

// The general's own horse (real glTF model with a gallop animation); the saddle sits at the node origin.
const horse = new TransformNode("horse", scene);
let playerHorseAnim: AnimationGroup | null = null;
loadHorse(scene, HORSE_URL).then(h => {
  h.mesh.parent = horse;
  h.mesh.scaling.set(-HORSE_SCALE, HORSE_SCALE, HORSE_SCALE);
  h.mesh.position.set(0, 0, -SADDLE.z);
  h.mesh.alwaysSelectAsActiveMesh = true;
  playerHorseAnim = h.anim; h.anim?.play(true); h.anim?.pause();
});
// Cavalry horses for both armies: one copy galloping, one standing still.
Promise.all([loadHorse(scene, HORSE_URL), loadHorse(scene, HORSE_URL)]).then(([run, idle]) => {
  run.anim?.play(true);
  idle.anim?.play(true); idle.anim?.pause(); idle.anim?.goToFrame(0);
  battle.setHorses(run.mesh, idle.mesh);
});

// The general's sword arm: mail sleeve, leather bracer, gloved hand, a long straight sword.
const sword = new TransformNode("swordRoot", scene); sword.parent = cam;
const steel = new StandardMaterial("steel", scene); steel.diffuseColor = new Color3(0.55, 0.56, 0.6); steel.specularColor = new Color3(1, 1, 1); steel.specularPower = 120;
const dark = new StandardMaterial("dark", scene); dark.diffuseColor = new Color3(0.16, 0.11, 0.07); dark.specularColor = new Color3(0.1, 0.1, 0.1);
const brass = new StandardMaterial("brass", scene); brass.diffuseColor = new Color3(0.55, 0.42, 0.18); brass.specularColor = new Color3(0.8, 0.7, 0.4); brass.specularPower = 60;
const blade = MeshBuilder.CreateCylinder("blade", { height: 0.85, diameterTop: 0.012, diameterBottom: 0.05, tessellation: 4 }, scene);
blade.scaling.z = 0.18; blade.parent = sword; blade.position.y = 0.52; blade.material = steel;
const guard = MeshBuilder.CreateBox("guard", { width: 0.2, height: 0.025, depth: 0.03 }, scene); guard.parent = sword; guard.position.y = 0.09; guard.material = brass;
const grip = MeshBuilder.CreateCylinder("grip", { height: 0.13, diameter: 0.032, tessellation: 8 }, scene); grip.parent = sword; grip.material = dark;
const pommel = MeshBuilder.CreateSphere("pommel", { diameter: 0.045, segments: 6 }, scene); pommel.parent = sword; pommel.position.y = -0.08; pommel.material = brass;
const glove = MeshBuilder.CreateSphere("glove", { diameter: 0.09, segments: 8 }, scene); glove.parent = sword; glove.scaling.set(1, 1.3, 1); glove.material = dark;
const bracer = MeshBuilder.CreateCylinder("bracer", { height: 0.28, diameterTop: 0.075, diameterBottom: 0.09, tessellation: 10 }, scene);
bracer.parent = sword; bracer.position.set(0.02, -0.05, -0.17); bracer.rotation.x = 1.35; bracer.material = dark;
sword.position.set(0.36, -0.38, 0.62); sword.rotation.set(0.5, 0, -0.35);
for (const m of [blade, guard, grip, pommel, glove, bracer] as Mesh[]) m.renderingGroupId = 1;

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
  horse.position.set(player.x, gy, player.z); horse.rotation.y = player.horseYaw;
  if (playerHorseAnim) {
    if (gait > 1.5) { if (!playerHorseAnim.isPlaying) playerHorseAnim.play(true); playerHorseAnim.speedRatio = Math.min(1.6, 0.4 + gait / 10); }
    else if (playerHorseAnim.isPlaying) playerHorseAnim.pause();
  }
  player.shake = Math.max(0, player.shake - dt);
  const sh = player.shake * 0.03;
  cam.position.set(player.x, gy + SADDLE.y + 0.78 + bob, player.z);
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
