import {
  Scene, MeshBuilder, StandardMaterial, Color3, Color4, Vector3, VertexBuffer,
  HemisphericLight, DirectionalLight, Mesh, ParticleSystem, DynamicTexture, Texture,
} from "@babylonjs/core";

// Coordinates: +x is east (the sea), +z is north. Bulgarians start north, Byzantines south.
// The western hills are where the Bulgarian cavalry waits.

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function noise(x: number, z: number): number {
  let n = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < 4; i++) { n += smooth(x * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2.1; }
  return n / norm;
}

export const SEA_X = 330;

export function heightAt(x: number, z: number): number {
  let h = (noise(x / 90, z / 90) - 0.5) * 6;
  h += (noise(x / 25 + 40, z / 25) - 0.5) * 1.2;
  // western hills
  if (x < -140) { const t = Math.min(1, (-140 - x) / 220); h += t * t * 38 * (0.6 + noise(x / 60, z / 60)); }
  // coast drops into the sea
  if (x > SEA_X - 60) { const t = (x - (SEA_X - 60)) / 80; h -= Math.min(1, t) * 8 + Math.max(0, t - 1) * 4; }
  return h;
}

function radialTexture(scene: Scene, name: string, inner: string, outer: string): DynamicTexture {
  const t = new DynamicTexture(name, 64, scene, false);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  t.hasAlpha = true; t.update();
  return t;
}

export function buildWorld(scene: Scene) {
  const haze = new Color3(0.78, 0.66, 0.52);
  scene.clearColor = new Color4(haze.r, haze.g, haze.b, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0022;
  scene.fogColor = haze;
  scene.ambientColor = new Color3(0.25, 0.22, 0.2);

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.55;
  hemi.diffuse = new Color3(0.85, 0.8, 0.75);
  hemi.groundColor = new Color3(0.3, 0.24, 0.18);
  const sun = new DirectionalLight("sun", new Vector3(-0.7, -0.4, 0.55), scene); // morning sun over the sea, south-east
  sun.intensity = 1.5;
  sun.diffuse = new Color3(1.0, 0.82, 0.58);

  // Sky dome with a vertical gradient: warm haze at the horizon, grey-blue overhead, sun glow in the east.
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 3000, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyPos = sky.getVerticesData(VertexBuffer.PositionKind)!;
  const skyCol: number[] = [];
  for (let i = 0; i < skyPos.length; i += 3) {
    const y = skyPos[i + 1] / 1500, x = skyPos[i] / 1500;
    const t = Math.max(0, Math.min(1, y * 2.2));
    const glow = Math.max(0, x) * Math.max(0, 1 - Math.abs(y - 0.08) * 4) * 0.5;
    skyCol.push(
      haze.r * (1 - t) + 0.42 * t + glow, haze.g * (1 - t) + 0.48 * t + glow * 0.7,
      haze.b * (1 - t) + 0.56 * t + glow * 0.3, 1);
  }
  sky.setVerticesData(VertexBuffer.ColorKind, skyCol);
  const skyMat = new StandardMaterial("skyMat", scene);
  skyMat.disableLighting = true; skyMat.emissiveColor = Color3.White(); skyMat.fogEnabled = false;
  sky.material = skyMat; sky.infiniteDistance = true;

  // Terrain: dry late-August grass, darker on the hills, sandy toward the shore.
  const size = 1600, sub = 220;
  const ground = MeshBuilder.CreateGround("ground", { width: size, height: size, subdivisions: sub, updatable: true }, scene);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  const col: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = pos[i + 2];
    const h = heightAt(x, z);
    pos[i + 1] = h;
    const n = noise(x / 14, z / 14), n2 = noise(x / 3 + 9, z / 3);
    let r = 0.5 + n * 0.12 + n2 * 0.05, g = 0.45 + n * 0.1 + n2 * 0.04, b = 0.24 + n * 0.04;
    if (x < -140) { const t = Math.min(1, (-140 - x) / 160); r -= 0.2 * t; g -= 0.1 * t; b -= 0.08 * t; }
    const shore = Math.max(0, Math.min(1, (x - (SEA_X - 70)) / 40));
    r += (0.72 - r) * shore; g += (0.64 - g) * shore; b += (0.48 - b) * shore;
    col.push(r, g, b, 1);
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  ground.setVerticesData(VertexBuffer.ColorKind, col);
  ground.createNormals(true);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.specularColor = new Color3(0.03, 0.03, 0.03);
  // Tiled grass detail so the field does not look like flat paint up close.
  const detail = new DynamicTexture("grass", 256, scene, true);
  const gctx = detail.getContext() as CanvasRenderingContext2D;
  gctx.fillStyle = "#b8b8b8"; gctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const v = 120 + Math.floor(Math.random() * 135);
    gctx.strokeStyle = `rgb(${v},${v},${Math.floor(v * 0.85)})`;
    const x = Math.random() * 256, y = Math.random() * 256;
    gctx.beginPath(); gctx.moveTo(x, y); gctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 5); gctx.stroke();
  }
  detail.update();
  detail.uScale = detail.vScale = 400;
  groundMat.diffuseTexture = detail;
  ground.material = groundMat;
  ground.isPickable = false;

  // The Black Sea to the east.
  const sea = MeshBuilder.CreateGround("sea", { width: 1400, height: 3000 }, scene);
  sea.position.set(SEA_X + 640, -1.2, 0);
  const seaMat = new StandardMaterial("seaMat", scene);
  seaMat.diffuseColor = new Color3(0.2, 0.3, 0.34);
  seaMat.specularColor = new Color3(0.9, 0.75, 0.5);
  seaMat.specularPower = 64;
  sea.material = seaMat;

  // Woods on the western hills (instanced).
  const trunk = MeshBuilder.CreateCylinder("trunk", { height: 3, diameter: 0.4, tessellation: 5 }, scene);
  const crown = MeshBuilder.CreateCylinder("crown", { height: 7, diameterTop: 0, diameterBottom: 4, tessellation: 7 }, scene);
  crown.position.y = 5;
  const treeMat = new StandardMaterial("treeMat", scene);
  treeMat.diffuseColor = new Color3(0.16, 0.22, 0.1); treeMat.specularColor = Color3.Black();
  const trunkMat = new StandardMaterial("trunkMat", scene);
  trunkMat.diffuseColor = new Color3(0.25, 0.18, 0.12); trunkMat.specularColor = Color3.Black();
  trunk.material = trunkMat; crown.material = treeMat;
  const tree = Mesh.MergeMeshes([trunk, crown], true, true, undefined, false, true)!;
  tree.isPickable = false;
  for (let i = 0; i < 700; i++) {
    const x = -200 - hash(i, 1) * 500, z = -500 + hash(i, 2) * 1000;
    if (noise(x / 80, z / 80) < 0.45) continue;
    const s = 0.7 + hash(i, 3) * 0.7;
    const inst = tree.createInstance("t" + i);
    inst.position.set(x, heightAt(x, z) - 0.3, z);
    inst.scaling.setAll(s);
    inst.rotation.y = hash(i, 4) * 6.28;
  }
  tree.position.y = -1000;

  // Anchialos far to the south: a hint of walls and towers in the haze.
  const wallMat = new StandardMaterial("wallMat", scene);
  wallMat.diffuseColor = new Color3(0.62, 0.55, 0.45); wallMat.specularColor = Color3.Black();
  for (let i = 0; i < 9; i++) {
    const x = 120 + i * 22, z = -620 - Math.sin(i) * 10;
    const tower = MeshBuilder.CreateBox("tw" + i, { width: 9, depth: 9, height: i % 2 ? 18 : 12 }, scene);
    tower.position.set(x, heightAt(x, z) + (i % 2 ? 9 : 6), z);
    tower.material = wallMat;
  }

  // Smoke columns from burning fields, Gladiator-style.
  const smokeTex = radialTexture(scene, "smoke", "rgba(255,255,255,0.9)", "rgba(255,255,255,0)");
  const fireTex = radialTexture(scene, "fire", "rgba(255,210,120,1)", "rgba(255,80,0,0)");
  const fires: [number, number][] = [[-60, -260], [180, -200], [-110, 40], [240, 90], [40, 330]];
  for (const [x, z] of fires) {
    const y = heightAt(x, z);
    const smoke = new ParticleSystem("smoke", 400, scene);
    smoke.particleTexture = smokeTex;
    smoke.emitter = new Vector3(x, y + 1, z);
    smoke.minEmitBox = new Vector3(-3, 0, -3); smoke.maxEmitBox = new Vector3(3, 0, 3);
    smoke.color1 = new Color4(0.25, 0.22, 0.2, 0.5); smoke.color2 = new Color4(0.35, 0.3, 0.27, 0.35);
    smoke.colorDead = new Color4(0.5, 0.45, 0.4, 0);
    smoke.minSize = 6; smoke.maxSize = 16; smoke.minLifeTime = 8; smoke.maxLifeTime = 14;
    smoke.emitRate = 18; smoke.gravity = new Vector3(-0.6, 1.4, 0);
    smoke.direction1 = new Vector3(-0.5, 2, -0.5); smoke.direction2 = new Vector3(0.5, 3, 0.5);
    smoke.minEmitPower = 0.8; smoke.maxEmitPower = 1.6;
    smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smoke.start();
    const fire = new ParticleSystem("fire", 200, scene);
    fire.particleTexture = fireTex;
    fire.emitter = new Vector3(x, y, z);
    fire.minEmitBox = new Vector3(-3, 0, -3); fire.maxEmitBox = new Vector3(3, 0, 3);
    fire.color1 = new Color4(1, 0.6, 0.2, 1); fire.color2 = new Color4(1, 0.35, 0.05, 1);
    fire.colorDead = new Color4(0.2, 0.05, 0, 0);
    fire.minSize = 1; fire.maxSize = 3; fire.minLifeTime = 0.4; fire.maxLifeTime = 1;
    fire.emitRate = 70; fire.gravity = new Vector3(0, 4, 0);
    fire.blendMode = ParticleSystem.BLENDMODE_ADD;
    fire.start();
  }
  smokeTex.wrapU = smokeTex.wrapV = Texture.CLAMP_ADDRESSMODE;

  // Dust over the melee; the battle code moves the emitter and sets the rate.
  const dust = new ParticleSystem("dust", 1500, scene);
  dust.particleTexture = smokeTex;
  dust.emitter = new Vector3(0, 0, 0);
  dust.minEmitBox = new Vector3(-40, 0, -6); dust.maxEmitBox = new Vector3(40, 1, 6);
  dust.color1 = new Color4(0.72, 0.62, 0.48, 0.28); dust.color2 = new Color4(0.6, 0.52, 0.4, 0.2);
  dust.colorDead = new Color4(0.7, 0.6, 0.5, 0);
  dust.minSize = 4; dust.maxSize = 10; dust.minLifeTime = 4; dust.maxLifeTime = 8;
  dust.emitRate = 0; dust.gravity = new Vector3(0.3, 0.4, 0);
  dust.direction1 = new Vector3(-1, 0.5, -1); dust.direction2 = new Vector3(1, 1, 1);
  dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  dust.start();

  return { ground, sun, dust };
}
