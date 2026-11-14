"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { NodeDef } from "@/sim/types";
import { MAT } from "./materials";
import { Beam, Box, Cyl, Lamp, Selectable } from "./parts";
import { nodeState, PALETTE } from "./util";

/** Screen / LED colour for a network asset reflects what the defender knows about it. */
function useStatusMaterial(id: string, base = PALETTE.cyan) {
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const n = nodeState(id);
    if (!n) return;
    let k = 1.5;
    if (n.isolated) {
      c.set("#1a222c");
      k = 1;
    } else if (n.knowledge === "confirmed") {
      c.set(PALETTE.red);
      k = Math.random() > 0.15 ? 2.2 : 0.4; // glitching
    } else if (n.knowledge === "suspicious") {
      c.set(PALETTE.amber);
      k = 1.6 + Math.sin(clock.elapsedTime * 6) * 0.5;
    } else c.set(base);
    mat.color.copy(c).multiplyScalar(k);
  });
  return mat;
}

const lampState = (id: string) => () => {
  const n = nodeState(id);
  if (!n) return { color: PALETTE.green };
  if (n.isolated) return { color: "#ffffff", flash: false };
  if (n.knowledge === "confirmed") return { color: PALETTE.red, flash: true };
  if (n.knowledge === "suspicious") return { color: PALETTE.amber, flash: true };
  return { color: PALETTE.green };
};

/** Lattice comms mast with dish and aviation light. */
function Gateway({ node }: { node: NodeDef }) {
  const screen = useStatusMaterial(node.id);
  const h = 11;
  return (
    <group>
      <Box p={[0, 0.15, 0]} s={[2.6, 0.3, 2.6]} m={MAT.concrete} />
      {[
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ].map(([x, z], i) => (
        <Beam key={i} a={[x, 0.3, z]} b={[x * 0.25, h, z * 0.25]} radius={0.05} m={MAT.galvanized} />
      ))}
      {Array.from({ length: 7 }, (_, i) => {
        const y = 0.6 + i * 1.5;
        const w = 0.5 - (y / h) * 0.37;
        return (
          <group key={i}>
            <Beam a={[-w, y, -w]} b={[w, y + 1.5, -w]} radius={0.025} m={MAT.galvanized} shadow={false} />
            <Beam a={[w, y, w]} b={[-w, y + 1.5, w]} radius={0.025} m={MAT.galvanized} shadow={false} />
            <Beam a={[-w, y, w]} b={[-w, y + 1.5, -w]} radius={0.025} m={MAT.galvanized} shadow={false} />
            <Beam a={[w, y, -w]} b={[w, y + 1.5, w]} radius={0.025} m={MAT.galvanized} shadow={false} />
          </group>
        );
      })}
      {/* microwave dish */}
      <group position={[0.35, h - 2.2, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <mesh material={MAT.paintLight} castShadow>
          <sphereGeometry args={[1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        </mesh>
      </group>
      <Box p={[-0.4, h - 4, 0]} s={[0.18, 1.6, 0.4]} m={MAT.paintLight} />
      <Box p={[0.4, h - 5.4, 0.2]} s={[0.18, 1.6, 0.4]} m={MAT.paintLight} />
      <Lamp p={[0, h + 0.25, 0]} size={0.2} state={() => ({ color: PALETTE.red, flash: false, off: Math.sin(performance.now() / 500) < 0 })} />
      {/* equipment cabinet */}
      <Box p={[1.6, 0.95, 0]} s={[0.9, 1.6, 0.8]} m={MAT.paintGrey} />
      <mesh material={screen} position={[1.6, 1.25, 0.41]}>
        <planeGeometry args={[0.55, 0.22]} />
      </mesh>
      <Lamp p={[1.6, 1.85, 0]} state={lampState(node.id)} />
    </group>
  );
}

/** 19-inch rack with rows of blinking port LEDs. */
function Rack({ node, wide }: { node: NodeDef; wide?: boolean }) {
  const screen = useStatusMaterial(node.id);
  const w = wide ? 1.7 : 0.9;
  return (
    <group>
      <Box p={[0, 1.15, 0]} s={[w, 2.1, 0.9]} m={MAT.blackMetal} />
      <Box p={[0, 2.24, 0]} s={[w + 0.1, 0.08, 1]} m={MAT.darkSteel} />
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} material={i % 2 === 0 ? screen : MAT.darkSteel} position={[0, 0.5 + i * 0.3, 0.455]}>
          <planeGeometry args={[w - 0.2, i % 2 === 0 ? 0.07 : 0.2]} />
        </mesh>
      ))}
      <Lamp p={[0, 2.42, 0]} state={lampState(node.id)} />
    </group>
  );
}

/** Operator / engineering desk with monitors whose colour tracks the asset's state. */
function Console({ node, engineering }: { node: NodeDef; engineering?: boolean }) {
  const screen = useStatusMaterial(node.id, engineering ? "#7df0c0" : PALETTE.cyan);
  return (
    <group>
      <Box p={[0, 0.78, 0]} s={[2.6, 0.08, 1.1]} m={MAT.paintLight} />
      <Box p={[-1.15, 0.38, 0]} s={[0.1, 0.76, 1]} m={MAT.darkSteel} />
      <Box p={[1.15, 0.38, 0]} s={[0.1, 0.76, 1]} m={MAT.darkSteel} />
      {[-0.85, 0, 0.85].map((x, i) => (
        <group key={i} position={[x, 1.25, -0.25]} rotation={[0, -x * 0.32, 0]}>
          <Box s={[0.78, 0.5, 0.05]} m={MAT.blackMetal} />
          <mesh material={screen} position={[0, 0, 0.03]}>
            <planeGeometry args={[0.7, 0.42]} />
          </mesh>
          <Box p={[0, -0.34, 0]} s={[0.08, 0.2, 0.08]} m={MAT.darkSteel} />
        </group>
      ))}
      {engineering && <Box p={[1.0, 0.3, 0.2]} s={[0.25, 0.55, 0.55]} m={MAT.blackMetal} />}
      {/* chair */}
      <Box p={[0, 0.5, 0.95]} s={[0.55, 0.08, 0.55]} m={MAT.darkSteel} />
      <Box p={[0, 0.85, 1.2]} s={[0.55, 0.65, 0.07]} m={MAT.darkSteel} />
      <Cyl p={[0, 0.25, 0.95]} s={[0.05, 0.5, 0.05]} m={MAT.steel} />
      <Lamp p={[-1.15, 0.95, 0.4]} size={0.1} state={lampState(node.id)} />
    </group>
  );
}

/** Outdoor controller cabinet on a plinth: the PLC / RTU that drives field equipment. */
function ControllerCabinet({ node }: { node: NodeDef }) {
  const screen = useStatusMaterial(node.id, PALETTE.green);
  return (
    <group>
      <Box p={[0, 0.15, 0]} s={[1.8, 0.3, 1.3]} m={MAT.concrete} />
      <Box p={[0, 1.3, 0]} s={[1.4, 2, 0.8]} m={MAT.paintLight} />
      <Box p={[0, 2.36, 0.05]} s={[1.6, 0.1, 1.05]} m={MAT.paintGrey} />
      <Box p={[0, 1.3, 0.41]} s={[1.2, 1.8, 0.03]} m={MAT.paintGrey} />
      <mesh material={screen} position={[0, 1.75, 0.43]}>
        <planeGeometry args={[0.7, 0.34]} />
      </mesh>
      {[-0.3, -0.1, 0.1, 0.3].map((x) => (
        <mesh key={x} material={screen} position={[x, 1.3, 0.43]}>
          <planeGeometry args={[0.08, 0.08]} />
        </mesh>
      ))}
      <Box p={[0.45, 1.25, 0.45]} s={[0.06, 0.3, 0.06]} m={MAT.steel} />
      {[-0.4, 0, 0.4].map((x) => (
        <Cyl key={x} p={[x, 0.15, -0.5]} s={[0.07, 0.6, 0.07]} m={MAT.galvanized} low />
      ))}
      <Cyl p={[0.55, 2.9, -0.2]} s={[0.02, 1, 0.02]} m={MAT.steel} low />
      <Lamp p={[-0.5, 2.55, 0.2]} state={lampState(node.id)} />
    </group>
  );
}

function NodeModel({ node }: { node: NodeDef }) {
  switch (node.kind) {
    case "gateway":
      return <Gateway node={node} />;
    case "firewall":
    case "switch":
      return <Rack node={node} />;
    case "historian":
    case "server":
      return <Rack node={node} wide />;
    case "hmi":
      return <Console node={node} />;
    case "ews":
      return <Console node={node} engineering />;
    default:
      return <ControllerCabinet node={node} />;
  }
}

export function NodesLayer({ nodes }: { nodes: NodeDef[] }) {
  return (
    <>
      {nodes.map((n) => (
        <group key={n.id} position={n.pos}>
          <Selectable pick={{ type: "node", id: n.id }}>
            <NodeModel node={n} />
          </Selectable>
        </group>
      ))}
    </>
  );
}
