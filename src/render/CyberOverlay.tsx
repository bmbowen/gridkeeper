"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { findPath, linkCovered, sensorActive, topology } from "@/sim/engine";
import type { LinkDef, MissionDef, NodeDef, ZoneDef } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { useGame } from "@/state/game";
import { Label, Selectable } from "./parts";
import { arcCurve, game, nodeAnchor, PALETTE } from "./util";

const C = {
  cyan: new THREE.Color(PALETTE.cyan),
  amber: new THREE.Color(PALETTE.amber),
  red: new THREE.Color(PALETTE.red),
  green: new THREE.Color(PALETTE.green),
  grey: new THREE.Color("#55606e"),
  dim: new THREE.Color("#3f7396"),
  violet: new THREE.Color(PALETTE.violet),
  white: new THREE.Color("#ffffff"),
};

function basic(opts: Partial<THREE.MeshBasicMaterialParameters> = {}) {
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...opts });
  m.toneMapped = false;
  return m;
}

/** Link curves keyed by link id, running a → b. */
function useLinkCurves(mission: MissionDef) {
  return useMemo(() => {
    const topo = topology(mission);
    const map: Record<string, THREE.QuadraticBezierCurve3> = {};
    for (const l of mission.links) map[l.id] = arcCurve(nodeAnchor(topo.node[l.a].pos), nodeAnchor(topo.node[l.b].pos));
    return map;
  }, [mission]);
}

// ------------------------------------------------------------------ zones

function Zone({ zone }: { zone: ZoneDef }) {
  const [x0, z0, x1, z1] = zone.rect;
  const fill = useMemo(() => basic({ color: zone.color, opacity: 0, side: THREE.DoubleSide }), [zone.color]);
  const edge = useMemo(() => {
    const pts = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
      [x0, z0],
    ].map(([x, z]) => new THREE.Vector3(x, 0.12, z));
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(zone.color).multiplyScalar(1.6), transparent: true, opacity: 0, toneMapped: false });
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m);
  }, [x0, z0, x1, z1, zone.color]);
  // Corner posts make the zone read as a volume.
  const posts = useMemo(() => basic({ color: new THREE.Color(zone.color).multiplyScalar(1.4), opacity: 0 }), [zone.color]);
  useFrame(({ clock }) => {
    const mix = viewFx.mix;
    fill.opacity = mix * (0.07 + Math.sin(clock.elapsedTime * 0.8) * 0.012);
    (edge.material as THREE.LineBasicMaterial).opacity = mix * 0.9;
    posts.opacity = mix * 0.7;
    edge.visible = mix > 0.01;
  });
  return (
    <group>
      <mesh material={fill} position={[(x0 + x1) / 2, 0.1, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} scale={[x1 - x0, z1 - z0, 1]}>
        <planeGeometry />
      </mesh>
      <primitive object={edge} />
      {[
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ].map(([x, z], i) => (
        <mesh key={i} material={posts} position={[x, 0.9, z]} scale={[0.12, 1.8, 0.12]}>
          <boxGeometry />
        </mesh>
      ))}
      <Label text={`${zone.name.toUpperCase()} · ${zone.tag}`} p={[x0 + 0.5, 2.6, z1]} color={zone.color} size={0.78} opacityRef={() => viewFx.mix} />
    </group>
  );
}

// ------------------------------------------------------------------ links

const PACKETS = 3;

function Link({ link, curve }: { link: LinkDef; curve: THREE.QuadraticBezierCurve3 }) {
  const mission = useGame((s) => s.mission)!;
  const selected = useGame((s) => s.selected?.type === "link" && s.selected.id === link.id);
  const hovered = useGame((s) => s.hovered?.type === "link" && s.hovered.id === link.id);
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 24, 0.09, 5, false), [curve]);
  const mat = useMemo(() => basic({ opacity: 0 }), []);
  const packets = useRef<THREE.InstancedMesh>(null);
  const packetMat = useMemo(() => basic({ color: new THREE.Color("#bff2ff").multiplyScalar(2.5), opacity: 0 }), []);
  const handle = useRef<THREE.Group>(null);
  const handleMat = useMemo(() => basic({ opacity: 0, wireframe: false }), []);
  const shieldMat = useMemo(() => basic({ color: C.violet.clone().multiplyScalar(2.2), opacity: 0, side: THREE.DoubleSide }), []);
  const mid = useMemo(() => curve.getPoint(0.5), [curve]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const offset = useMemo(() => (link.id.length * 0.37) % 1, [link.id]);

  useFrame(({ clock }) => {
    const g = game();
    const mix = viewFx.mix;
    if (!g) return;
    const ls = g.links[link.id];
    const a = g.nodes[link.a];
    const b = g.nodes[link.b];
    const cut = a.isolated || b.isolated;
    const covered = linkCovered(g, mission, link.id);
    const hot = g.threats.some((t) => t.phase === "moving" && t.link === link.id && t.visible);
    let intensity = 1.5;
    if (cut) {
      col.copy(C.grey);
      intensity = 0.7;
    } else if (hot) {
      col.copy(C.red);
      intensity = 2.2 + Math.sin(clock.elapsedTime * 12) * 0.8;
    } else if (ls.segmented) col.copy(C.violet);
    else if (covered) col.copy(C.cyan);
    else {
      col.copy(C.dim);
      intensity = 1;
    }
    mat.color.copy(col).multiplyScalar(intensity);
    mat.opacity = mix * (cut ? 0.3 : covered || hot ? 0.95 : 0.7);

    // Traffic is only visible where a passive sensor is listening.
    const pm = packets.current;
    if (pm) {
      const show = covered && !cut && mix > 0.05;
      pm.visible = show;
      if (show) {
        packetMat.opacity = mix;
        const speed = ls.segmented ? 0.08 : 0.2;
        for (let i = 0; i < PACKETS; i++) {
          const t = (clock.elapsedTime * speed + i / PACKETS + offset) % 1;
          const dir = i % 2 === 0 ? t : 1 - t;
          curve.getPoint(dir, dummy.position);
          dummy.scale.setScalar(0.14);
          dummy.updateMatrix();
          pm.setMatrixAt(i, dummy.matrix);
        }
        pm.instanceMatrix.needsUpdate = true;
      }
    }
    const h = handle.current;
    if (h) {
      h.visible = !!link.conduit && mix > 0.3;
      if (h.visible) {
        h.rotation.y = clock.elapsedTime * 0.8;
        const s = selected ? 1.5 : hovered ? 1.3 : 1;
        h.scale.setScalar(s);
        handleMat.color.copy(ls.segmented ? C.violet : C.white).multiplyScalar(ls.segmented ? 2.4 : 1.4);
        handleMat.opacity = mix * 0.9;
        shieldMat.opacity = ls.segmented ? mix * (0.35 + Math.sin(clock.elapsedTime * 3) * 0.1) : 0;
      }
    }
  });

  return (
    <group>
      <mesh geometry={geo} material={mat} renderOrder={8} />
      <instancedMesh ref={packets} args={[undefined, undefined, PACKETS]} material={packetMat} frustumCulled={false} renderOrder={9}>
        <sphereGeometry args={[1, 8, 6]} />
      </instancedMesh>
      {link.conduit && (
        <group position={mid}>
          <Selectable pick={{ type: "link", id: link.id }}>
            <group ref={handle}>
              <mesh material={handleMat} renderOrder={10}>
                <octahedronGeometry args={[0.55, 0]} />
              </mesh>
              <mesh material={shieldMat} rotation={[0, 0, Math.PI / 2]} renderOrder={10}>
                <cylinderGeometry args={[1.5, 1.5, 0.08, 6]} />
              </mesh>
              {/* generous invisible hit target */}
              <mesh visible={false}>
                <sphereGeometry args={[1.3, 8, 6]} />
              </mesh>
            </group>
          </Selectable>
        </group>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ node markers

function nodeShape(kind: NodeDef["kind"]) {
  switch (kind) {
    case "gateway":
      return <coneGeometry args={[0.62, 1.1, 4]} />;
    case "switch":
    case "firewall":
      return <cylinderGeometry args={[0.7, 0.7, 0.5, 6]} />;
    case "plc":
    case "rtu":
      return <octahedronGeometry args={[0.7, 0]} />;
    default:
      return <boxGeometry args={[0.95, 0.95, 0.95]} />;
  }
}

function NodeMarker({ node }: { node: NodeDef }) {
  const mission = useGame((s) => s.mission)!;
  const selected = useGame((s) => s.selected?.type === "node" && s.selected.id === node.id);
  const hovered = useGame((s) => s.hovered?.type === "node" && s.hovered.id === node.id);
  const anchor = useMemo(() => nodeAnchor(node.pos), [node.pos]);
  const core = useRef<THREE.Group>(null);
  const coreMat = useMemo(() => basic({ opacity: 0.9 }), []);
  const wireMat = useMemo(() => basic({ wireframe: true, opacity: 0.9 }), []);
  const tether = useMemo(() => {
    const m = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.3, toneMapped: false });
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(node.pos[0], 0.1, node.pos[2]), anchor.clone().setY(anchor.y - 0.7)]);
    return new THREE.Line(g, m);
  }, [node.pos, anchor]);
  const baseMat = useMemo(() => basic({ opacity: 0.4, side: THREE.DoubleSide }), []);
  const sweep = useRef<THREE.Mesh>(null);
  const sweepMat = useMemo(() => basic({ color: C.cyan.clone().multiplyScalar(1.8), opacity: 0, side: THREE.DoubleSide }), []);
  const sensorRing = useMemo(() => basic({ color: C.cyan.clone().multiplyScalar(2), opacity: 0, side: THREE.DoubleSide }), []);
  const shell = useRef<THREE.Mesh>(null);
  const shellMat = useMemo(() => basic({ color: new THREE.Color("#9fd0ff").multiplyScalar(1.6), wireframe: true, opacity: 0 }), []);
  const cage = useRef<THREE.Group>(null);
  const cageMat = useMemo(() => basic({ color: new THREE.Color("#ffffff").multiplyScalar(1.6), opacity: 0, side: THREE.DoubleSide }), []);
  const closing = useRef<THREE.Mesh>(null);
  const closingMat = useMemo(() => basic({ color: C.red.clone().multiplyScalar(2.6), opacity: 0, side: THREE.DoubleSide }), []);
  const decoy = useRef<THREE.Mesh>(null);
  const decoyMat = useMemo(() => basic({ color: new THREE.Color("#ff6bd6").multiplyScalar(2), wireframe: true, opacity: 0 }), []);
  const bar = useRef<THREE.Group>(null);
  const barFill = useRef<THREE.Mesh>(null);
  const barMat = useMemo(() => basic({ color: C.white.clone().multiplyScalar(1.5), opacity: 0.95, depthTest: false }), []);
  const barBg = useMemo(() => basic({ color: "#06111c", opacity: 0.8, depthTest: false }), []);
  const col = useMemo(() => new THREE.Color(), []);
  const scale = useRef(1);

  useFrame(({ clock, camera }, dt) => {
    const g = game();
    if (!g) return;
    const n = g.nodes[node.id];
    const mix = viewFx.mix;
    const time = clock.elapsedTime;
    const vis = 0.38 + mix * 0.62;
    let pulse = 1;
    if (n.isolated) col.copy(C.grey);
    else if (n.knowledge === "confirmed") {
      col.copy(C.red);
      pulse = 1.2 + Math.sin(time * 8) * 0.5;
    } else if (n.knowledge === "suspicious") {
      col.copy(C.amber);
      pulse = 1.2 + Math.sin(time * 5) * 0.45;
    } else col.copy(C.cyan);
    const alarm = n.knowledge !== "none";
    const a = alarm ? Math.max(vis, 0.95) : vis;
    coreMat.color.copy(col).multiplyScalar(0.55 * pulse);
    coreMat.opacity = a * 0.85;
    wireMat.color.copy(col).multiplyScalar(2.2 * pulse);
    wireMat.opacity = a;
    (tether.material as THREE.LineBasicMaterial).color.copy(col);
    (tether.material as THREE.LineBasicMaterial).opacity = a * 0.45;
    baseMat.color.copy(col).multiplyScalar(1.6);
    baseMat.opacity = a * 0.5;

    const target = selected ? 1.35 : hovered ? 1.2 : 1;
    scale.current = THREE.MathUtils.damp(scale.current, target, 10, dt);
    if (core.current) {
      core.current.rotation.y = time * 0.6;
      core.current.position.y = Math.sin(time * 1.4 + node.pos[0]) * 0.12;
      core.current.scale.setScalar(scale.current);
    }

    // Passive sensor: radar sweep. Goes static-red while blinded.
    const hasSensor = n.sensor;
    const active = sensorActive(g, node.id);
    if (sweep.current) {
      sweep.current.visible = hasSensor;
      sweep.current.rotation.z = -time * 1.8;
      sweepMat.color.copy(active ? C.cyan : C.red).multiplyScalar(1.8);
      sweepMat.opacity = hasSensor ? (active ? 0.4 : Math.random() * 0.3) * (0.5 + mix * 0.5) : 0;
      sensorRing.color.copy(active ? C.cyan : C.red).multiplyScalar(2);
      sensorRing.opacity = hasSensor ? 0.8 * (0.5 + mix * 0.5) : 0;
    }
    if (shell.current) {
      shell.current.visible = n.hardened;
      shell.current.rotation.y = -time * 0.3;
      shellMat.opacity = n.hardened ? a * 0.75 : 0;
    }
    if (cage.current) {
      cage.current.visible = n.isolated;
      cage.current.rotation.y = time * 0.5;
      cageMat.opacity = n.isolated ? 0.85 : 0;
    }
    if (decoy.current) {
      decoy.current.visible = n.honeypot;
      decoy.current.position.set(Math.cos(time * 1.5) * 1.5, 0.3, Math.sin(time * 1.5) * 1.5);
      decoyMat.opacity = n.honeypot ? a : 0;
    }
    // Visible intrusion attempt: a red ring closes in on the node.
    let closingP = -1;
    for (const t of g.threats) {
      if (t.node !== node.id || !t.visible || t.contained) continue;
      if (t.phase === "compromising") closingP = Math.max(closingP, t.progress);
      if (t.phase === "arming") closingP = Math.max(closingP, 1 + t.progress);
    }
    if (closing.current) {
      closing.current.visible = closingP >= 0;
      if (closingP >= 0) {
        if (closingP <= 1) {
          closing.current.scale.setScalar(3.4 - closingP * 2.3);
          closingMat.color.copy(C.amber).lerp(C.red, closingP).multiplyScalar(2.6);
          closingMat.opacity = 0.9;
        } else {
          // arming: rapid outward pulses
          const k = (time * 2.4) % 1;
          closing.current.scale.setScalar(1 + k * 3);
          closingMat.color.copy(C.red).multiplyScalar(3);
          closingMat.opacity = 1 - k;
        }
      }
    }
    // Analyst job progress bar.
    const job = g.jobs.find((j) => j.target === node.id);
    if (bar.current) {
      bar.current.visible = !!job;
      if (job && barFill.current) {
        const p = 1 - job.remaining / job.total;
        bar.current.quaternion.copy(camera.quaternion);
        barFill.current.scale.x = Math.max(0.001, p);
        barFill.current.position.x = -1 + p;
        barMat.color.copy(job.type === "remediate" ? C.green : C.amber).multiplyScalar(2);
      }
    }
  });

  return (
    <group>
      <primitive object={tether} />
      <mesh material={baseMat} position={[node.pos[0], 0.14, node.pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.25, 1.45, 32]} />
      </mesh>
      <group position={anchor}>
        <Selectable pick={{ type: "node", id: node.id }}>
          <group ref={core}>
            <mesh material={coreMat} renderOrder={11}>
              {nodeShape(node.kind)}
            </mesh>
            <mesh material={wireMat} scale={1.18} renderOrder={12}>
              {nodeShape(node.kind)}
            </mesh>
            <mesh visible={false}>
              <sphereGeometry args={[1.5, 8, 6]} />
            </mesh>
          </group>
        </Selectable>
        <mesh ref={shell} material={shellMat} visible={false} renderOrder={12}>
          <icosahedronGeometry args={[1.45, 1]} />
        </mesh>
        <group ref={cage} visible={false}>
          <mesh material={cageMat} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.55, 0.05, 6, 32]} />
          </mesh>
          <mesh material={cageMat}>
            <torusGeometry args={[1.55, 0.05, 6, 32]} />
          </mesh>
          <mesh material={cageMat} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[1.55, 0.05, 6, 32]} />
          </mesh>
        </group>
        <mesh ref={decoy} material={decoyMat} visible={false}>
          <tetrahedronGeometry args={[0.4, 0]} />
        </mesh>
        <group position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh ref={sweep} material={sweepMat} visible={false} renderOrder={9}>
            <circleGeometry args={[2.6, 24, 0, Math.PI / 3]} />
          </mesh>
          <mesh material={sensorRing} renderOrder={9}>
            <ringGeometry args={[2.52, 2.62, 48]} />
          </mesh>
        </group>
        <mesh ref={closing} material={closingMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={13}>
          <ringGeometry args={[0.92, 1, 40]} />
        </mesh>
        <group ref={bar} position={[0, 2.5, 0]} visible={false}>
          <mesh material={barBg} scale={[2.2, 0.34, 1]} renderOrder={30}>
            <planeGeometry />
          </mesh>
          <mesh ref={barFill} material={barMat} scale={[1, 0.2, 1]} renderOrder={31}>
            <planeGeometry args={[2, 1]} />
          </mesh>
        </group>
        <Label text={node.name} p={[0, 1.75, 0]} size={0.85} opacityRef={() => (selected || hovered ? 1 : viewFx.mix)} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ controller → equipment tethers

function ControlTethers({ mission }: { mission: MissionDef }) {
  const lines = useMemo(() => {
    const topo = topology(mission);
    return topo.controllers.map((id) => {
      const from = nodeAnchor(topo.node[id].pos);
      const pts: THREE.Vector3[] = [];
      for (const eid of topo.controls[id]) {
        const e = topo.equip[eid];
        pts.push(from, new THREE.Vector3(e.pos[0], e.pos[1] + 2.4, e.pos[2]));
      }
      const m = new THREE.LineDashedMaterial({ transparent: true, opacity: 0, dashSize: 0.5, gapSize: 0.35, toneMapped: false });
      const seg = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m);
      seg.computeLineDistances();
      return { id, seg };
    });
  }, [mission]);
  useFrame(({ clock }) => {
    const g = game();
    if (!g) return;
    for (const { id, seg } of lines) {
      const n = g.nodes[id];
      const m = seg.material as THREE.LineDashedMaterial;
      const bad = n.manipulated || n.arming;
      m.color.copy(bad ? C.red : n.isolated ? C.grey : C.green).multiplyScalar(bad ? 2.5 : 1.3);
      m.opacity = bad ? 0.5 + Math.sin(clock.elapsedTime * 10) * 0.4 : viewFx.mix * 0.4;
      seg.visible = m.opacity > 0.01;
    }
  });
  return (
    <>
      {lines.map((l) => (
        <primitive key={l.id} object={l.seg} />
      ))}
    </>
  );
}

// ------------------------------------------------------------------ threats

const MAX_THREATS = 16;
const MAX_DOTS = 160;

function Threats({ mission, curves }: { mission: MissionDef; curves: Record<string, THREE.QuadraticBezierCurve3> }) {
  const topo = useMemo(() => topology(mission), [mission]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const spikeMat = useMemo(() => basic({ wireframe: true }), []);
  const anomalyMat = useMemo(() => basic({ wireframe: true }), []);
  const coreMat = useMemo(() => basic({ color: C.red.clone().multiplyScalar(3) }), []);
  const anomalyCore = useMemo(() => basic({ color: C.amber.clone().multiplyScalar(2.5) }), []);
  const dots = useRef<THREE.InstancedMesh>(null);
  const dotMat = useMemo(() => basic({ color: C.red.clone().multiplyScalar(2.2), opacity: 0.9 }), []);
  const reticles = useRef<(THREE.Mesh | null)[]>([]);
  const reticleMat = useMemo(() => basic({ color: C.red.clone().multiplyScalar(2.6), opacity: 0.9, side: THREE.DoubleSide }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const pos = useMemo(() => Array.from({ length: MAX_THREATS }, () => new THREE.Vector3()), []);
  const live = useRef(new Map<number, THREE.Vector3>());
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, dt) => {
    const g = game();
    const time = clock.elapsedTime;
    spikeMat.color.copy(C.red).multiplyScalar(2.4 + Math.sin(time * 9) * 0.8);
    anomalyMat.color.copy(C.amber).multiplyScalar(2 + Math.sin(time * 6) * 0.6);
    let slot = 0;
    let dot = 0;
    let ret = 0;
    const seen = new Set<number>();
    if (g) {
      for (const t of g.threats) {
        if (t.phase === "dead" || !t.visible || slot >= MAX_THREATS) continue;
        const grp = refs.current[slot];
        if (!grp) continue;
        // where is it?
        if (t.phase === "moving") {
          const l = topo.link[t.link];
          curves[t.link].getPoint(l.a === t.from ? t.progress : 1 - t.progress, tmp);
        } else {
          const a = topo.node[t.node].pos;
          const r = t.contained ? 0.9 : 1.9;
          const sp = t.contained ? 0.6 : 2.2;
          tmp.set(a[0] + Math.cos(time * sp + t.id) * r, a[1] + 5.2 + Math.sin(time * 3 + t.id) * 0.25, a[2] + Math.sin(time * sp + t.id) * r);
        }
        let p = live.current.get(t.id);
        if (!p) {
          p = tmp.clone();
          live.current.set(t.id, p);
        } else p.lerp(tmp, Math.min(1, dt * 7));
        seen.add(t.id);
        pos[slot].copy(p);
        grp.visible = true;
        grp.position.copy(p);
        grp.rotation.set(time * 2, time * 2.7, 0);
        const s = t.contained ? 0.6 : t.phase === "arming" ? 1.2 + Math.sin(time * 16) * 0.25 : 1;
        grp.scale.setScalar(s);
        (grp.children[0] as THREE.Mesh).material = t.identified ? spikeMat : anomalyMat;
        (grp.children[1] as THREE.Mesh).material = t.identified ? coreMat : anomalyCore;
        slot++;

        // Identified actors reveal their intended route and target.
        if (t.identified && !t.contained && dots.current) {
          const obj = t.objectives[t.objIndex];
          if (obj) {
            const start = t.phase === "moving" ? t.to : t.node;
            const path = findPath(g, mission, start, obj.node, false);
            if (path) {
              for (let i = 0; i < path.length - 1 && dot < MAX_DOTS; i++) {
                const lid = topo.adj[path[i]].find((x) => x.other === path[i + 1])!.link;
                const fwd = topo.link[lid].a === path[i];
                const c = curves[lid];
                const n = Math.max(4, Math.round(c.getLength() / 1.3));
                for (let k = 0; k < n && dot < MAX_DOTS; k++) {
                  const u = ((k + ((time * 1.5) % 1)) / n) % 1;
                  c.getPoint(fwd ? u : 1 - u, dummy.position);
                  dummy.position.y += 0.35;
                  dummy.scale.setScalar(0.1);
                  dummy.updateMatrix();
                  dots.current.setMatrixAt(dot++, dummy.matrix);
                }
              }
            }
            const r = reticles.current[ret];
            if (r && ret < 6) {
              const tp = topo.node[obj.node].pos;
              r.visible = true;
              r.position.set(tp[0], tp[1] + 5.2, tp[2]);
              r.rotation.set(-Math.PI / 2, 0, time * 1.5);
              r.scale.setScalar(1.5 + Math.sin(time * 4) * 0.2);
              ret++;
            }
          }
        }
      }
    }
    for (let i = slot; i < MAX_THREATS; i++) if (refs.current[i]) refs.current[i]!.visible = false;
    for (let i = ret; i < 6; i++) if (reticles.current[i]) reticles.current[i]!.visible = false;
    for (const id of live.current.keys()) if (!seen.has(id)) live.current.delete(id);
    if (dots.current) {
      dots.current.count = dot;
      dots.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_THREATS }, (_, i) => (
        <group key={i} ref={(el) => void (refs.current[i] = el)} visible={false}>
          <mesh material={spikeMat} renderOrder={14}>
            <icosahedronGeometry args={[0.75, 0]} />
          </mesh>
          <mesh material={coreMat} renderOrder={14}>
            <octahedronGeometry args={[0.36, 0]} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={dots} args={[undefined, undefined, MAX_DOTS]} material={dotMat} frustumCulled={false} renderOrder={13}>
        <sphereGeometry args={[1, 6, 4]} />
      </instancedMesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} ref={(el) => void (reticles.current[i] = el)} material={reticleMat} visible={false} renderOrder={13}>
          <ringGeometry args={[1.5, 1.62, 4, 1]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ root

export function CyberOverlay({ mission }: { mission: MissionDef }) {
  const curves = useLinkCurves(mission);
  return (
    <group>
      {mission.zones.map((z) => (
        <Zone key={z.id} zone={z} />
      ))}
      {mission.links.map((l) => (
        <Link key={l.id} link={l} curve={curves[l.id]} />
      ))}
      {mission.nodes.map((n) => (
        <NodeMarker key={n.id} node={n} />
      ))}
      <ControlTethers mission={mission} />
      <Threats mission={mission} curves={curves} />
    </group>
  );
}
