"use client";
import { useEffect, useState } from "react";
import { sfx } from "@/audio/sound";
import { PROFILES } from "@/sim/constants";
import { CAMPAIGN } from "@/sim/missions";
import { makeEndless } from "@/sim/missions/endless";
import type { MissionDef } from "@/sim/types";
import { UPGRADES } from "@/sim/upgrades";
import { useGame } from "@/state/game";
import { campaignComplete, commendations, completedCount, isUnlocked, totalStars, useSave, type Quality } from "@/state/save";

const click = (fn: () => void) => () => {
  sfx.click();
  fn();
};

export function Stars({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? "star-on" : "star-off"}>
          ★
        </span>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ main menu

export function MainMenu() {
  const setScreen = useGame((s) => s.setScreen);
  const openMission = useGame((s) => s.openMission);
  const setSettingsOpen = useGame((s) => s.setSettingsOpen);
  const save = useSave();
  const started = completedCount(save) > 0 || save.tutorialDone;
  return (
    <div className="menu gk-fade" data-testid="main-menu">
      <div className="eyebrow">Industrial cyber defense · real-time strategy</div>
      <h1 className="logo">
        GRID<span>KEEPER</span>
      </h1>
      <p className="tag">Keep the lights on. Watch the wire, contain the intruder, and make sure the physical world never finds out how close it came.</p>
      <div className="actions">
        {started ? (
          <button className="btn primary big" onClick={click(() => setScreen("map"))} data-testid="btn-campaign">
            Continue campaign
          </button>
        ) : (
          <button className="btn primary big" onClick={click(() => openMission(CAMPAIGN[0].id))} data-testid="btn-play">
            Start first mission
          </button>
        )}
        <button className="btn big" onClick={click(() => setScreen("map"))} data-testid="btn-map">
          Mission map
        </button>
        <button className="btn big ghost" onClick={click(() => setSettingsOpen(true))}>
          Settings
        </button>
      </div>
      <div className="foot">
        {totalStars(save)} / {CAMPAIGN.length * 3} STARS · {save.achievements.length} ACHIEVEMENTS · ALL THREATS ARE FICTIONAL SIMULATIONS
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ campaign map

export function MissionMap() {
  const save = useSave();
  const setScreen = useGame((s) => s.setScreen);
  const openMission = useGame((s) => s.openMission);
  const setSettingsOpen = useGame((s) => s.setSettingsOpen);
  const complete = campaignComplete(save);
  const endless = CAMPAIGN.length ? makeEndless(CAMPAIGN[CAMPAIGN.length - 1]) : null;
  const firstOpen = [...CAMPAIGN].reverse().find((m) => isUnlocked(save, m.index)) ?? CAMPAIGN[0];
  const [selId, setSelId] = useState(firstOpen.id);
  const sel: MissionDef = selId === "endless" && endless ? endless : (CAMPAIGN.find((m) => m.id === selId) ?? CAMPAIGN[0]);
  const rec = save.records[sel.id];
  const unlocked = sel.endless ? complete : isUnlocked(save, sel.index);
  const threatKinds = [...new Set(sel.waves.map((w) => w.profile))];

  return (
    <div className="map gk-fade" data-testid="mission-map">
      <header>
        <button className="btn small ghost" onClick={click(() => setScreen("menu"))}>
          ← Title
        </button>
        <h1>REGIONAL OPERATIONS MAP</h1>
        <div className="spacer" />
        <span className="chip amber" title="Earned from stars and achievements. Spend on upgrades.">
          ★ {commendations(save)} commendations
        </span>
        <button className="btn small" onClick={click(() => setScreen("upgrades"))} data-testid="btn-upgrades">
          Upgrades
        </button>
        <button className="btn small ghost" onClick={click(() => setSettingsOpen(true))}>
          Settings
        </button>
      </header>
      <div className="board">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M5 0H0V5" fill="none" stroke="rgba(56,214,255,0.07)" strokeWidth="0.1" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)" />
          <path d="M0 78 Q 22 70 38 80 T 70 74 T 100 82" fill="none" stroke="rgba(56,214,255,0.14)" strokeWidth="0.3" />
          <path d="M0 30 Q 30 20 52 34 T 100 22" fill="none" stroke="rgba(56,214,255,0.1)" strokeWidth="0.3" />
          {CAMPAIGN.slice(0, -1).map((m, i) => {
            const n = CAMPAIGN[i + 1];
            const open = isUnlocked(save, n.index);
            return <line key={m.id} x1={m.map[0] * 100} y1={m.map[1] * 100} x2={n.map[0] * 100} y2={n.map[1] * 100} stroke={open ? "#38d6ff" : "#2b3b4d"} strokeWidth="0.35" strokeDasharray={open ? "0" : "1 1"} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} />;
          })}
        </svg>
        {CAMPAIGN.map((m) => {
          const open = isUnlocked(save, m.index);
          const r = save.records[m.id];
          return (
            <button key={m.id} className={`pin ${open ? "" : "locked"} ${r ? "done" : ""} ${selId === m.id ? "sel" : ""}`} style={{ left: `${m.map[0] * 100}%`, top: `${m.map[1] * 100}%` }} onClick={click(() => setSelId(m.id))} data-testid={`pin-${m.id}`} aria-label={`Mission ${m.index}: ${m.name}${open ? "" : " (locked)"}`}>
              <span className="disc">{open ? m.index : "🔒"}</span>
              <span className="name">{m.name}</span>
              <span className="stars">{r ? <Stars n={r.stars} /> : null}</span>
            </button>
          );
        })}
        {endless && CAMPAIGN.length >= 5 && (
          <button className={`pin endless ${complete ? "" : "locked"} ${selId === "endless" ? "sel" : ""}`} style={{ left: "88%", top: "78%" }} onClick={click(() => setSelId("endless"))} data-testid="pin-endless" aria-label="Endless mode: Long Night">
            <span className="disc">{complete ? "∞" : "🔒"}</span>
            <span className="name">Long Night</span>
            <span className="stars mono" style={{ fontSize: 11 }}>
              {save.endlessBest > 0 ? `BEST ${save.endlessBest}` : ""}
            </span>
          </button>
        )}
        {CAMPAIGN.length < 5 && (
          <div className="muted mono" style={{ position: "absolute", left: 24, bottom: 18, fontSize: 12 }}>
            {CAMPAIGN.length} of 5 campaign missions are in this build.
          </div>
        )}
      </div>
      <aside>
        <div className="eyebrow">{sel.endless ? "Endless survival" : `Mission ${sel.index} · ${sel.location}`}</div>
        <h2>{sel.name}</h2>
        <p style={{ color: "#bcd3e4", fontSize: 17, lineHeight: 1.35 }}>{sel.tagline}</p>
        <div>
          <div className="kv">
            <span>Introduces</span>
            <b>{sel.teaches}</b>
          </div>
          {!sel.endless && (
            <>
              <div className="kv">
                <span>Shift length</span>
                <b>
                  {Math.floor(sel.duration / 60)}:{String(Math.round(sel.duration % 60)).padStart(2, "0")}
                </b>
              </div>
              <div className="kv">
                <span>Best result</span>
                <b>{rec ? `${rec.score} pts` : "—"}</b>
              </div>
              <div className="kv">
                <span>★ Safety ≥ {sel.stars.safety}%</span>
                <b className={rec?.starSafety ? "star-on" : "star-off"}>★</b>
              </div>
              <div className="kv">
                <span>★ Uptime ≥ {sel.stars.uptime}%</span>
                <b className={rec?.starUptime ? "star-on" : "star-off"}>★</b>
              </div>
              <div className="kv">
                <span>★ Containment ≥ {sel.stars.containment}%</span>
                <b className={rec?.starContainment ? "star-on" : "star-off"}>★</b>
              </div>
            </>
          )}
          {sel.endless && (
            <div className="kv">
              <span>Best score</span>
              <b>{save.endlessBest || "—"}</b>
            </div>
          )}
        </div>
        {threatKinds.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Threat intel
            </div>
            <ul>
              {threatKinds.map((k) => (
                <li key={k}>{PROFILES[k].name}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Achievements
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {sel.achievements.map((a) => {
              const got = save.achievements.includes(a.id);
              return (
                <div key={a.id} className={`ach ${got ? "" : "off"}`}>
                  <span className={got ? "star-on" : "star-off"}>◆</span>
                  <span>
                    <b>{a.name}</b>
                    <br />
                    <span className="muted" style={{ fontSize: 13.5 }}>
                      {a.desc}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn primary big" disabled={!unlocked} onClick={click(() => openMission(sel.id))} data-testid="btn-deploy">
          {unlocked ? "Deploy" : sel.endless ? "Finish the campaign to unlock" : "Complete the previous mission"}
        </button>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------ upgrades

export function Upgrades() {
  const save = useSave();
  const setScreen = useGame((s) => s.setScreen);
  const points = commendations(save);
  const done = completedCount(save);
  return (
    <div className="veil gk-fade" data-testid="upgrades">
      <div className="panel modal wide">
        <div className="eyebrow">Persistent upgrades</div>
        <h2>DEFENSE PROGRAM</h2>
        <p>
          Every star and achievement earns a commendation. Spend them on capabilities that apply to every mission. You have <b className="star-on">★ {points}</b>.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {UPGRADES.map((u) => {
            const owned = save.upgrades.includes(u.id);
            const locked = done < u.requires;
            return (
              <div key={u.id} className={`upg ${owned ? "owned" : ""}`}>
                <b>{u.name}</b>
                <p>{u.desc}</p>
                <button
                  className={`btn small ${owned ? "ghost" : "primary"}`}
                  disabled={owned || locked || points < u.cost}
                  onClick={() => {
                    if (save.buyUpgrade(u.id)) sfx.place();
                    else sfx.deny();
                  }}
                  data-testid={`upg-${u.id}`}
                >
                  {owned ? "Owned" : locked ? `After mission ${u.requires}` : `★ ${u.cost}`}
                </button>
              </div>
            );
          })}
        </div>
        <div className="row">
          <button className="btn" onClick={click(() => setScreen("map"))}>
            Back to map
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ settings

export function SettingsPanel() {
  const settings = useSave((s) => s.settings);
  const set = useSave((s) => s.setSettings);
  const reset = useSave((s) => s.reset);
  const close = useGame((s) => s.setSettingsOpen);
  const [confirm, setConfirm] = useState(false);
  const slider = (label: string, key: "master" | "sfx" | "ambience") => (
    <label className="setting">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={settings[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} onPointerUp={() => sfx.click()} />
    </label>
  );
  return (
    <div className="veil" style={{ zIndex: 50 }} data-testid="settings" role="dialog" aria-label="Settings">
      <div className="panel modal">
        <div className="eyebrow">Settings</div>
        <h2>OPTIONS</h2>
        <div>
          <label className="setting">
            <span>Graphics quality</span>
            <span className="seg">
              {(["low", "medium", "high"] as Quality[]).map((q) => (
                <button key={q} className={settings.quality === q ? "on" : ""} onClick={() => set({ quality: q, autoQuality: false })} data-testid={`quality-${q}`}>
                  {q.toUpperCase()}
                </button>
              ))}
            </span>
          </label>
          <label className="setting">
            <span>Adaptive quality</span>
            <input type="checkbox" checked={settings.autoQuality} onChange={(e) => set({ autoQuality: e.target.checked })} />
          </label>
          {slider("Master volume", "master")}
          {slider("Effects", "sfx")}
          {slider("Ambience", "ambience")}
          <label className="setting">
            <span>Mute all sound</span>
            <input type="checkbox" checked={settings.muted} onChange={(e) => set({ muted: e.target.checked })} />
          </label>
          <label className="setting">
            <span>Reduced motion</span>
            <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} data-testid="reduced-motion" />
          </label>
          <label className="setting">
            <span>Performance overlay</span>
            <input type="checkbox" checked={settings.showPerf} onChange={(e) => set({ showPerf: e.target.checked })} />
          </label>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          Reduced motion skips cinematic camera moves and screen animations. Adaptive quality lowers graphics automatically if the frame rate drops.
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {confirm ? (
            <button
              className="btn danger"
              onClick={() => {
                reset();
                setConfirm(false);
                sfx.isolate();
              }}
            >
              Really erase all progress
            </button>
          ) : (
            <button className="btn ghost" onClick={() => setConfirm(true)}>
              Reset progress
            </button>
          )}
          <button className="btn primary" onClick={click(() => close(false))} data-testid="settings-close">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ briefing

export function Briefing() {
  const mission = useGame((s) => s.mission)!;
  const begin = useGame((s) => s.beginMission);
  const exit = useGame((s) => s.exitToMap);
  const [para, setPara] = useState(0);
  useEffect(() => {
    if (para >= mission.briefing.length) return;
    const t = setTimeout(() => setPara((p) => p + 1), 900);
    return () => clearTimeout(t);
  }, [para, mission]);
  return (
    <div className="veil clear" data-testid="briefing">
      <div className="panel modal wide" style={{ marginBottom: "4vh" }}>
        <div className="eyebrow">
          {mission.endless ? "Endless survival" : `Mission ${mission.index} of 5`} · {mission.location}
        </div>
        <h2>{mission.name.toUpperCase()}</h2>
        {mission.briefing.map((b, i) => (
          <p key={i} style={{ opacity: i <= para ? 1 : 0, transition: "opacity 0.8s" }}>
            {b}
          </p>
        ))}
        <div className="card objectives" style={{ padding: 0 }}>
          <h3>Objectives</h3>
          <ul>
            {mission.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={click(exit)}>
            Back to map
          </button>
          <button className="btn primary big" onClick={click(begin)} data-testid="btn-begin" autoFocus>
            Begin shift
          </button>
        </div>
      </div>
    </div>
  );
}
