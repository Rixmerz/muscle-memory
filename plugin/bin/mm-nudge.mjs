#!/usr/bin/env node

// packages/mm-aggregator/dist/nudge.js
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { join as join3 } from "node:path";

// packages/mm-aggregator/dist/ndjson.js
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join as join2 } from "node:path";

// packages/mm-core/dist/paths.js
import { join } from "node:path";
var MM_DIR = ".mm";
function eventsDir(root) {
  return join(root, MM_DIR, "events");
}

// packages/mm-aggregator/dist/ndjson.js
function isMMEvent(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const record = value;
  return typeof record["ts"] === "string" && typeof record["session"] === "string" && typeof record["event"] === "string" && typeof record["sig"] === "string" && typeof record["arg"] === "string";
}
function readEvents(root) {
  const dir = eventsDir(root);
  if (!existsSync(dir))
    return [];
  const events = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".ndjson"))) {
    const lines = readFileSync(join2(dir, file), "utf8").split("\n");
    for (const line of lines) {
      if (line.trim() === "")
        continue;
      try {
        const parsed = JSON.parse(line);
        if (isMMEvent(parsed))
          events.push(parsed);
      } catch {
      }
    }
  }
  return events;
}

// packages/mm-aggregator/dist/sequences.js
function groupSessions(events) {
  const sessions = /* @__PURE__ */ new Map();
  for (const event of events) {
    const bucket = sessions.get(event.session);
    if (bucket) {
      bucket.push(event);
    } else {
      sessions.set(event.session, [event]);
    }
  }
  for (const bucket of sessions.values()) {
    bucket.sort((a, b) => a.ts.localeCompare(b.ts));
  }
  return sessions;
}
function stepOk(sessionEvents, preIndex) {
  const sig = sessionEvents[preIndex].sig;
  for (let j = preIndex + 1; j < sessionEvents.length; j++) {
    const event = sessionEvents[j];
    if (event.event === "PostToolUse" && event.sig === sig) {
      return event.ok ?? true;
    }
  }
  return true;
}
function mineNgrams(sessions, { minLen, maxLen }) {
  const patterns = /* @__PURE__ */ new Map();
  for (const [session, events] of sessions) {
    const preIndices = [];
    for (let i = 0; i < events.length; i++) {
      if (events[i].event === "PreToolUse")
        preIndices.push(i);
    }
    for (let start = 0; start + minLen <= preIndices.length; start++) {
      for (let len = minLen; len <= maxLen && start + len <= preIndices.length; len++) {
        const windowIndices = preIndices.slice(start, start + len);
        const steps = windowIndices.map((i) => events[i].sig);
        const key = steps.join("\0");
        const first = events[windowIndices[0]];
        const occurrence = {
          session,
          startTs: first.ts,
          argHash: first.arg,
          stepsOk: windowIndices.map((i) => stepOk(events, i))
        };
        const existing = patterns.get(key);
        if (existing) {
          existing.occurrences.push(occurrence);
        } else {
          patterns.set(key, { steps, occurrences: [occurrence] });
        }
      }
    }
  }
  return [...patterns.values()];
}

// packages/mm-aggregator/dist/score.js
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
function stdev(values) {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}
function variabilidad(occurrences) {
  if (occurrences.length < 2)
    return 0;
  const starts = occurrences.map((o) => new Date(o.startTs).getTime()).sort((a, b) => a - b);
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  const gapMean = mean(gaps);
  if (gapMean === 0)
    return 0;
  return clamp(stdev(gaps) / gapMean, 0, 1);
}
function score(pattern, corpus) {
  const occurrences = pattern.occurrences;
  const n = occurrences.length;
  const frecuencia = Math.min(1, n / 10);
  const consistencia = new Set(occurrences.map((o) => o.session)).size / corpus.totalSessions;
  const repeticionTemporal = new Set(occurrences.map((o) => o.startTs.slice(0, 10))).size / corpus.totalDays;
  const exito = occurrences.filter((o) => o.stepsOk.every(Boolean)).length / n;
  const distinctArgHashes = new Set(occurrences.map((o) => o.argHash)).size;
  const determinismo = 1 - (distinctArgHashes - 1) / n;
  const ahorroPotencial = pattern.steps.length / 4;
  const raw = frecuencia * consistencia * repeticionTemporal * exito * determinismo * ahorroPotencial - variabilidad(occurrences);
  return clamp(raw, 0, 1);
}

// packages/mm-aggregator/dist/candidates.js
var WINDOW = { minLen: 2, maxLen: 4 };
function candidates(root, { minScore }) {
  const events = readEvents(root);
  if (events.length === 0)
    return [];
  const sessions = groupSessions(events);
  const patterns = mineNgrams(sessions, WINDOW);
  const corpus = {
    totalSessions: sessions.size,
    totalDays: new Set(events.map((e) => e.ts.slice(0, 10))).size
  };
  return patterns.map((pattern) => ({
    ...pattern,
    score: score(pattern, corpus),
    sessions: new Set(pattern.occurrences.map((o) => o.session)).size
  })).filter((candidate) => candidate.score >= minScore).sort((a, b) => b.score - a.score);
}

// packages/mm-aggregator/dist/candidate-id.js
import { createHash } from "node:crypto";
function deriveCandidateId(pattern) {
  const key = `${pattern.steps.join("\0")}\0${pattern.occurrences.length}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

// packages/mm-aggregator/dist/nudge.js
var DEFAULT_MIN_SCORE = 0.8;
function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function runNudge(root) {
  if (!existsSync2(join3(root, ".mm")))
    return;
  const results = candidates(root, { minScore: DEFAULT_MIN_SCORE });
  if (results.length === 0)
    return;
  const ids = results.map((c) => deriveCandidateId(c)).sort();
  const path = join3(root, ".mm", "review-pending.json");
  const previous = existsSync2(path) ? JSON.parse(readFileSync2(path, "utf8")) : void 0;
  if (previous && arraysEqual(previous.ids, ids))
    return;
  const record = { ids, count: ids.length, minedAt: (/* @__PURE__ */ new Date()).toISOString() };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}
`);
}

// packages/mm-aggregator/dist/nudge-bin.js
function main() {
  runNudge(process.cwd());
  process.exit(0);
}
main();
