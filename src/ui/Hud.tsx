"use client";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/audio/sound";
import { NODE_KIND_LABEL, PROFILES } from "@/sim/constants";
import { activeThreats, commandBlocked, cost, freeSlots, nextWaveIn, nodeCovered, topology } from "@/sim/engine";
import { uptimePct } from "@/sim/score";
import type { Alert, Command, EquipDef, GameState, LinkDef, MissionDef, NodeDef } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { useGame } from "@/state/game";
import { useSave } from "@/state/save";
import { TUTORIAL, useTutorial } from "./tutorial";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function useTick() {
  // Re-render at the UI tick rate.
  return useGame((s) => s.version);
}

// ------------------------------------------------------------------ top bar

function TopBar({ g, m }: { g: GameState; m: MissionDef }) {
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const view = useGame((s) => s.view);
  const { setSpeed, setPaused, setView, setMenuOpen } = useGame.getState();
  const tutKey = useTutorial((s) => (s.active ? TUTORIAL[s.index]?.highlight : undefined));
  const prod = g.production;
  const up = uptimePct(g);
  const income = m.incomeRate * prod * (1 - g.opsPenalty);
  const threats = g.threats.filter((t) => t.phase !== "dead" && (t.identified || t.visible)).length;
  const next = nextWaveIn(g, m);
  const remaining = m.endless ? g.time : Math.max(0, m.duration - g.time);
  return (
    <div className="hud-top">
      <div className="panel hud-block">
        <div className="eyebrow">{m.endless ? "Endless" : `Mission ${m.index}`}</div>
        <div className="hud-title">{m.name}</div>
      </div>
      <div className="gauges" role="status" aria-label="Site status">
        <div className={`panel gauge ${prod < m.lose.productionBelow ? "crit" : prod < 0.9 ? "warn" : "good"}`} data-testid="gauge-output">
          <div className="eyebrow">Output</div>
          <div className="v">
            {Math.round(prod * m.nominal)}
            <small>
              {m.unit} · {Math.round(prod * 100)}%
            </small>
          </div>
        </div>
        <div className={`panel gauge ${g.safety < 40 ? "crit" : g.safety < m.stars.safety ? "warn" : "good"}`} data-testid="gauge-safety">
          <div className="eyebrow">Safety</div>
          <div className="v">
            {Math.round(g.safety)}
            <small>%</small>
          </div>
        </div>
        <div className={`panel gauge ${up < m.stars.uptime ? "warn" : "good"}`}>
          <div className="eyebrow">Uptime</div>
          <div className="v">
            {up.toFixed(0)}
            <small>% avg</small>
          </div>
        </div>
        <div className="panel gauge" data-testid="gauge-credits">
          <div className="eyebrow">Credits</div>
          <div className="v" style={{ color: "#ffd98a" }}>
            {Math.floor(g.credits)}
            <small>+{income.toFixed(1)}/s{g.opsPenalty > 0 ? ` (−${Math.round(g.opsPenalty * 100)}%)` : ""}</small>
          </div>
        </div>
        <div className={`panel gauge ${threats > 0 ? "crit" : ""}`}>
          <div className="eyebrow">{threats > 0 ? "Threats tracked" : "Shift clock"}</div>
          <div className="v">
            {threats > 0 ? threats : fmt(remaining)}
            <small>{threats > 0 ? `${fmt(remaining)} ${m.endless ? "elapsed" : "left"}` : m.endless ? "elapsed" : next !== null && g.phase === "running" ? `intel: ${Math.ceil(next)}s` : "left"}</small>
          </div>
        </div>
      </div>
      <div className="hud-ctrl">
        <div className="viewtoggle" role="group" aria-label="View">
          <button className={`phys ${view === "physical" ? "on" : ""}`} onClick={() => (setView("physical"), sfx.view())} data-testid="view-physical" aria-pressed={view === "physical"}>
            Physical
          </button>
          <button className={`cyber ${view === "cyber" ? "on" : ""} ${tutKey === "view-cyber" ? "tut-glow" : ""}`} onClick={() => (setView("cyber"), sfx.view())} data-testid="view-cyber" aria-pressed={view === "cyber"} title="Toggle with TAB">
            Cyber
          </button>
        </div>
        <div className="seg" role="group" aria-label="Game speed">
          <button className={paused ? "on" : ""} onClick={() => (setPaused(!paused), sfx.click())} aria-label={paused ? "Resume" : "Pause"} data-testid="btn-pause" title="SPACE">
            {paused ? "▶" : "❚❚"}
          </button>
          {[1, 2, 3].map((n) => (
            <button key={n} className={!paused && speed === n ? "on" : ""} onClick={() => (setSpeed(n), sfx.click())} data-testid={`speed-${n}`} aria-label={`Speed ${n}x`}>
              {n}×
            </button>
          ))}
        </div>
        <button className="btn small" onClick={() => (setMenuOpen(true), sfx.click())} data-testid="btn-menu" aria-label="Menu" title="ESC">
          ☰
        </button>
      </div>
      {!m.endless && (
        <div className="timeline" aria-hidden>
          <div className="track" />
          <div className="fill" style={{ width: `${Math.min(100, (g.time / m.duration) * 100)}%` }} />
          {m.waves.map((w, i) => (
            <div key={i} className={`mark ${w.at <= g.time ? "past" : ""}`} style={{ left: `${(w.at / m.duration) * 100}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ left column

function nodeDot(g: GameState, id: string): string {
  const n = g.nodes[id];
  if (n.isolated) return "#b9c6d2";
  if (n.knowledge === "confirmed") return "var(--red)";
  if (n.knowledge === "suspicious") return "var(--amber)";
  return n.sensor ? "var(--cyan)" : "#3b556b";
}

function equipDot(g: GameState, id: string): string {
  const e = g.equipment[id];
  if (e.tripped || e.condition <= 0 || e.manip) return "var(--red)";
  if (e.arming || e.heat > 0.6 || e.load > 1.1 || e.local) return "var(--amber)";
  return "var(--green)";
}

function LeftColumn({ g, m }: { g: GameState; m: MissionDef }) {
  const selected = useGame((s) => s.selected);
  const tutKey = useTutorial((s) => (s.active ? TUTORIAL[s.index]?.highlight : undefined));
  const [open, setOpen] = useState(true);
  const pick = (type: "node" | "equip", id: string, pos: [number, number, number]) => {
    const st = useGame.getState();
    st.select({ type, id });
    st.focus(pos);
    sfx.click();
  };
  const analysts = freeSlots(g, "analyst");
  const crew = freeSlots(g, "crew");
  return (
    <div className="hud-left">
      <div className="panel card objectives">
        <h3>Objectives</h3>
        <ul>
          {m.objectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 13 }} className="mono">
          <span title="Analysts investigate and remediate">
            ANALYSTS{" "}
            <span className="pips">
              {Array.from({ length: g.mods.analysts }, (_, i) => (
                <i key={i} className={i >= analysts ? "busy" : ""} />
              ))}
            </span>
          </span>
          <span title="Field crews restore and repair equipment">
            CREWS{" "}
            <span className="pips">
              {Array.from({ length: g.mods.crew }, (_, i) => (
                <i key={i} className={i >= crew ? "busy" : ""} />
              ))}
            </span>
          </span>
        </div>
      </div>
      <div className="panel card assets" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <h3>
          Assets
          <button className="btn small ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Hide" : "Show"}
          </button>
        </h3>
        {open && (
          <div style={{ overflowY: "auto", minHeight: 0 }}>
            {m.zones.map((z) => (
              <div key={z.id}>
                <div className="grp" style={{ color: z.color }}>
                  {z.name}
                </div>
                {m.nodes
                  .filter((n) => n.zone === z.id)
                  .map((n) => (
                    <button key={n.id} className={`${selected?.id === n.id ? "sel" : ""} ${tutKey === `asset-${n.id}` ? "tut-glow" : ""}`} onClick={() => pick("node", n.id, n.pos)} data-testid={`asset-${n.id}`}>
                      <span className="dot" style={{ color: nodeDot(g, n.id) }} />
                      {n.name}
                      <span className="tagr">{g.nodes[n.id].sensor ? "SENSOR" : ""}</span>
                    </button>
                  ))}
              </div>
            ))}
            <div className="grp">Equipment</div>
            {m.equipment
              .filter((e) => e.kind !== "source" || e.controller || e.sinkWeight)
              .map((e) => (
                <button key={e.id} className={selected?.id === e.id ? "sel" : ""} onClick={() => pick("equip", e.id, e.pos)} data-testid={`asset-${e.id}`}>
                  <span className="dot" style={{ color: equipDot(g, e.id) }} />
                  {e.name}
                  <span className="tagr">{g.equipment[e.id].tripped ? "TRIPPED" : ""}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ inspector

function ActionButton({ g, m, cmd, label, hotkey, price, tut, className = "", onWhy }: { g: GameState; m: MissionDef; cmd: Command; label: string; hotkey?: string; price?: number; tut?: string; className?: string; onWhy: (s: string) => void }) {
  const blocked = commandBlocked(g, m, cmd);
  const tutKey = useTutorial((s) => (s.active ? TUTORIAL[s.index]?.highlight : undefined));
  return (
    <button
      className={`btn ${className} ${tut && tutKey === tut ? "tut-glow" : ""}`}
      aria-disabled={!!blocked}
      style={blocked ? { opacity: 0.42 } : undefined}
      title={blocked ?? undefined}
      onMouseEnter={() => onWhy(blocked ?? "")}
      onMouseLeave={() => onWhy("")}
      onFocus={() => onWhy(blocked ?? "")}
      onClick={() => useGame.getState().dispatch(cmd)}
      data-testid={tut}
    >
      <span>
        {label}
        {hotkey && <kbd>{hotkey}</kbd>}
      </span>
      {price !== undefined && <span className="cost">{price} cr</span>}
    </button>
  );
}

function Meter({ label, value, color, text }: { label: string; value: number; color: string; text?: string }) {
  return (
    <div className="meter">
      <span className="muted">{label}</span>
      <div className="bar">
        <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      </div>
      <span>{text ?? `${Math.round(value * 100)}%`}</span>
    </div>
  );
}

function NodeInspector({ g, m, node }: { g: GameState; m: MissionDef; node: NodeDef }) {
  const [why, setWhy] = useState("");
  const n = g.nodes[node.id];
  const topo = topology(m);
  const zone = m.zones.find((z) => z.id === node.zone)!;
  const covered = nodeCovered(g, m, node.id);
  const controls = topo.controls[node.id] ?? [];
  const blind = n.sensor && g.time < n.sensorBlindUntil;
  const threat = g.threats.find((t) => t.phase !== "dead" && t.identified && (t.node === node.id || t.trail.includes(node.id)));
  const job = g.jobs.find((j) => j.target === node.id);
  const has = (t: string) => (m.tools as string[]).includes(t);
  return (
    <div className="panel card inspector" data-testid="inspector">
      <div className="eyebrow" style={{ color: zone.color }}>
        {NODE_KIND_LABEL[node.kind]} · {zone.name}
      </div>
      <h2>{node.name}</h2>
      <div className="chips">
        {n.isolated && <span className="chip grey">Isolated</span>}
        {n.knowledge === "confirmed" && <span className="chip red">Intrusion confirmed</span>}
        {n.knowledge === "suspicious" && <span className="chip amber">Suspicious</span>}
        {n.knowledge === "none" && <span className={`chip ${covered ? "green" : "grey"}`}>{covered ? "No anomalies seen" : "No visibility"}</span>}
        {n.sensor && <span className={`chip ${blind ? "red" : "cyan"}`}>{blind ? "Sensor blinded" : "Sensor"}</span>}
        {n.hardened && <span className="chip cyan">Hardened</span>}
        {n.honeypot && <span className="chip violet">Tripwire</span>}
        {node.entry && <span className="chip red">Entry point</span>}
      </div>
      <p className="desc">{node.desc}</p>
      {controls.length > 0 && (
        <div className="kv">
          <span>Controls</span>
          <b style={{ textAlign: "right" }}>{controls.map((c) => topo.equip[c].name).join(", ")}</b>
        </div>
      )}
      {job && <Meter label={job.type === "investigate" ? "Investigating" : "Remediating"} value={1 - job.remaining / job.total} color={job.type === "investigate" ? "var(--amber)" : "var(--green)"} text={`${job.remaining.toFixed(1)}s`} />}
      {threat && (
        <div className="threatbox">
          <b>{PROFILES[threat.profile].name.toUpperCase()}</b>
          <br />
          {PROFILES[threat.profile].summary}
          {threat.objectives[threat.objIndex] && (
            <>
              <br />
              <span className="mono" style={{ fontSize: 12 }}>
                HEADING FOR: {topo.node[threat.objectives[threat.objIndex].node].name}
              </span>
            </>
          )}
        </div>
      )}
      <div className="actions">
        {!n.sensor && <ActionButton g={g} m={m} cmd={{ type: "sensor", node: node.id }} label="Deploy sensor" hotkey="V" price={cost(g, "sensor")} tut="act-sensor" className="full primary" onWhy={setWhy} />}
        <ActionButton g={g} m={m} cmd={{ type: "investigate", node: node.id }} label="Investigate" hotkey="I" tut="act-investigate" className={n.knowledge === "suspicious" ? "primary" : ""} onWhy={setWhy} />
        {n.isolated ? <ActionButton g={g} m={m} cmd={{ type: "reconnect", node: node.id }} label="Reconnect" hotkey="X" tut="act-reconnect" className={!n.compromised || n.knowledge === "none" ? "primary" : ""} onWhy={setWhy} /> : <ActionButton g={g} m={m} cmd={{ type: "isolate", node: node.id }} label="Isolate" hotkey="X" tut="act-isolate" className="danger" onWhy={setWhy} />}
        <ActionButton g={g} m={m} cmd={{ type: "remediate", node: node.id }} label="Remediate" hotkey="R" price={cost(g, "remediate")} tut="act-remediate" className={n.knowledge === "confirmed" ? "full primary" : "full"} onWhy={setWhy} />
        {has("harden") && !n.hardened && <ActionButton g={g} m={m} cmd={{ type: "harden", node: node.id }} label="Harden" hotkey="H" price={cost(g, "harden")} tut="act-harden" onWhy={setWhy} />}
        {has("honeypot") && g.mods.honeypot && !n.honeypot && <ActionButton g={g} m={m} cmd={{ type: "honeypot", node: node.id }} label="Tripwire" price={cost(g, "honeypot")} tut="act-honeypot" onWhy={setWhy} />}
        <div className="why" aria-live="polite">
          {why}
        </div>
      </div>
      {!n.isolated && controls.length > 0 && <p className="muted" style={{ fontSize: 12.5 }}>Isolating drops its equipment to local manual control (reduced output).</p>}
    </div>
  );
}

function equipStatus(g: GameState, e: EquipDef): { text: string; cls: string } {
  const s = g.equipment[e.id];
  if (s.condition <= 0) return { text: "Destroyed · needs repair", cls: "red" };
  if (s.fire > 0) return { text: "On fire", cls: "red" };
  if (s.tripped) return { text: "Tripped", cls: "red" };
  if (s.manip) return { text: "Unauthorized commands", cls: "red" };
  if (s.arming) return { text: "Abnormal traffic to controller", cls: "amber" };
  if (s.heat > 0.6) return { text: "Overheating", cls: "amber" };
  if (s.load > 1.1) return { text: "Overloaded", cls: "amber" };
  if (s.local) return { text: "Local manual control", cls: "grey" };
  if (s.out < 0.05) return { text: "No supply", cls: "amber" };
  return { text: "Running", cls: "green" };
}

function EquipInspector({ g, m, equip }: { g: GameState; m: MissionDef; equip: EquipDef }) {
  const [why, setWhy] = useState("");
  const s = g.equipment[equip.id];
  const topo = topology(m);
  const st = equipStatus(g, equip);
  const ctrl = equip.controller ? topo.node[equip.controller] : null;
  const job = g.jobs.find((j) => j.target === equip.id);
  const inGroup = (m.groups ?? []).some((grp) => grp.members.includes(equip.id));
  return (
    <div className="panel card inspector" data-testid="inspector">
      <div className="eyebrow">Field equipment{equip.sinkWeight ? " · served load" : ""}</div>
      <h2>{equip.name}</h2>
      <div className="chips">
        <span className={`chip ${st.cls}`}>{st.text}</span>
      </div>
      {equip.desc && <p className="desc">{equip.desc}</p>}
      <Meter label="Output" value={Math.min(1, s.out)} color={s.out > 1.05 ? "var(--red)" : "var(--green)"} text={`${Math.round(s.out * 100)}%`} />
      {(equip.cooledBy || s.heat > 0.02) && <Meter label="Heat" value={s.heat} color={s.heat > 0.75 ? "var(--red)" : s.heat > 0.5 ? "var(--amber)" : "var(--cyan)"} />}
      {inGroup && <Meter label="Load" value={s.load / 1.5} color={s.load > 1.1 ? "var(--red)" : "var(--cyan)"} text={`${Math.round(s.load * 100)}%`} />}
      {equip.buffer && <Meter label="Level" value={s.level} color={s.level < 0.25 ? "var(--red)" : "var(--cyan)"} />}
      <Meter label="Condition" value={s.condition / 100} color={s.condition < 50 ? "var(--red)" : "var(--green)"} />
      {job && <Meter label={job.type === "restore" ? "Restoring" : "Repairing"} value={1 - job.remaining / job.total} color="var(--green)" text={`${job.remaining.toFixed(1)}s`} />}
      {ctrl && (
        <div className="kv">
          <span>Controlled by</span>
          <button
            className="btn small ghost"
            onClick={() => {
              useGame.getState().select({ type: "node", id: ctrl.id });
              useGame.getState().focus(ctrl.pos);
            }}
          >
            {ctrl.name} →
          </button>
        </div>
      )}
      <div className="actions">
        {s.tripped && <ActionButton g={g} m={m} cmd={{ type: "restore", equip: equip.id }} label="Send crew: restore" hotkey="R" tut="act-restore" className="full primary" onWhy={setWhy} />}
        {s.condition < 95 && <ActionButton g={g} m={m} cmd={{ type: "repair", equip: equip.id }} label="Repair" price={cost(g, "repair")} tut="act-repair" className="full" onWhy={setWhy} />}
        {equip.setpoints && (m.tools as string[]).includes("setpoint") && (
          <div className="full" style={{ gridColumn: "1 / -1" }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {equip.setpointLabel ?? "Setpoint"}
            </div>
            <div className="seg">
              {equip.setpoints.map((v) => (
                <button key={v} className={s.setpoint === v ? "on" : ""} onClick={() => useGame.getState().dispatch({ type: "setpoint", equip: equip.id, value: v })} data-testid={`setpoint-${v}`}>
                  {Math.round(v * 100)}%
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="why" aria-live="polite">
          {why}
        </div>
      </div>
    </div>
  );
}

function LinkInspector({ g, m, link }: { g: GameState; m: MissionDef; link: LinkDef }) {
  const [why, setWhy] = useState("");
  const topo = topology(m);
  const s = g.links[link.id];
  return (
    <div className="panel card inspector" data-testid="inspector">
      <div className="eyebrow">Zone conduit</div>
      <h2>
        {topo.node[link.a].name} ⇄ {topo.node[link.b].name}
      </h2>
      <div className="chips">
        <span className={`chip ${s.segmented ? "violet" : "grey"}`}>{s.segmented ? "Segmented" : "Open"}</span>
      </div>
      <p className="desc">
        A conduit carries traffic between two zones. Segmenting it enforces a strict allow-list: ordinary intruders cannot cross, and credentialed ones are slowed and logged.
        {link.opsCost ? ` Restricting this one costs ${Math.round(link.opsCost * 100)}% of income while it stays closed.` : ""}
      </p>
      <div className="actions">
        {s.segmented ? <ActionButton g={g} m={m} cmd={{ type: "unsegment", link: link.id }} label="Remove policy" className="full" tut="act-unsegment" onWhy={setWhy} /> : <ActionButton g={g} m={m} cmd={{ type: "segment", link: link.id }} label="Segment conduit" price={cost(g, "segment")} className="full primary" tut="act-segment" onWhy={setWhy} />}
        <div className="why">{why}</div>
      </div>
    </div>
  );
}

function Inspector({ g, m }: { g: GameState; m: MissionDef }) {
  const selected = useGame((s) => s.selected);
  if (!selected) return null;
  if (selected.type === "node") {
    const node = m.nodes.find((n) => n.id === selected.id);
    return node ? <NodeInspector g={g} m={m} node={node} key={node.id} /> : null;
  }
  if (selected.type === "equip") {
    const e = m.equipment.find((x) => x.id === selected.id);
    return e ? <EquipInspector g={g} m={m} equip={e} key={e.id} /> : null;
  }
  const l = m.links.find((x) => x.id === selected.id);
  return l ? <LinkInspector g={g} m={m} link={l} key={l.id} /> : null;
}

function Jobs({ g, m }: { g: GameState; m: MissionDef }) {
  if (g.jobs.length === 0) return null;
  const topo = topology(m);
  return (
    <div className="panel card">
      <h3>Work in progress</h3>
      <div className="jobs">
        {g.jobs.map((j) => (
          <div key={j.id} className="job">
            <span>
              {j.type.toUpperCase()} · {(topo.node[j.target] ?? topo.equip[j.target]).name}
            </span>
            <div className="bar">
              <i style={{ width: `${(1 - j.remaining / j.total) * 100}%`, background: j.pool === "analyst" ? "var(--amber)" : "var(--green)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ alerts / coach / misc

function Alerts({ g, m }: { g: GameState; m: MissionDef }) {
  const topo = topology(m);
  const list = g.alerts.slice(-5).reverse();
  const go = (a: Alert) => {
    const st = useGame.getState();
    sfx.click();
    if (a.node) {
      st.select({ type: "node", id: a.node });
      st.focus(topo.node[a.node].pos);
    } else if (a.equip) {
      st.select({ type: "equip", id: a.equip });
      st.focus(topo.equip[a.equip].pos);
    }
  };
  return (
    <div className="alerts" role="log" aria-label="Alerts" aria-live="polite">
      {list.map((a) => (
        <button key={a.id} className={`alert ${a.severity} ${g.time - a.time > 14 ? "old" : ""}`} onClick={() => go(a)} data-testid="alert">
          <time>{fmt(a.time)}</time>
          <b>{a.title}</b>
          <span>{a.text}</span>
        </button>
      ))}
    </div>
  );
}

function Coach({ g }: { g: GameState }) {
  const { index, active, next, stop } = useTutorial();
  const view = useGame((s) => s.view);
  const selected = useGame((s) => s.selected);
  const step = TUTORIAL[index];
  const pausedBy = useRef(-1);
  useEffect(() => {
    if (!active || !step) return;
    const st = useGame.getState();
    if (step.done({ g, view, selected, cameraMoved: viewFx.cameraMoved })) {
      if (pausedBy.current === index) {
        st.setPaused(false);
        pausedBy.current = -1;
      }
      next();
      return;
    }
    if (step.pause && pausedBy.current !== index && g.phase === "running") {
      pausedBy.current = index;
      st.setPaused(true);
    }
  });
  if (!active || !step) return null;
  const finish = () => {
    useSave.getState().setTutorialDone();
    if (pausedBy.current >= 0) useGame.getState().setPaused(false);
    stop();
  };
  return (
    <div className="panel coach" data-testid="coach" role="status">
      <div className="eyebrow">
        <span>
          Training · step {index + 1} / {TUTORIAL.length}
        </span>
        {step.pause && <span>SIMULATION HELD</span>}
      </div>
      <p>{step.text}</p>
      <div className="row">
        {index < TUTORIAL.length - 1 && (
          <button className="btn small ghost" onClick={finish} data-testid="coach-skip">
            Skip training
          </button>
        )}
        {step.manual && (
          <button className="btn small primary" onClick={() => (index === TUTORIAL.length - 1 ? finish() : next())} data-testid="coach-next">
            {index === TUTORIAL.length - 1 ? "Got it" : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}

function Tooltip({ g, m }: { g: GameState; m: MissionDef }) {
  const hovered = useGame((s) => s.hovered);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  if (!hovered) return null;
  const topo = topology(m);
  let title = "";
  let sub = "";
  if (hovered.type === "node") {
    const n = topo.node[hovered.id];
    const s = g.nodes[hovered.id];
    title = n.name;
    sub = s.isolated ? "Isolated" : s.knowledge === "confirmed" ? "Intrusion confirmed" : s.knowledge === "suspicious" ? "Suspicious · investigate" : s.sensor ? "Monitored" : `${NODE_KIND_LABEL[n.kind]} · no visibility`;
  } else if (hovered.type === "equip") {
    const e = topo.equip[hovered.id];
    title = e.name;
    sub = equipStatus(g, e).text;
  } else {
    const l = topo.link[hovered.id];
    title = `Conduit: ${topo.node[l.a].name} ⇄ ${topo.node[l.b].name}`;
    sub = g.links[l.id].segmented ? "Segmented" : "Open · click to segment";
  }
  return (
    <div className="tooltip" style={{ left: pos.x, top: pos.y }}>
      {title}
      <small>{sub}</small>
    </div>
  );
}

function PauseMenu({ m }: { m: MissionDef }) {
  const { setMenuOpen, restart, exitToMap, setSettingsOpen } = useGame.getState();
  return (
    <div className="veil" data-testid="pause-menu" role="dialog" aria-label="Paused">
      <div className="panel modal" style={{ width: 420 }}>
        <div className="eyebrow">Paused</div>
        <h2>{m.name.toUpperCase()}</h2>
        <div style={{ display: "grid", gap: 8 }}>
          <button className="btn primary big" onClick={() => (setMenuOpen(false), sfx.click())} data-testid="btn-resume" autoFocus>
            Resume
          </button>
          <button className="btn" onClick={() => (restart(), sfx.click())} data-testid="btn-restart">
            Restart mission
          </button>
          <button className="btn" onClick={() => (setSettingsOpen(true), sfx.click())}>
            Settings
          </button>
          <button className="btn danger" onClick={() => (exitToMap(), sfx.click())} data-testid="btn-quit">
            Abandon to map
          </button>
        </div>
        <p className="muted mono" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
          TAB view · SPACE pause · 1/2/3 speed · WASD pan · Q/E rotate · F focus
          <br />V sensor · I investigate · X isolate/reconnect · R remediate/restore · H harden
        </p>
      </div>
    </div>
  );
}

function Perf() {
  useTick();
  return <div className="perf">{`${viewFx.fps.toFixed(0)} fps\n${viewFx.drawCalls} draws\n${(viewFx.triangles / 1000).toFixed(0)}k tris`}</div>;
}

// ------------------------------------------------------------------ root

export function Hud() {
  useTick();
  const g = useGame((s) => s.game);
  const m = useGame((s) => s.mission);
  const intro = useGame((s) => s.intro);
  const banner = useGame((s) => s.banner);
  const toast = useGame((s) => s.toast);
  const menuOpen = useGame((s) => s.menuOpen);
  const result = useGame((s) => s.result);
  const paused = useGame((s) => s.paused);
  const showPerf = useSave((s) => s.settings.showPerf);
  const tutKey = useTutorial((s) => (s.active ? TUTORIAL[s.index]?.highlight : undefined));

  // Start the guided tutorial on the first mission until the player finishes or skips it.
  useEffect(() => {
    if (!g || !m) return;
    viewFx.cameraMoved = false;
    useTutorial.getState().start(!!m.tutorial && !useSave.getState().tutorialDone);
  }, [g, m]);

  if (!g || !m) return null;
  if (intro) {
    return (
      <button className="btn skip-intro" onClick={() => useGame.getState().endIntro()} data-testid="skip-intro">
        Skip intro ▸
      </button>
    );
  }
  const over = g.phase === "won" || g.phase === "lost";
  return (
    <>
      <TopBar g={g} m={m} />
      {!over && <LeftColumn g={g} m={m} />}
      {!over && (
        <div className="hud-right">
          <Inspector g={g} m={m} />
          <Jobs g={g} m={m} />
        </div>
      )}
      {!over && <Alerts g={g} m={m} />}
      {!over && (
        <div className="bottom-center">
          <Coach g={g} />
          {g.phase === "prep" && (
            <div className="panel prep">
              <p>
                <b>Preparation.</b> The clock is stopped. Place sensors and defenses, then go live. Next activity expected {Math.ceil(nextWaveIn(g, m) ?? 0)}s into the shift.
              </p>
              <button className={`btn primary big ${tutKey === "golive" ? "tut-glow" : ""}`} onClick={() => useGame.getState().dispatch({ type: "start" })} data-testid="btn-golive">
                Go live <kbd>↵</kbd>
              </button>
            </div>
          )}
          {g.phase === "running" && paused && !menuOpen && <div className="chip amber">Paused · press SPACE</div>}
        </div>
      )}
      {banner && !over && (
        <div className="banner" key={banner.id}>
          ⚠ {banner.text}
        </div>
      )}
      {toast && (
        <div className="toast" key={toast.id} role="alert">
          {toast.text}
        </div>
      )}
      {over && !useGame.getState().showResult && result && (
        <div className="banner" style={{ top: "38%", fontSize: 30, animationDuration: "3s", borderColor: result.won ? "var(--green)" : "var(--red)", background: `linear-gradient(90deg, transparent, ${result.won ? "rgba(61,255,158,0.3)" : "rgba(255,61,74,0.3)"}, transparent)` }}>{result.won ? "SHIFT COMPLETE" : "SITE LOST"}</div>
      )}
      <Tooltip g={g} m={m} />
      {menuOpen && <PauseMenu m={m} />}
      {showPerf && <Perf />}
      <span className="sr" data-testid="sim-state" data-phase={g.phase} data-time={g.time.toFixed(1)} data-threats={activeThreats(g)} />
    </>
  );
}
