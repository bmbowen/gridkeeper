"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { playEvent, resumeAudio, setAmbience, setVolumes, sfx } from "@/audio/sound";
import { CAMPAIGN } from "@/sim/missions";
import { botStep } from "@/sim/bot";
import { onFx, viewFx } from "@/state/fx";
import { useGame } from "@/state/game";
import { useSave } from "@/state/save";
import { Hud } from "./Hud";
import { Briefing, MainMenu, MissionMap, SettingsPanel, Upgrades } from "./Menus";
import { Results } from "./Results";

const GameCanvas = dynamic(() => import("@/render/GameCanvas"), { ssr: false, loading: () => <div className="gk-canvas" /> });

export default function App() {
  const screen = useGame((s) => s.screen);
  const mission = useGame((s) => s.mission);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const showResult = useGame((s) => s.showResult);
  const settings = useSave((s) => s.settings);
  const inMission = (screen === "game" || screen === "briefing") && mission;

  // Audio wiring.
  useEffect(() => {
    setVolumes({ master: settings.master, sfx: settings.sfx, ambience: settings.ambience, muted: settings.muted });
  }, [settings.master, settings.sfx, settings.ambience, settings.muted]);
  useEffect(() => {
    const wake = () => resumeAudio();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    const off = onFx(playEvent);
    const amb = setInterval(() => {
      const s = useGame.getState();
      const g = s.game;
      const active = !!g && s.screen === "game" && g.phase === "running" && !s.paused && !s.menuOpen;
      const alarm = !!g && Object.values(g.equipment).some((e) => e.manip || e.fire > 0);
      // Score tension: quiet in prep, rising with suspicion, confirmed intrusions, and physical impact.
      let tension = 0.15;
      if (g && s.screen === "game" && g.phase === "running") {
        const nodes = Object.values(g.nodes);
        tension = 0.25;
        if (nodes.some((n) => n.knowledge === "suspicious")) tension = 0.45;
        if (nodes.some((n) => n.knowledge === "confirmed")) tension = 0.65;
        if (nodes.some((n) => n.arming)) tension = 0.8;
        if (alarm || g.production < 0.6) tension = 1;
      }
      setAmbience(g?.production ?? 1, alarm, active || s.screen !== "game", tension);
    }, 250);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      off();
      clearInterval(amb);
    };
  }, []);

  // First visit: respect the operating system's reduced-motion preference.
  useEffect(() => {
    try {
      if (!localStorage.getItem("gridkeeper-motion-checked")) {
        localStorage.setItem("gridkeeper-motion-checked", "1");
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) useSave.getState().setSettings({ reducedMotion: true });
      }
    } catch {
      /* storage unavailable: defaults apply */
    }
  }, []);

  // Test / debug hook: lets browser tests and the console drive the game.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__gridkeeper = {
      game: useGame,
      save: useSave,
      campaign: CAMPAIGN,
      /** Screen position of a world point, for automated interaction tests. */
      project: (p: [number, number, number]) => viewFx.project?.(p) ?? null,
      /** One decision step of the scripted reference defender. */
      bot: () => {
        const s = useGame.getState();
        if (s.game && s.mission) botStep(s.game, s.mission);
      },
    };
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const st = useGame.getState();
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (st.screen !== "game" || !st.game || !st.mission) return;
      if (e.code === "Escape") {
        if (st.settingsOpen) st.setSettingsOpen(false);
        else if (st.selected && !st.menuOpen) st.select(null);
        else st.setMenuOpen(!st.menuOpen);
        return;
      }
      if (st.menuOpen || st.showResult || st.intro) return;
      const sel = st.selected;
      const node = sel?.type === "node" ? sel.id : null;
      const n = node ? st.game.nodes[node] : null;
      switch (e.code) {
        case "Tab":
          e.preventDefault();
          st.toggleView();
          sfx.view();
          break;
        case "Space":
          e.preventDefault();
          if (st.game.phase === "running") st.setPaused(!st.paused);
          break;
        case "Digit1":
          st.setSpeed(1);
          break;
        case "Digit2":
          st.setSpeed(2);
          break;
        case "Digit3":
          st.setSpeed(3);
          break;
        case "Enter":
          if (st.game.phase === "prep") st.dispatch({ type: "start" });
          break;
        case "KeyF":
          if (sel && sel.type !== "link") {
            const p = sel.type === "node" ? st.mission.nodes.find((x) => x.id === sel.id)?.pos : st.mission.equipment.find((x) => x.id === sel.id)?.pos;
            if (p) st.focus(p);
          }
          break;
        case "KeyV":
          if (node) st.dispatch({ type: "sensor", node });
          break;
        case "KeyI":
          if (node) st.dispatch({ type: "investigate", node });
          break;
        case "KeyX":
          if (node && n) st.dispatch({ type: n.isolated ? "reconnect" : "isolate", node });
          break;
        case "KeyR":
          if (node) st.dispatch({ type: "remediate", node });
          else if (sel?.type === "equip") st.dispatch({ type: "restore", equip: sel.id });
          break;
        case "KeyH":
          if (node) st.dispatch({ type: "harden", node });
          break;
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const backdrop = CAMPAIGN[0];
  return (
    <div className={`gk-root ${settings.reducedMotion ? "reduced" : ""}`} data-screen={screen}>
      <div className="gk-canvas">{inMission ? <GameCanvas mission={mission} /> : <GameCanvas mission={backdrop} attract />}</div>
      <div className="gk-layer">
        {screen === "menu" && <MainMenu />}
        {screen === "map" && <MissionMap />}
        {screen === "upgrades" && <Upgrades />}
        {screen === "briefing" && <Briefing />}
        {screen === "game" && mission && <Hud />}
        {screen === "game" && showResult && <Results />}
        {settingsOpen && <SettingsPanel />}
      </div>
    </div>
  );
}
