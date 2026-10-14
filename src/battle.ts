import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Matrix, Vector3, ParticleSystem } from "@babylonjs/core";
import { heightAt } from "./world";
import { buildSoldier, HORSE_SCALE, SADDLE } from "./models";

export type Team = 0 | 1; // 0 = Bulgarians, 1 = Byzantines
export type Kind = "inf" | "arch" | "cav";
export type Order = "hold" | "advance" | "charge" | "follow" | "fallback";

export interface Soldier {
  u: Unit; x: number; z: number; yaw: number; hp: number; alive: boolean;
  ox: number; oz: number; cd: number; phase: number; moving: number;
  target: Soldier | null; scan: number; deadPitch: number;
}
export interface Unit {
  name: string; team: Team; kind: Kind; order: Order;
  ax: number; az: number; facing: number; soldiers: Soldier[];
  total: number; routed: boolean; hidden: boolean; shock: number; fireLeft: number; fireT: number; orderT: number;
}

const GRAVITY = 9.8;
const CELL = 4;

interface Arrow { x: number; y: number; z: number; vx: number; vy: number; vz: number; stuck: number; team: Team }

export class Battle {
  units: Unit[] = [];
  soldiers: Soldier[] = [];
  arrows: Arrow[] = [];
  grid = new Map<number, Soldier[]>();
  meshes = new Map<string, { mesh: Mesh; list: Soldier[]; buf: Float32Array }>();
  arrowMesh: Mesh; arrowBuf: Float32Array;
  rally = 0; // seconds of Bulgarian battle fury after a shout
  fighting = 0; clashX = 0; clashZ = 0;
  player = { x: 0, z: 0, yaw: 0 };
  onKill?: (s: Soldier) => void;
  onVolley?: (x: number, z: number) => void;
  private tmp = new Matrix();
  private horseFix = Matrix.Scaling(-HORSE_SCALE, HORSE_SCALE, HORSE_SCALE);
  horseRun: Mesh | null = null; horseIdle: Mesh | null = null;
  private runBuf = new Float32Array(0); private idleBuf = new Float32Array(0);

  /** Real horse models for the cavalry: one copy galloping, one standing. */
  setHorses(run: Mesh, idle: Mesh) {
    const n = this.soldiers.filter(s => s.u.kind === "cav").length;
    this.horseRun = run; this.horseIdle = idle;
    this.runBuf = new Float32Array(n * 16); this.idleBuf = new Float32Array(n * 16);
    for (const m of [run, idle]) { m.alwaysSelectAsActiveMesh = true; }
    run.thinInstanceSetBuffer("matrix", this.runBuf, 16, false);
    idle.thinInstanceSetBuffer("matrix", this.idleBuf, 16, false);
  }

  constructor(private scene: Scene, private dust: ParticleSystem) {
    const arrow = MeshBuilder.CreateBox("arrow", { width: 0.03, height: 0.03, depth: 0.9 }, scene);
    const am = new StandardMaterial("am", scene); am.diffuseColor = new Color3(0.2, 0.15, 0.1); arrow.material = am;
    arrow.alwaysSelectAsActiveMesh = true; arrow.isPickable = false;
    this.arrowMesh = arrow; this.arrowBuf = new Float32Array(16 * 4000);
  }

  addUnit(name: string, team: Team, kind: Kind, cols: number, rows: number, ax: number, az: number, facing: number): Unit {
    const u: Unit = { name, team, kind, order: "hold", ax, az, facing, soldiers: [], total: cols * rows, routed: false, hidden: false, shock: 0, fireLeft: 0, fireT: 0, orderT: 0 };
    const sp = kind === "cav" ? 2.6 : 1.3;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ox = (c - (cols - 1) / 2) * sp + (Math.random() - 0.5) * 0.3;
      const oz = -r * sp * 1.1 + (Math.random() - 0.5) * 0.3;
      const s: Soldier = { u, x: 0, z: 0, yaw: facing, hp: kind === "cav" ? 5 : kind === "arch" ? 2 : 4, alive: true, ox, oz, cd: Math.random(), phase: Math.random() * 6, moving: 0, target: null, scan: Math.random() * 0.4, deadPitch: 0 };
      const p = this.slot(s); s.x = p[0]; s.z = p[1];
      u.soldiers.push(s); this.soldiers.push(s);
    }
    const key = team + kind;
    if (!this.meshes.has(key)) this.meshes.set(key, { mesh: buildSoldier(this.scene, team, kind), list: [], buf: new Float32Array(0) });
    this.meshes.get(key)!.list.push(...u.soldiers);
    this.units.push(u);
    return u;
  }

  finalize() {
    for (const g of this.meshes.values()) {
      g.buf = new Float32Array(g.list.length * 16);
      g.mesh.thinInstanceSetBuffer("matrix", g.buf, 16, false);
    }
    this.arrowMesh.thinInstanceSetBuffer("matrix", this.arrowBuf, 16, false);
    this.arrowMesh.thinInstanceCount = 0;
  }

  slot(s: Soldier): [number, number] {
    const u = s.u, c = Math.cos(u.facing), sn = Math.sin(u.facing);
    // local x is to the right of facing, local z forward
    return [u.ax + s.ox * c + s.oz * sn, u.az - s.ox * sn + s.oz * c];
  }

  alive(u: Unit) { let n = 0; for (const s of u.soldiers) if (s.alive) n++; return n; }

  center(u: Unit): [number, number, number] {
    let x = 0, z = 0, n = 0;
    for (const s of u.soldiers) if (s.alive) { x += s.x; z += s.z; n++; }
    return n ? [x / n, z / n, n] : [u.ax, u.az, 0];
  }

  nearestEnemyUnit(u: Unit): Unit | null {
    const [cx, cz] = this.center(u);
    let best: Unit | null = null, bd = Infinity;
    for (const o of this.units) {
      if (o.team === u.team || o.routed || o.hidden || this.alive(o) === 0) continue;
      const [ox, oz] = this.center(o); const d = (ox - cx) ** 2 + (oz - cz) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  command(team: Team, kinds: Kind[], order: Order) {
    for (const u of this.units) if (u.team === team && kinds.includes(u.kind) && !u.routed) {
      u.order = order; u.orderT = 0; u.hidden = false;
      if (order === "follow" || order === "fallback") for (const s of u.soldiers) s.target = null;
    }
  }

  fire(team: Team, volleys: number) {
    for (const u of this.units) if (u.team === team && u.kind === "arch" && !u.routed) { u.fireLeft = volleys; u.fireT = 0.4; }
  }

  private key(x: number, z: number) { return ((Math.floor(x / CELL) + 1024) << 11) | (Math.floor(z / CELL) + 1024); }

  private nearestFoe(s: Soldier, radius: number): Soldier | null {
    const r = Math.ceil(radius / CELL), cx = Math.floor(s.x / CELL), cz = Math.floor(s.z / CELL);
    let best: Soldier | null = null, bd = radius * radius;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const cell = this.grid.get(((cx + i + 1024) << 11) | (cz + j + 1024)); if (!cell) continue;
      for (const o of cell) {
        if (!o.alive || o.u.team === s.u.team) continue;
        const d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2; if (d < bd) { bd = d; best = o; }
      }
    }
    return best;
  }

  damage(t: Soldier, amount: number, fromX: number, fromZ: number) {
    if (!t.alive) return;
    t.hp -= amount;
    if (t.hp <= 0) {
      t.alive = false; t.deadPitch = 0.01;
      t.yaw = Math.atan2(t.x - fromX, t.z - fromZ);
      this.onKill?.(t);
    }
  }

  /** Damage enemies in a cone in front of the general (sword swing). Returns hits. */
  swing(x: number, z: number, yaw: number): number {
    let hits = 0;
    const probe = { x, z, u: { team: 0 } } as unknown as Soldier;
    for (let k = 0; k < 4; k++) {
      const t = this.nearestFoe(probe, 3.6); if (!t) break;
      const a = Math.atan2(t.x - x, t.z - z); let d = a - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 1.0) break;
      this.damage(t, 3, x, z); hits++;
    }
    return hits;
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.rally = Math.max(0, this.rally - dt);
    this.grid.clear();
    for (const s of this.soldiers) if (s.alive) {
      const k = this.key(s.x, s.z); let c = this.grid.get(k); if (!c) this.grid.set(k, c = []); c.push(s);
    }

    // ---- units ----
    for (const u of this.units) {
      u.orderT += dt; u.shock = Math.max(0, u.shock - dt);
      const n = this.alive(u);
      if (n === 0) continue;
      const foe = this.nearestEnemyUnit(u);
      // morale
      const ratio = n / u.total;
      if (!u.routed && u.team === 1 && (ratio < 0.5 || (u.shock > 0 && ratio < 0.75))) u.routed = true;
      if (!u.routed && u.team === 0 && ratio < 0.15) u.routed = true;
      if (u.routed) continue;
      const [cx, cz] = this.center(u);
      if (u.order === "follow") {
        const behind = u.kind === "cav" ? 14 : 8;
        const tx = this.player.x - Math.sin(this.player.yaw) * behind, tz = this.player.z - Math.cos(this.player.yaw) * behind;
        u.ax += (tx - u.ax) * Math.min(1, dt * 2); u.az += (tz - u.az) * Math.min(1, dt * 2);
        u.facing = this.player.yaw;
      } else if (foe) {
        const [fx, fz] = this.center(foe);
        const dx = fx - cx, dz = fz - cz, d = Math.hypot(dx, dz) || 1;
        const want = Math.atan2(dx, dz);
        if (u.order === "advance" || u.order === "charge") {
          u.facing = want;
          const v = u.order === "charge" ? (u.kind === "cav" ? 9 : 3.2) : (u.kind === "cav" ? 3 : 1.6);
          if (d > 3) { u.ax += dx / d * v * dt; u.az += dz / d * v * dt; }
          // the Byzantine lines break into a run for the last stretch
          if (u.team === 1 && u.order === "advance" && d < 35) { u.order = "charge"; u.orderT = 0; }
        } else if (u.order === "fallback") {
          if (u.orderT < 12) { u.ax -= dx / d * 1.3 * dt; u.az -= dz / d * 1.3 * dt; } else u.order = "hold";
        } else if (u.order === "hold" && d < 80) {
          let df = want - u.facing; df = Math.atan2(Math.sin(df), Math.cos(df)); u.facing += df * Math.min(1, dt * 0.3);
        }
      }
      // archers
      if (u.kind === "arch" && u.fireLeft > 0 && foe) {
        u.fireT -= dt;
        if (u.fireT <= 0) {
          const [fx, fz] = this.center(foe);
          if (Math.hypot(fx - cx, fz - cz) < 165) { u.fireLeft--; u.fireT = 5; this.volley(u, foe); } else u.fireT = 0.5;
        }
      }
    }

    // ---- soldiers ----
    let fighting = 0, fx = 0, fz = 0;
    for (const s of this.soldiers) {
      if (!s.alive) { if (s.deadPitch > 0 && s.deadPitch < 1.5) s.deadPitch = Math.min(1.5, s.deadPitch + dt * 3); continue; }
      const u = s.u;
      s.cd -= dt; s.scan -= dt;
      const cav = u.kind === "cav";
      let vmax = cav ? (u.order === "follow" || u.order === "charge" ? 13 : 4) : (u.order === "charge" ? 4.5 : 2.2);
      let tx: number, tz: number;
      if (u.routed) {
        const foe = this.nearestEnemyUnit(u);
        const [ex, ez] = foe ? this.center(foe) : [s.x, s.z - 1];
        const dx = s.x - ex, dz = s.z - ez, d = Math.hypot(dx, dz) || 1;
        tx = s.x + dx / d * 10; tz = s.z + dz / d * 10; vmax = cav ? 10 : 4.2; s.target = null;
      } else {
        const engage = u.order === "charge" ? (cav ? 14 : 9) : u.order === "follow" ? 0 : u.kind === "arch" ? 4 : 5;
        if (s.scan <= 0) { s.scan = 0.3 + Math.random() * 0.2; s.target = engage > 0 ? this.nearestFoe(s, engage) : null; }
        if (s.target && !s.target.alive) s.target = null;
        const sl = this.slot(s);
        tx = sl[0]; tz = sl[1];
        if (s.target) {
          const t = s.target, dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz);
          const reach = cav || t.u.kind === "cav" ? 2.4 : 1.5;
          if (u.order === "hold" && Math.hypot(t.x - sl[0], t.z - sl[1]) > 6) { s.target = null; }
          else if (d <= reach) {
            tx = s.x; tz = s.z; s.yaw = Math.atan2(dx, dz);
            fighting++; fx += s.x; fz += s.z;
            if (s.cd <= 0) {
              s.cd = 0.9 + Math.random() * 0.9;
              let p = 0.3;
              if (u.team === 0 && this.rally > 0) p *= 1.6;
              if (cav && u.orderT < 4 && u.order === "charge") { p = u.team === 0 ? 0.8 : 0.5; t.u.shock = 4; }
              if (u.kind === "arch") p *= 0.5;
              if (Math.random() < p) this.damage(t, cav ? 2 : 1, s.x, s.z);
            }
          } else { tx = t.x - dx / d * reach * 0.9; tz = t.z - dz / d * reach * 0.9; }
        }
      }
      const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
      if (d > 0.15) {
        const v = Math.min(vmax, d * 1.5);
        s.x += dx / d * v * dt; s.z += dz / d * v * dt;
        s.moving = v;
        if (!s.target || d > 2.5) { let dy = Math.atan2(dx, dz) - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * Math.min(1, dt * 5); }
      } else {
        s.moving = 0;
        if (!s.target) { let dy = u.facing - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * Math.min(1, dt * 3); }
      }
      s.phase += dt * (2 + s.moving * (cav ? 1.2 : 2.4));
    }
    // separation so soldiers do not stack (neighbours in the same cell only, cheap)
    for (const cell of this.grid.values()) {
      for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) {
        const a = cell[i], b = cell[j]; const dx = b.x - a.x, dz = b.z - a.z; const d2 = dx * dx + dz * dz;
        const min = a.u.kind === "cav" || b.u.kind === "cav" ? 1.8 : 0.9;
        if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), push = (min - d) * 0.5; a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push; }
      }
    }
    this.fighting = fighting;
    if (fighting) { this.clashX = fx / fighting; this.clashZ = fz / fighting; }
    (this.dust.emitter as Vector3).set(this.clashX, heightAt(this.clashX, this.clashZ), this.clashZ);
    this.dust.emitRate = Math.min(120, fighting * 0.4);

    this.updateArrows(dt);
    this.render();
  }

  private volley(u: Unit, foe: Unit) {
    const targets = foe.soldiers.filter(s => s.alive);
    if (!targets.length) return;
    let sx = 0, sz = 0, n = 0;
    for (const s of u.soldiers) {
      if (!s.alive || this.arrows.length > 3800) continue;
      const t = targets[(Math.random() * targets.length) | 0];
      const ex = t.x + (Math.random() - 0.5) * 7, ez = t.z + (Math.random() - 0.5) * 7;
      const dx = ex - s.x, dz = ez - s.z, dist = Math.hypot(dx, dz);
      if (dist > 180) continue;
      const T = Math.max(1.6, Math.min(4, dist / 30)) * (0.95 + Math.random() * 0.1);
      const y0 = heightAt(s.x, s.z) + 1.6;
      this.arrows.push({ x: s.x, y: y0, z: s.z, vx: dx / T, vz: dz / T, vy: (heightAt(ex, ez) - y0) / T + 0.5 * GRAVITY * T, stuck: 0, team: u.team });
      sx += s.x; sz += s.z; n++;
    }
    if (n) this.onVolley?.(sx / n, sz / n);
  }

  private updateArrows(dt: number) {
    const probe = { x: 0, z: 0, u: { team: 0 } } as unknown as Soldier;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.stuck > 0) { a.stuck -= dt; if (a.stuck <= 0) { this.arrows[i] = this.arrows[this.arrows.length - 1]; this.arrows.pop(); } continue; }
      a.vy -= GRAVITY * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      const g = heightAt(a.x, a.z);
      if (a.y <= g + 0.1) {
        a.y = g + 0.1; a.stuck = 10;
        probe.x = a.x; probe.z = a.z; (probe.u as { team: Team }).team = a.team;
        const t = this.nearestFoe(probe, 1.1);
        if (t && Math.random() < 0.55) this.damage(t, 2, a.x - a.vx, a.z - a.vz);
      }
    }
  }

  private render() {
    const m = this.tmp, hm = new Matrix(), hm2 = new Matrix();
    let nRun = 0, nIdle = 0;
    for (const g of this.meshes.values()) {
      const buf = g.buf;
      for (let i = 0; i < g.list.length; i++) {
        const s = g.list[i];
        const cav = s.u.kind === "cav";
        const gy = heightAt(s.x, s.z);
        if (cav) {
          const fwdX = Math.sin(s.yaw), fwdZ = Math.cos(s.yaw);
          const running = s.alive && s.moving > 1.5;
          const bob = s.alive ? (running ? Math.abs(Math.sin(s.phase * 1.3)) * 0.12 : Math.sin(s.phase * 0.3) * 0.01) : 0;
          // horse
          Matrix.RotationYawPitchRollToRef(s.yaw, 0, s.alive ? 0 : s.deadPitch, hm);
          hm.setTranslationFromFloats(s.x, gy - (s.alive ? 0 : 0.35 * s.deadPitch / 1.5), s.z);
          this.horseFix.multiplyToRef(hm, hm2);
          if (running) { hm2.copyToArray(this.runBuf, nRun * 16); nRun++; } else { hm2.copyToArray(this.idleBuf, nIdle * 16); nIdle++; }
          // rider in the saddle, or thrown to the ground beside the horse
          if (s.alive) {
            Matrix.RotationYawPitchRollToRef(s.yaw, s.target && s.cd > 0.6 ? 0.12 : 0, 0, m);
            m.setTranslationFromFloats(s.x + fwdX * SADDLE.z, gy + SADDLE.y + bob, s.z + fwdZ * SADDLE.z);
          } else {
            Matrix.RotationYawPitchRollToRef(s.yaw + 1.2, 1.4, 0, m);
            m.setTranslationFromFloats(s.x + fwdZ * 1.4, gy + 0.2, s.z - fwdX * 1.4);
          }
        } else {
          const bob = s.alive ? Math.abs(Math.sin(s.phase)) * (s.moving > 0.2 ? 0.06 : 0.008) : 0;
          const pitch = s.alive ? (s.target && s.cd > 0.6 ? 0.15 : 0) : s.deadPitch;
          Matrix.RotationYawPitchRollToRef(s.yaw, pitch, 0, m);
          m.setTranslationFromFloats(s.x, gy + bob - (!s.alive ? s.deadPitch * 0.08 : 0), s.z);
        }
        m.copyToArray(buf, i * 16);
      }
      g.mesh.thinInstanceBufferUpdated("matrix");
    }
    if (this.horseRun && this.horseIdle) {
      this.horseRun.thinInstanceCount = nRun; this.horseIdle.thinInstanceCount = nIdle;
      this.horseRun.thinInstanceBufferUpdated("matrix"); this.horseIdle.thinInstanceBufferUpdated("matrix");
    }
    const ab = this.arrowBuf;
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i];
      const h = Math.hypot(a.vx, a.vz);
      Matrix.RotationYawPitchRollToRef(Math.atan2(a.vx, a.vz), a.stuck > 0 ? 0.9 : -Math.atan2(a.vy, h), 0, m);
      m.setTranslationFromFloats(a.x, a.y, a.z);
      m.copyToArray(ab, i * 16);
    }
    this.arrowMesh.thinInstanceCount = this.arrows.length;
    this.arrowMesh.thinInstanceBufferUpdated("matrix");
  }
}

export function setupArmies(b: Battle) {
  const N = Math.PI; // facing south
  // Bulgarians (north)
  b.addUnit("Пехота · ляво", 0, "inf", 40, 6, -70, 160, N);
  b.addUnit("Пехота · център", 0, "inf", 40, 6, 0, 160, N);
  b.addUnit("Пехота · дясно", 0, "inf", 40, 6, 70, 160, N);
  b.addUnit("Стрелци", 0, "arch", 60, 4, 0, 180, N);
  b.addUnit("Конница", 0, "cav", 25, 8, -210, 120, N + 0.5).hidden = true;
  // Byzantines (south)
  b.addUnit("Ромеи · ляво", 1, "inf", 45, 7, -80, -40, 0);
  b.addUnit("Ромеи · център", 1, "inf", 45, 7, 0, -40, 0);
  b.addUnit("Ромеи · дясно", 1, "inf", 45, 7, 80, -40, 0);
  b.addUnit("Ромейска конница", 1, "cav", 20, 6, 170, -60, 0);
  b.finalize();
}

