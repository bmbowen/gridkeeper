"use client";
import { useEffect, useState } from "react";
import { sfx } from "@/audio/sound";
import { CAMPAIGN } from "@/sim/missions";
import { useGame } from "@/state/game";
import { commendations, useSave } from "@/state/save";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Victory / defeat report card with star reveal and performance breakdown. */
export function Results() {
  const result = useGame((s) => s.result);
  const meta = useGame((s) => s.resultMeta);
  const mission = useGame((s) => s.mission);
  const g = useGame((s) => s.game);
  const save = useSave();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!result?.won) return;
    const timers = [0, 1, 2].map((i) =>
      setTimeout(() => {
        setShown(i + 1);
        const on = [result.starSafety, result.starUptime, result.starContainment][i];
        if (on) sfx.star();
      }, 500 + i * 550),
    );
    return () => timers.forEach(clearTimeout);
  }, [result]);
  if (!result || !mission || !g) return null;
  const { restart, exitToMap, openMission } = useGame.getState();
  const next = CAMPAIGN.find((m) => m.index === mission.index + 1);
  const stars = [
    { on: result.starSafety, label: "Safety", value: `${result.safety.toFixed(0)}%`, need: `≥ ${mission.stars.safety}%` },
    { on: result.starUptime, label: "Uptime", value: `${result.uptime.toFixed(1)}%`, need: `≥ ${mission.stars.uptime}%` },
    { on: result.starContainment, label: "Containment", value: `${result.containment.toFixed(0)}%`, need: `≥ ${mission.stars.containment}%` },
  ];
  const s = g.stats;
  return (
    <div className="veil gk-fade" data-testid="results" role="dialog" aria-label="Mission report">
      <div className="panel modal wide">
        <div className="eyebrow">
          {mission.endless ? "Endless survival" : `Mission ${mission.index}`} · {mission.name} · after-action report
        </div>
        <h2 className={`result-title ${result.won ? "win" : "lose"}`} data-testid="result-title">
          {mission.endless ? "THE NIGHT ENDS" : result.won ? "GRID SECURED" : "SITE LOST"}
        </h2>
        <p>{mission.endless ? `You held the line for ${fmt(result.time)}. ${result.loseReason}` : result.won ? "The shift is over and the site is still standing. Here is how it went." : result.loseReason}</p>
        {result.won && (
          <div className="stars-big" data-testid="result-stars" data-stars={result.stars}>
            {stars.map((st, i) => (
              <div key={st.label} className={`s ${st.on && shown > i ? "on" : ""}`}>
                <span className="glyph">★</span>
                <b>{st.value}</b>
                <small>
                  {st.label} {st.need}
                </small>
              </div>
            ))}
          </div>
        )}
        <div className="grid2">
          <div className="kv">
            <span>Score</span>
            <b data-testid="result-score">{result.score}</b>
          </div>
          <div className="kv">
            <span>Time on shift</span>
            <b>{fmt(result.time)}</b>
          </div>
          <div className="kv">
            <span>Threats eliminated</span>
            <b>
              {s.threatsEliminated} / {s.threatsSpawned}
            </b>
          </div>
          <div className="kv">
            <span>Threats that achieved an effect</span>
            <b>{s.threatsActed}</b>
          </div>
          <div className="kv">
            <span>Equipment trips</span>
            <b>{s.trips}</b>
          </div>
          <div className="kv">
            <span>Fires</span>
            <b>{s.fires}</b>
          </div>
          <div className="kv">
            <span>Sensors deployed</span>
            <b>{s.sensorsPlaced}</b>
          </div>
          <div className="kv">
            <span>Investigations (false alarms)</span>
            <b>
              {s.investigations} ({s.falsePositives})
            </b>
          </div>
          <div className="kv">
            <span>Isolations</span>
            <b>{s.isolations}</b>
          </div>
          <div className="kv">
            <span>Credits earned / spent</span>
            <b>
              {Math.round(s.creditsEarned)} / {s.creditsSpent}
            </b>
          </div>
        </div>
        {mission.achievements.length > 0 && (result.won || mission.endless) && (
          <div style={{ display: "grid", gap: 6 }}>
            {mission.achievements.map((a) => {
              const got = result.achievements.includes(a.id);
              const isNew = meta?.newAchievements.includes(a.id);
              return (
                <div key={a.id} className={`ach ${got ? "" : "off"}`}>
                  <span className={got ? "star-on" : "star-off"}>◆</span>
                  <span>
                    <b>{a.name}</b> {isNew && <span className="chip amber">New</span>}
                    <br />
                    <span className="muted" style={{ fontSize: 13.5 }}>
                      {a.desc}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {meta && (meta.newStars > 0 || meta.newAchievements.length > 0) && (
          <p className="star-on" style={{ fontSize: 16 }}>
            +{meta.newStars + meta.newAchievements.length} commendations earned · {commendations(save)} available to spend on upgrades
          </p>
        )}
        <div className="row">
          <button className="btn ghost" onClick={() => (exitToMap(), sfx.click())} data-testid="btn-to-map">
            Mission map
          </button>
          <button className="btn" onClick={() => (restart(), sfx.click())} data-testid="btn-retry">
            {result.won ? "Replay" : "Try again"}
          </button>
          {result.won && next && (
            <button className="btn primary big" onClick={() => (openMission(next.id), sfx.click())} data-testid="btn-next">
              Next: {next.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
