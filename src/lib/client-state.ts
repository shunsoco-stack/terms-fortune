"use client";

import { useSyncExternalStore } from "react";
import { getJstDate, getRecentDates } from "./fortune";
import { clearHistory, HISTORY_STORAGE_KEY, readHistory, recordHistory } from "./history";

const HISTORY_EVENT = "terms-fortune:history-change";
const LOCATION_EVENT = "terms-fortune:location-change";
const THEME_EVENT = "terms-fortune:theme-change";
const THEME_KEY = "terms-fortune:theme:v1";
let sessionDates: string[] = [];

const emptySnapshot = () => "";

function subscribeClock(callback: () => void) {
  const timer = window.setInterval(callback, 1000);
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

export function useToday() {
  return useSyncExternalStore(subscribeClock, getJstDate, emptySnapshot);
}

function historySnapshot() {
  const today = getJstDate();
  const allowed = new Set(getRecentDates(today));
  return [...new Set([...readHistory(today), ...sessionDates])]
    .filter((date) => allowed.has(date))
    .sort()
    .reverse()
    .join(",");
}

function subscribeHistory(callback: () => void) {
  const syncStorage = (event: StorageEvent) => {
    if (event.key === HISTORY_STORAGE_KEY || event.key === null) sessionDates = [];
    callback();
  };
  window.addEventListener(HISTORY_EVENT, callback);
  window.addEventListener("storage", syncStorage);
  return () => {
    window.removeEventListener(HISTORY_EVENT, callback);
    window.removeEventListener("storage", syncStorage);
  };
}

export function useViewedDates() {
  const dates = useSyncExternalStore(subscribeHistory, historySnapshot, emptySnapshot);
  return dates ? dates.split(",") : [];
}

export function saveViewedDate(date: string, today: string) {
  const result = recordHistory(date, today);
  sessionDates = [...new Set(result.persisted ? sessionDates.filter((value) => value !== date) : [...sessionDates, date])].filter((value) =>
    getRecentDates(today).includes(value),
  );
  window.dispatchEvent(new Event(HISTORY_EVENT));
  return result.persisted;
}

export function eraseViewedDates() {
  const cleared = clearHistory();
  const sessionCleared = sessionDates.length > 0;
  sessionDates = [];
  window.dispatchEvent(new Event(HISTORY_EVENT));
  return { cleared, sessionCleared };
}

function subscribeLocation(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  window.addEventListener(LOCATION_EVENT, callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener(LOCATION_EVENT, callback);
  };
}

export type AppView = "today" | "result" | "history" | "about" | "sample";

export function useAppLocation() {
  const location = useSyncExternalStore(
    subscribeLocation,
    () => `${window.location.hash}|${window.location.search}`,
    () => "|",
  );
  const [hash, search] = location.split("|");
  const candidate = hash.slice(1);
  const view: AppView = ["result", "history", "about", "sample"].includes(candidate)
    ? (candidate as AppView)
    : "today";
  return { view, date: new URLSearchParams(search).get("date") };
}

export function navigate(view: AppView, date?: string) {
  const url = new URL(window.location.href);
  url.search = date ? `?date=${encodeURIComponent(date)}` : "";
  url.hash = view === "today" ? "" : view;
  window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(LOCATION_EVENT));
  window.scrollTo({ top: 0, behavior: "instant" });
  window.requestAnimationFrame(() => document.getElementById("main-content")?.focus());
}

function applySystemTheme() {
  let explicit: string | null = null;
  try { explicit = localStorage.getItem(THEME_KEY); } catch { /* use system preference */ }
  if (explicit !== "light" && explicit !== "dark") {
    document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  } else {
    document.documentElement.dataset.theme = explicit;
  }
}

function subscribeTheme(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => { applySystemTheme(); callback(); };
  media.addEventListener("change", sync);
  window.addEventListener("storage", sync);
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    media.removeEventListener("change", sync);
    window.removeEventListener("storage", sync);
    window.removeEventListener(THEME_EVENT, callback);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme ?? "light",
    () => "light",
  );
  return {
    theme,
    toggle: () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch { /* theme still works for this visit */ }
      window.dispatchEvent(new Event(THEME_EVENT));
    },
  };
}

function subscribeNetwork(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useIsOnline() {
  return useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
}
