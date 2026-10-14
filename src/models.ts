import {
  Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, DynamicTexture, Texture,
  LoadAssetContainerAsync, AnimationGroup, Material,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { Team, Kind } from "./battle";

// ---------------------------------------------------------------------------
// Procedural textures (no image files needed)
// ---------------------------------------------------------------------------
function tex(scene: Scene, name: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): DynamicTexture {
  const t = new DynamicTexture(name, size, scene, true);
  draw(t.getContext() as CanvasRenderingContext2D, size);
  t.update();
  return t;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Lamellar armour: rows of small overlapping iron plates laced together. */
function lamellar(scene: Scene, tint: string) {
  return tex(scene, "lamellar" + tint, 256, (c, s) => {
    c.fillStyle = "#1c1a18"; c.fillRect(0, 0, s, s);
    const w = 16, h = 32;
    for (let row = 0; row < s / (h * 0.75) + 1; row++) {
      for (let col = 0; col < s / w + 1; col++) {
        const x = col * w + (row % 2) * (w / 2), y = row * h * 0.75;
        const v = 95 + Math.random() * 50;
        const g = c.createLinearGradient(x, y, x + w, y);
        g.addColorStop(0, `rgb(${v * 0.6},${v * 0.6},${v * 0.62})`);
        g.addColorStop(0.5, `rgb(${v},${v},${v * 1.03})`);
        g.addColorStop(1, `rgb(${v * 0.55},${v * 0.55},${v * 0.58})`);
        c.fillStyle = g;
        c.beginPath(); c.roundRect(x + 1, y + 1, w - 2, h - 2, 5); c.fill();
        c.fillStyle = "rgba(0,0,0,.5)"; c.fillRect(x + w / 2 - 1, y + 5, 2, 2); c.fillRect(x + w / 2 - 1, y + h - 9, 2, 2);
      }
    }
    // rust and dirt
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${rnd(80, 120)},${rnd(40, 60)},20,${rnd(0.05, 0.2)})`; c.fillRect(rnd(0, s), rnd(0, s), rnd(2, 10), rnd(2, 10)); }
    c.fillStyle = tint; c.fillRect(0, s - 18, s, 18); // coloured lacing band at the hem
  });
}

/** Riveted mail for the aventail. */
function mail(scene: Scene) {
  return tex(scene, "mail", 128, (c, s) => {
    c.fillStyle = "#222"; c.fillRect(0, 0, s, s);
    c.lineWidth = 1.4;
    for (let y = 0; y < s; y += 5) for (let x = 0; x < s; x += 5) {
      const v = rnd(110, 170); c.strokeStyle = `rgb(${v},${v},${v})`;
      c.beginPath(); c.arc(x + ((y / 5) % 2) * 2.5, y, 2.3, 0, Math.PI * 2); c.stroke();
    }
  });
}

/** Coarse wool / linen weave. */
function cloth(scene: Scene, name: string, base: [number, number, number]) {
  return tex(scene, name, 128, (c, s) => {
    c.fillStyle = `rgb(${base.join(",")})`; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      const k = rnd(0.75, 1.2);
      c.fillStyle = `rgba(${base[0] * k},${base[1] * k},${base[2] * k},0.5)`;
      if (i % 2) c.fillRect(rnd(0, s), Math.floor(rnd(0, s / 2)) * 2, rnd(2, 6), 1);
      else c.fillRect(Math.floor(rnd(0, s / 2)) * 2, rnd(0, s), 1, rnd(2, 6));
    }
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(60,45,30,${rnd(0.05, 0.15)})`; c.beginPath(); c.arc(rnd(0, s), rnd(0, s), rnd(3, 12), 0, 7); c.fill(); }
  });
}

function leather(scene: Scene) {
  return tex(scene, "leather", 64, (c, s) => {
    c.fillStyle = "#4a3020"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${rnd(30, 90)},${rnd(20, 50)},${rnd(10, 30)},.4)`; c.fillRect(rnd(0, s), rnd(0, s), rnd(1, 4), rnd(1, 4)); }
  });
}

function skin(scene: Scene) {
  return tex(scene, "skin", 64, (c, s) => {
    c.fillStyle = "#a07258"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(${rnd(90, 150)},${rnd(60, 90)},${rnd(45, 70)},.3)`; c.fillRect(rnd(0, s), rnd(0, s), 2, 2); }
    // dark beard band on the lower half of the head texture
    c.fillStyle = "rgba(35,25,18,.85)"; c.fillRect(0, s * 0.62, s, s * 0.38);
  });
}

/** Painted round shield. Bulgarian: red with a dark rosette; Byzantine: blue-white with a gold cross. */
function shieldTex(scene: Scene, team: Team) {
  return tex(scene, "shield" + team, 256, (c, s) => {
    const m = s / 2;
    c.fillStyle = team === 0 ? "#6e1710" : "#d8d2c0"; c.fillRect(0, 0, s, s);
    if (team === 0) {
      c.strokeStyle = "#2a0a06"; c.lineWidth = 10;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.moveTo(m, m); c.lineTo(m + Math.cos(a) * m, m + Math.sin(a) * m); c.stroke(); }
      c.strokeStyle = "#c79a3a"; c.lineWidth = 6; c.beginPath(); c.arc(m, m, m * 0.6, 0, 7); c.stroke();
    } else {
      c.fillStyle = "#23395e"; c.beginPath(); c.arc(m, m, m * 0.95, 0, 7); c.fill();
      c.fillStyle = "#d8d2c0"; c.beginPath(); c.arc(m, m, m * 0.75, 0, 7); c.fill();
      c.fillStyle = "#b8902e"; c.fillRect(m - 12, m * 0.35, 24, m * 1.3); c.fillRect(m * 0.35, m - 12, m * 1.3, 24);
    }
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(30,20,10,${rnd(0.03, 0.2)})`; c.fillRect(rnd(0, s), rnd(0, s), rnd(1, 8), rnd(1, 3)); }
    c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 2;
    for (let x = 0; x < s; x += 26) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, s); c.stroke(); } // planks
  });
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
/** A tapered cylinder from point a to point b. */
function limb(scene: Scene, a: Vector3, b: Vector3, r1: number, r2: number, tess = 8): Mesh {
  const d = b.subtract(a), len = d.length();
  const m = MeshBuilder.CreateCylinder("limb", { height: len, diameterTop: r2 * 2, diameterBottom: r1 * 2, tessellation: tess }, scene);
  m.position = a.add(d.scale(0.5));
  const up = new Vector3(0, 1, 0), dir = d.normalize();
  const axis = Vector3.Cross(up, dir); const ang = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(up, dir))));
  if (axis.length() > 1e-6) m.rotate(axis.normalize(), ang);
  return m;
}
function lathe(scene: Scene, pts: [number, number][], tess = 12, arc = 1): Mesh {
  return MeshBuilder.CreateLathe("lathe", { shape: pts.map(([r, y]) => new Vector3(r, y, 0)), tessellation: tess, arc, closed: arc === 1, sideOrientation: Mesh.DOUBLESIDE }, scene);
}

interface Mats { armour: StandardMaterial; cloth: StandardMaterial; trousers: StandardMaterial; metal: StandardMaterial; mail: StandardMaterial; leather: StandardMaterial; skin: StandardMaterial; wood: StandardMaterial; shield: StandardMaterial; cloak: StandardMaterial }
const matCache = new Map<number, Mats>();

function mats(scene: Scene, team: Team): Mats {
  if (matCache.has(team)) return matCache.get(team)!;
  const mk = (n: string, t?: Texture, col?: Color3, spec = 0.05, pow = 16) => {
    const m = new StandardMaterial(n + team, scene);
    if (t) m.diffuseTexture = t; if (col) m.diffuseColor = col;
    m.specularColor = new Color3(spec, spec, spec); m.specularPower = pow;
    return m;
  };
  const tunic: [number, number, number] = team === 0 ? [105, 28, 22] : [190, 182, 160];
  const trousers: [number, number, number] = team === 0 ? [70, 58, 45] : [55, 62, 80];
  const cloak: [number, number, number] = team === 0 ? [80, 22, 18] : [40, 58, 95];
  const m: Mats = {
    armour: mk("arm", lamellar(scene, team === 0 ? "#6e1710" : "#23395e"), undefined, 0.45, 40),
    cloth: mk("cloth", cloth(scene, "tunic" + team, tunic)),
    trousers: mk("trou", cloth(scene, "trou" + team, trousers)),
    metal: mk("metal", undefined, new Color3(0.42, 0.42, 0.44), 0.7, 64),
    mail: mk("mail", mail(scene), undefined, 0.4, 32),
    leather: mk("leather", leather(scene)),
    skin: mk("skin", skin(scene)),
    wood: mk("wood", undefined, new Color3(0.36, 0.25, 0.15)),
    shield: mk("shield", shieldTex(scene, team), undefined, 0.1),
    cloak: mk("cloak", cloth(scene, "cloak" + team, cloak)),
  };
  (m.armour.diffuseTexture as Texture).uScale = 3; (m.armour.diffuseTexture as Texture).vScale = 2;
  (m.mail.diffuseTexture as Texture).uScale = 4; (m.mail.diffuseTexture as Texture).vScale = 2;
  m.cloak.backFaceCulling = false;
  matCache.set(team, m);
  return m;
}

/**
 * A 10th-century soldier built from ~40 parts and merged into one mesh with several materials.
 * Facing +z, feet at y = 0. For riders the hip sits at y = 0 (placed on the saddle by the caller).
 */
export function buildSoldier(scene: Scene, team: Team, kind: Kind): Mesh {
  const M = mats(scene, team);
  const parts: [Mesh, Material][] = [];
  const add = (m: Mesh, mat: Material) => { parts.push([m, mat]); return m; };
  const rider = kind === "cav";
  const archer = kind === "arch";
  const H = rider ? -0.95 : 0; // vertical offset: riders are modelled with the hip at 0
  const v = (x: number, y: number, z: number) => new Vector3(x, y + H, z);

  // legs
  for (const s of [-1, 1]) {
    if (!rider) {
      add(limb(scene, v(s * 0.1, 0.93, 0), v(s * 0.11, 0.5, 0.02), 0.085, 0.06), M.trousers);
      add(limb(scene, v(s * 0.11, 0.5, 0.02), v(s * 0.11, 0.12, 0), 0.06, 0.05), M.trousers);
      add(limb(scene, v(s * 0.11, 0.3, 0), v(s * 0.11, 0.0, 0.03), 0.058, 0.062), M.leather); // boot
      const foot = add(MeshBuilder.CreateBox("foot", { width: 0.1, height: 0.07, depth: 0.24 }, scene), M.leather);
      foot.position = v(s * 0.11, 0.035, 0.06);
    } else {
      add(limb(scene, v(s * 0.12, 0.95, 0), v(s * 0.3, 0.62, 0.28), 0.085, 0.065), M.trousers);
      add(limb(scene, v(s * 0.3, 0.62, 0.28), v(s * 0.3, 0.22, 0.12), 0.06, 0.05), M.leather);
      const foot = add(MeshBuilder.CreateBox("foot", { width: 0.1, height: 0.07, depth: 0.24 }, scene), M.leather);
      foot.position = v(s * 0.3, 0.2, 0.2);
    }
  }
  // tunic skirt below the armour
  if (!rider) add(lathe(scene, [[0.17, 0.98], [0.21, 0.8], [0.26, 0.55]], 12), M.cloth).position.y = H;
  else add(lathe(scene, [[0.17, 0.98], [0.24, 0.88]], 12), M.cloth).position.y = H;
  // torso: lamellar for infantry and riders, padded coat for archers
  const torso = add(lathe(scene, [[0.0, 0.92], [0.17, 0.93], [0.185, 1.05], [0.2, 1.22], [0.21, 1.33], [0.19, 1.43], [0.11, 1.5], [0.0, 1.5]], 14), archer ? M.cloth : M.armour);
  torso.scaling.z = 0.72; torso.position.y = H;
  // belt
  const belt = add(MeshBuilder.CreateTorus("belt", { diameter: 0.36, thickness: 0.035, tessellation: 14 }, scene), M.leather);
  belt.scaling.z = 0.75; belt.position = v(0, 0.97, 0);
  // cloak over the shoulders
  const cloak = add(lathe(scene, [[0.2, 1.47], [0.27, 1.3], [0.32, rider ? 1.0 : 0.75]], 12, 0.5), M.cloak);
  cloak.rotation.y = Math.PI / 2; cloak.scaling.z = 0.8; cloak.position = v(0, 0, -0.03);
  // neck, head, beard
  add(limb(scene, v(0, 1.47, 0), v(0, 1.57, 0.01), 0.055, 0.05), M.skin);
  const head = add(MeshBuilder.CreateSphere("head", { diameter: 0.22, segments: 10 }, scene), M.skin);
  head.scaling.set(0.92, 1.1, 1); head.position = v(0, 1.66, 0.01);
  const nose = add(MeshBuilder.CreateBox("nose", { width: 0.03, height: 0.05, depth: 0.04 }, scene), M.skin); nose.position = v(0, 1.65, 0.115);
  // helmet: conical spangenhelm with nasal and mail aventail
  add(lathe(scene, [[0.0, 1.9], [0.03, 1.87], [0.08, 1.8], [0.112, 1.72], [0.118, 1.68], [0.122, 1.665]], 14), M.metal).position.y = H;
  const nasal = add(MeshBuilder.CreateBox("nasal", { width: 0.025, height: 0.1, depth: 0.012 }, scene), M.metal); nasal.position = v(0, 1.64, 0.122);
  const aventail = add(lathe(scene, [[0.122, 1.67], [0.13, 1.56], [0.17, 1.47]], 14, 0.72), M.mail);
  aventail.rotation.y = Math.PI * 0.86; aventail.position.y = H;
  // shoulders and arms
  for (const s of [-1, 1]) {
    const pad = add(MeshBuilder.CreateSphere("shoulder", { diameter: 0.17, segments: 6 }, scene), archer ? M.cloth : M.armour);
    pad.position = v(s * 0.22, 1.4, 0); pad.scaling.y = 0.8;
  }
  const lE = v(-0.27, 1.15, 0.05), rE = v(0.29, 1.15, 0.02);
  add(limb(scene, v(-0.23, 1.39, 0), lE, 0.055, 0.045), archer ? M.cloth : M.mail);
  add(limb(scene, v(0.23, 1.39, 0), rE, 0.055, 0.045), archer ? M.cloth : M.mail);
  const lH = archer ? v(-0.3, 1.25, 0.42) : v(-0.22, 1.12, 0.28);
  const rH = archer ? v(0.05, 1.3, 0.2) : v(0.28, 1.2, 0.26);
  add(limb(scene, lE, lH, 0.045, 0.038), M.leather); // bracers
  add(limb(scene, rE, rH, 0.045, 0.038), M.leather);
  for (const h of [lH, rH]) { const hand = add(MeshBuilder.CreateSphere("hand", { diameter: 0.075, segments: 6 }, scene), M.skin); hand.position = h; }

  if (archer) {
    // recurved composite bow held upright in the left hand
    const pts: Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16 * 2 - 1;
      pts.push(new Vector3(-0.3, 1.25 + H + t * 0.62, 0.42 + 0.12 * (1 - t * t) - 0.06 * Math.pow(Math.abs(t), 6)));
    }
    add(MeshBuilder.CreateTube("bow", { path: pts, radius: 0.014, tessellation: 5 }, scene), M.wood);
    add(MeshBuilder.CreateTube("string", { path: [pts[0], pts[16]], radius: 0.003, tessellation: 3 }, scene), M.cloth);
    // quiver with arrows on the back-right hip
    const q = add(limb(scene, v(0.18, 0.75, -0.18), v(0.25, 1.25, -0.22), 0.06, 0.07), M.leather); void q;
    for (let i = 0; i < 6; i++) add(limb(scene, v(0.22 + rnd(-0.03, 0.03), 1.2, -0.21 + rnd(-0.03, 0.03)), v(0.25 + rnd(-0.04, 0.04), 1.42, -0.23), 0.006, 0.006, 3), M.wood);
  } else {
    // round shield on the left arm, boss and iron rim
    const sh = add(MeshBuilder.CreateCylinder("shield", { diameter: rider ? 0.62 : 0.86, height: 0.025, tessellation: 20 }, scene), M.shield);
    sh.rotation.x = Math.PI / 2; sh.position = lH.add(new Vector3(-0.02, 0, 0.06));
    const boss = add(MeshBuilder.CreateSphere("boss", { diameter: 0.14, segments: 8, slice: 0.5 }, scene), M.metal);
    boss.rotation.x = Math.PI / 2; boss.position = sh.position.add(new Vector3(0, 0, 0.012));
    const rim = add(MeshBuilder.CreateTorus("rim", { diameter: rider ? 0.62 : 0.86, thickness: 0.025, tessellation: 24 }, scene), M.metal);
    rim.rotation.x = Math.PI / 2; rim.position = sh.position.clone();
    // spear (infantry) or lance (cavalry) in the right hand
    const len = rider ? 3.3 : 2.6;
    const tilt = rider ? new Vector3(0, 1, 0.45).normalize() : new Vector3(0, 1, 0.06).normalize();
    const butt = rH.subtract(tilt.scale(rider ? 1.2 : 1.0));
    const tip = butt.add(tilt.scale(len));
    add(limb(scene, butt, tip, 0.017, 0.015, 6), M.wood);
    add(limb(scene, tip, tip.add(tilt.scale(0.28)), 0.03, 0.002, 4), M.metal);
    // sword on the left hip
    add(limb(scene, v(-0.2, 0.98, 0.05), v(-0.24, 0.3, -0.25), 0.025, 0.022, 4), M.leather);
  }

  const meshes = parts.map(p => p[0]);
  const materials = parts.map(p => p[1]);
  // group parts by material so the merged mesh has one submesh per material (fewer draw calls)
  const order = meshes.map((_, i) => i).sort((a, b) => materials.indexOf(materials[a]) - materials.indexOf(materials[b]));
  const groups: Mesh[] = [];
  const multiMats: Material[] = [];
  let cur: Material | null = null, bucket: Mesh[] = [];
  const flush = () => { if (bucket.length) { groups.push(Mesh.MergeMeshes(bucket, true, true)!); multiMats.push(cur!); } bucket = []; };
  for (const i of order) { if (materials[i] !== cur) { flush(); cur = materials[i]; } bucket.push(meshes[i]); }
  flush();
  groups.forEach((g, i) => (g.material = multiMats[i]));
  const merged = Mesh.MergeMeshes(groups, true, true, undefined, true, true)!;
  merged.name = `soldier-${team}-${kind}`;
  merged.isPickable = false;
  merged.alwaysSelectAsActiveMesh = true;
  return merged;
}

// ---------------------------------------------------------------------------
// Horse (glTF with a 15-frame gallop as morph targets)
// ---------------------------------------------------------------------------
/** Scale from model units to metres: withers ~1.5 m, saddle ~1.27 m. */
export const HORSE_SCALE = 0.0105;
export const SADDLE = new Vector3(0, 1.27, -0.3);

export interface HorseModel { mesh: Mesh; anim: AnimationGroup | null }

/**
 * Loads a fresh copy of the horse. The mesh is detached from the glTF root and mirrored on x
 * so its head points to +z in Babylon's left-handed space (the horse is symmetric, so the
 * mirror is invisible). Callers place it with thin instances or by parenting.
 */
export async function loadHorse(scene: Scene, url: string): Promise<HorseModel> {
  const c = await LoadAssetContainerAsync(url, scene);
  c.addAllToScene();
  const mesh = c.meshes.find(m => m.getTotalVertices() > 0) as Mesh;
  mesh.setParent(null);
  mesh.rotationQuaternion = null;
  mesh.position.setAll(0); mesh.rotation.setAll(0); mesh.scaling.setAll(1);
  for (const m of c.meshes) if (m !== mesh) m.dispose();
  if (mesh.material) {
    mesh.material.backFaceCulling = false;
  }
  mesh.isPickable = false;
  const anim = c.animationGroups[0] ?? null;
  return { mesh, anim };
}
