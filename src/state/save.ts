"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CAMPAIGN } from "@/sim/missions";
import { UPGRADES } from "@/sim/upgrades";
import type { MissionResult } from "@/sim/types";

export type Quality = "low" | "medium" | "high";

export interface Settings {
  quality: Quality;
  autoQuality: boolean;
  master: number;
  sfx: number;
  ambience: number;
  muted: boolean;
  reducedMotion: boolean;
  showPerf: boolean;
}

export interface MissionRecord {
  stars: number;
  score: number;
  starSafety: boolean;
  starUptime: boolean;
  starContainment: boolean;
}

interface SaveState {
  records: Record<string, MissionRecord>;
  achievements: string[];
  upgrades: string[];
  endlessBest: number;
  tutorialDone: boolean;
  settings: Settings;
  recordResult: (missionId: string, r: MissionResult) => { newStars: number; newAchievements: string[] };
  buyUpgrade: (id: string) => boolean;
  setSettings: (s: Partial<Settings>) => void;
  setTutorialDone: () => void;
  reset: () => void;
}

const defaultSettings: Settings = {
  quality: "medium",
  autoQuality: true,
  master: 0.7,
  sfx: 0.8,
  ambience: 0.5,
  muted: false,
  reducedMotion: false,
  showPerf: false,
};

// The game was first built under the working title "Gridkeeper". Carry any save across once.
if (typeof window !== "undefined") {
  try {
    const legacy = localStorage.getItem("gridkeeper-save-v1");
    if (legacy && !localStorage.getItem("setpoint-save-v1")) localStorage.setItem("setpoint-save-v1", legacy);
  } catch {
    /* storage unavailable */
  }
}

export const useSave = create<SaveState>()(
  persist(
    (set, get) => ({
      records: {},
      achievements: [],
      upgrades: [],
      endlessBest: 0,
      tutorialDone: false,
      settings: defaultSettings,
      recordResult: (missionId, r) => {
        const s = get();
        if (missionId === "endless") {
          const newAchievements = r.achievements.filter((a) => !s.achievements.includes(a));
          set({ endlessBest: Math.max(s.endlessBest, r.score), achievements: [...s.achievements, ...newAchievements] });
          return { newStars: 0, newAchievements };
        }
        const prev = s.records[missionId];
        const newAchievements = r.achievements.filter((a) => !s.achievements.includes(a));
        if (!r.won) return { newStars: 0, newAchievements: [] };
        const merged: MissionRecord = {
          stars: Math.max(prev?.stars ?? 0, r.stars),
          score: Math.max(prev?.score ?? 0, r.score),
          starSafety: !!prev?.starSafety || r.starSafety,
          starUptime: !!prev?.starUptime || r.starUptime,
          starContainment: !!prev?.starContainment || r.starContainment,
        };
        set({ records: { ...s.records, [missionId]: merged }, achievements: [...s.achievements, ...newAchievements] });
        return { newStars: merged.stars - (prev?.stars ?? 0), newAchievements };
      },
      buyUpgrade: (id) => {
        const s = get();
        const u = UPGRADES.find((x) => x.id === id);
        if (!u || s.upgrades.includes(id)) return false;
        if (commendations(s) < u.cost || completedCount(s) < u.requires) return false;
        set({ upgrades: [...s.upgrades, id] });
        return true;
      },
      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      setTutorialDone: () => set({ tutorialDone: true }),
      reset: () => set({ records: {}, achievements: [], upgrades: [], endlessBest: 0, tutorialDone: false }),
    }),
    { name: "setpoint-save-v1", version: 1 },
  ),
);

type Progress = Pick<SaveState, "records" | "achievements" | "upgrades">;

export function totalStars(s: Progress): number {
  return Object.values(s.records).reduce((a, r) => a + r.stars, 0);
}

/** Spendable commendations: one per star and per achievement, minus upgrades bought. */
export function commendations(s: Progress): number {
  const spent = UPGRADES.filter((u) => s.upgrades.includes(u.id)).reduce((a, u) => a + u.cost, 0);
  return totalStars(s) + s.achievements.length - spent;
}

export function completedCount(s: Progress): number {
  return CAMPAIGN.filter((m) => s.records[m.id]).length;
}

export function isUnlocked(s: Progress, index: number): boolean {
  if (index <= 1) return true;
  const prev = CAMPAIGN.find((m) => m.index === index - 1);
  return !!prev && !!s.records[prev.id];
}

export function campaignComplete(s: Progress): boolean {
  return CAMPAIGN.length >= 5 && CAMPAIGN.every((m) => s.records[m.id]);
}
