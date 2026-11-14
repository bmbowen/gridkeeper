"use client";
import { create } from "zustand";
import { DT } from "@/sim/constants";
import { command, createGame, step } from "@/sim/engine";
import { makeEndless } from "@/sim/missions/endless";
import { CAMPAIGN, missionById } from "@/sim/missions";
import { summarize } from "@/sim/score";
import type { Command, CommandResult, GameState, MissionDef, MissionResult } from "@/sim/types";
import { modsFor } from "@/sim/upgrades";
import { emitFx, viewFx } from "./fx";
import { useSave } from "./save";

export type Screen = "menu" | "map" | "upgrades" | "briefing" | "game";
export type Pick = { type: "node" | "equip" | "link"; id: string };

interface GameStore {
  screen: Screen;
  mission: MissionDef | null;
  /** Mutable simulation state. Render code reads it every frame; React reads it via `version`. */
  game: GameState | null;
  /** Idle simulation of the first site, rendered behind the menus. */
  backdrop: GameState | null;
  version: number;
  speed: number;
  paused: boolean;
  view: "physical" | "cyber";
  selected: Pick | null;
  hovered: Pick | null;
  intro: boolean;
  result: MissionResult | null;
  resultMeta: { newStars: number; newAchievements: string[] } | null;
  showResult: boolean;
  toast: { id: number; text: string } | null;
  banner: { id: number; text: string } | null;
  menuOpen: boolean;
  settingsOpen: boolean;
  setScreen: (s: Screen) => void;
  openMission: (id: string) => void;
  beginMission: () => void;
  restart: () => void;
  exitToMap: () => void;
  dispatch: (c: Command) => CommandResult;
  advance: (realDt: number) => void;
  setSpeed: (n: number) => void;
  setPaused: (p: boolean) => void;
  setView: (v: "physical" | "cyber") => void;
  toggleView: () => void;
  select: (p: Pick | null) => void;
  hover: (p: Pick | null) => void;
  endIntro: () => void;
  setMenuOpen: (b: boolean) => void;
  setSettingsOpen: (b: boolean) => void;
  focus: (pos: [number, number, number]) => void;
}

let acc = 0;
let uiAcc = 0;
let counter = 1;

function resolveMission(id: string): MissionDef | null {
  if (id === "endless") return makeEndless(CAMPAIGN[CAMPAIGN.length - 1]);
  return missionById(id) ?? null;
}

function fresh(m: MissionDef): GameState {
  const seed = m.endless ? (Date.now() >>> 0) : m.seed;
  return createGame(m, modsFor(useSave.getState().upgrades), seed);
}

export const useGame = create<GameStore>((set, get) => ({
  screen: "menu",
  mission: null,
  game: null,
  backdrop: CAMPAIGN[0] ? createGame(CAMPAIGN[0]) : null,
  version: 0,
  speed: 1,
  paused: false,
  view: "physical",
  selected: null,
  hovered: null,
  intro: false,
  result: null,
  resultMeta: null,
  showResult: false,
  toast: null,
  banner: null,
  menuOpen: false,
  settingsOpen: false,

  setScreen: (screen) => set({ screen, menuOpen: false }),

  openMission: (id) => {
    const mission = resolveMission(id);
    if (!mission) return;
    acc = 0;
    viewFx.mix = 0;
    set({
      mission,
      game: fresh(mission),
      screen: "briefing",
      view: "physical",
      selected: null,
      hovered: null,
      result: null,
      resultMeta: null,
      showResult: false,
      paused: false,
      speed: 1,
      intro: true,
      banner: null,
      toast: null,
      menuOpen: false,
      version: get().version + 1,
    });
  },

  beginMission: () => set({ screen: "game" }),

  restart: () => {
    const m = get().mission;
    if (!m) return;
    acc = 0;
    set({ game: fresh(m), result: null, resultMeta: null, showResult: false, selected: null, paused: false, speed: 1, menuOpen: false, banner: null, screen: "game", intro: false, version: get().version + 1 });
  },

  exitToMap: () => set({ screen: "map", mission: null, game: null, result: null, showResult: false, selected: null, hovered: null, menuOpen: false, paused: false }),

  dispatch: (c) => {
    const { game, mission } = get();
    if (!game || !mission) return { ok: false, reason: "No mission" };
    const r = command(game, mission, c);
    if (!r.ok && r.reason) set({ toast: { id: counter++, text: r.reason } });
    drain(game, mission, set, get);
    set({ version: get().version + 1 });
    return r;
  },

  advance: (realDt) => {
    const s = get();
    const { game, mission } = s;
    if (!game || !mission) return;
    if (game.phase === "running" && !s.paused && !s.menuOpen && s.screen === "game") {
      acc += Math.min(realDt, 0.25) * s.speed;
      let n = 0;
      while (acc >= DT && n < 12) {
        step(game, mission);
        acc -= DT;
        n++;
      }
      if (n >= 12) acc = 0;
      drain(game, mission, set, get);
    }
    uiAcc += realDt;
    if (uiAcc >= 0.15) {
      uiAcc = 0;
      set({ version: s.version + 1 });
    }
  },

  setSpeed: (speed) => set({ speed, paused: false }),
  setPaused: (paused) => set({ paused }),
  setView: (view) => set({ view }),
  toggleView: () => set({ view: get().view === "cyber" ? "physical" : "cyber" }),
  select: (selected) => set({ selected }),
  hover: (hovered) => {
    const h = get().hovered;
    if (h?.id === hovered?.id && h?.type === hovered?.type) return;
    set({ hovered });
  },
  endIntro: () => set({ intro: false }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  focus: (pos) => {
    viewFx.focus = pos;
  },
}));

type Set = (p: Partial<GameStore>) => void;

function drain(game: GameState, mission: MissionDef, set: Set, get: () => GameStore) {
  if (game.events.length === 0) return;
  const events = game.events;
  game.events = [];
  for (const e of events) {
    emitFx(e);
    if (e.type === "wave") set({ banner: { id: counter++, text: e.label } });
    if (e.type === "win" || e.type === "lose") {
      const result = summarize(game, mission);
      const meta = useSave.getState().recordResult(mission.endless ? "endless" : mission.id, result);
      set({ result, resultMeta: meta, selected: null });
      // Let the in-world victory / defeat sequence play before the report card.
      setTimeout(() => {
        if (get().game === game) set({ showResult: true });
      }, 2600);
    }
  }
}
