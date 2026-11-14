"use client";
import { create } from "zustand";
import type { GameState } from "@/sim/types";
import type { Pick } from "@/state/game";

export interface TutCtx {
  g: GameState;
  view: "physical" | "cyber";
  selected: Pick | null;
  cameraMoved: boolean;
}

export interface TutStep {
  id: string;
  text: string;
  /** `data-tut` key of the control to highlight. */
  highlight?: string;
  /** Freeze the simulation while this step is showing. */
  pause?: boolean;
  /** Shown with a manual Continue button. */
  manual?: boolean;
  done: (c: TutCtx) => boolean;
}

const nodes = (g: GameState) => Object.values(g.nodes);

/** Level 1 guided tutorial. Each step waits for the player to actually do the thing. */
export const TUTORIAL: TutStep[] = [
  { id: "camera", text: "Welcome to Copper Mesa. Drag to orbit the site, right-drag or use WASD to pan, and scroll to zoom. Have a look around.", manual: true, done: (c) => c.cameraMoved },
  { id: "cyber", text: "The yard looks calm, but the equipment obeys a control network you cannot see yet. Press TAB or click CYBER to reveal it.", highlight: "view-cyber", done: (c) => c.view === "cyber" },
  { id: "select", text: "Dim links are unmonitored: you have no idea what is moving on them. Select the Station Switch in the control house. Everything talks through it.", highlight: "asset-sw", done: (c) => (c.selected?.type === "node" && c.selected.id === "sw") || c.g.nodes.sw.sensor },
  { id: "sensor", text: "Deploy a passive sensor here. Sensors listen: they reveal activity on an asset and its links, but they never block anything.", highlight: "act-sensor", done: (c) => c.g.nodes.sw.sensor },
  { id: "sensor2", text: "Monitored links light up with traffic. The Utility WAN uplink is the front door, so put a second sensor on the Station Router that guards it.", highlight: "asset-fw", done: (c) => nodes(c.g).filter((n) => n.sensor).length >= 2 },
  { id: "golive", text: "Good. Keep the rest of your credits for clean-up. When you are ready, press GO LIVE to start the shift.", highlight: "golive", done: (c) => c.g.phase !== "prep" },
  { id: "watch", text: "Operations are live. Income follows output, so keep the feeders energized. Watch the monitored links. Use 1 / 2 / 3 to change speed, SPACE to pause.", done: (c) => nodes(c.g).some((n) => n.knowledge !== "none") },
  { id: "investigate", text: "A sensor flagged something. An amber asset is only suspicious. Select it and INVESTIGATE so an analyst can confirm what is really there.", highlight: "act-investigate", pause: true, done: (c) => c.g.jobs.some((j) => j.type === "investigate") || nodes(c.g).some((n) => n.knowledge === "confirmed") },
  { id: "analyst", text: "Your analyst is on it. Investigations take a few seconds and you only have two analysts, so choose what to look at.", done: (c) => nodes(c.g).some((n) => n.knowledge === "confirmed") || (c.g.jobs.length === 0 && nodes(c.g).every((n) => n.knowledge === "none")) },
  { id: "isolate", text: "Intrusion confirmed, and you can now see where the actor is heading. ISOLATE the red asset: it is cut off the network and the intruder is trapped. Isolation is not free, though. Whatever depends on that asset degrades.", highlight: "act-isolate", pause: true, done: (c) => nodes(c.g).some((n) => n.isolated) || c.g.stats.remediations > 0 || nodes(c.g).every((n) => n.knowledge !== "confirmed") },
  { id: "remediate", text: "Contained. Now REMEDIATE to evict the intruder and rebuild the asset. It costs 40 credits and is faster on an isolated asset.", highlight: "act-remediate", done: (c) => c.g.stats.remediations > 0 },
  { id: "reconnect", text: "Trapped and gone. RECONNECT the asset so operations return to normal. Always isolate before you remediate: an actor evicted from a connected asset just slips back to where it came from.", highlight: "act-reconnect", done: (c) => nodes(c.g).every((n) => !n.isolated) },
  { id: "final", text: "That is the loop: see, confirm, contain, clean, restore. If a breaker trips, select the equipment and send a crew to RESTORE it. More visitors are coming. You have the watch.", manual: true, done: () => false },
];

interface TutStore {
  index: number;
  active: boolean;
  start: (active: boolean) => void;
  next: () => void;
  stop: () => void;
}

export const useTutorial = create<TutStore>((set, get) => ({
  index: 0,
  active: false,
  start: (active) => set({ index: 0, active }),
  next: () => {
    const i = get().index + 1;
    set(i >= TUTORIAL.length ? { active: false } : { index: i });
  },
  stop: () => set({ active: false }),
}));
