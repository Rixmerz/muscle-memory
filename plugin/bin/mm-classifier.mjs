#!/usr/bin/env node

// packages/mm-classifier/dist/bin.js
import { readFileSync as readFileSync3 } from "node:fs";
import { relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

// packages/mm-classifier/dist/definition.js
var NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
var QUESTION_TYPES = ["choice", "score", "noul"];
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function inUnitRange(value) {
  return typeof value === "number" && value >= 0 && value <= 1;
}
function labelsOf(question) {
  if (question.type === "noul")
    return ["true", "false"];
  if (Array.isArray(question.criteria))
    return [...question.criteria];
  return Object.keys(question.criteria ?? {});
}
function validateQuestion(key, raw) {
  const at = `questions.${key}`;
  if (!isObject(raw))
    throw new Error(`${at}: must be an object`);
  if (typeof raw.type !== "string" || !QUESTION_TYPES.includes(raw.type)) {
    throw new Error(`${at}.type: must be one of choice, score, noul`);
  }
  if (typeof raw.instructions !== "string" || raw.instructions.trim() === "") {
    throw new Error(`${at}.instructions: must be a non-empty string`);
  }
  const criteria = raw.criteria;
  if (raw.type === "score") {
    if (!Array.isArray(criteria) || criteria.length < 2 || !criteria.every((c) => typeof c === "string")) {
      throw new Error(`${at}.criteria: a score question needs an array of at least two strings`);
    }
    return;
  }
  if (raw.type === "noul") {
    if (criteria === void 0)
      return;
    const keys = isObject(criteria) ? Object.keys(criteria) : [];
    if (!isObject(criteria) || keys.length !== 2 || !("true" in criteria) || !("false" in criteria) || !Object.values(criteria).every((c) => typeof c === "string")) {
      throw new Error(`${at}.criteria: a noul question needs exactly the keys "true" and "false"`);
    }
    if (raw.labels !== void 0) {
      const labels2 = raw.labels;
      if (!isObject(labels2) || Object.keys(labels2).length !== 2 || !("true" in labels2) || !("false" in labels2)) {
        throw new Error(`${at}.labels: must have exactly the keys "true" and "false"`);
      }
    }
    return;
  }
  const labels = Array.isArray(criteria) ? criteria.every((c) => typeof c === "string") ? criteria : null : isObject(criteria) && Object.values(criteria).every((c) => typeof c === "string" || c === null) ? Object.keys(criteria) : null;
  if (labels === null) {
    throw new Error(`${at}.criteria: a choice question needs an object of label -> description (or null), or a list of labels`);
  }
  if (labels.length < 2) {
    throw new Error(`${at}.criteria: a choice question needs at least two labels`);
  }
}
function validateDecide(raw, questions) {
  if (!isObject(raw))
    throw new Error("decide: must be an object");
  if (typeof raw.question !== "string" || !(raw.question in questions)) {
    throw new Error(`decide.question: must name one of the questions (${Object.keys(questions).join(", ")})`);
  }
  if (typeof raw.fallback !== "string" || raw.fallback === "") {
    throw new Error("decide.fallback: must be a non-empty string");
  }
  for (const field of ["minConfidence", "threshold"]) {
    if (raw[field] !== void 0 && !inUnitRange(raw[field])) {
      throw new Error(`decide.${field}: must be a number in [0, 1]`);
    }
  }
  const labels = labelsOf(questions[raw.question]);
  for (const field of ["routes", "next"]) {
    const map = raw[field];
    if (map === void 0)
      continue;
    if (!isObject(map))
      throw new Error(`decide.${field}: must be an object of label -> string`);
    for (const [label, value] of Object.entries(map)) {
      if (!labels.includes(label)) {
        throw new Error(`decide.${field}.${label}: not a label of "${raw.question}" (${labels.join(", ")})`);
      }
      if (typeof value !== "string" || value === "") {
        throw new Error(`decide.${field}.${label}: must be a non-empty string`);
      }
    }
  }
}
function validateRules(raw, labels) {
  if (!Array.isArray(raw))
    throw new Error("rules: must be an array");
  raw.forEach((rule, i) => {
    const at = `rules[${i}]`;
    if (!isObject(rule) || !isObject(rule.match) || Object.keys(rule.match).length === 0) {
      throw new Error(`${at}.match: must be a non-empty object of state key -> regex`);
    }
    for (const [key, pattern] of Object.entries(rule.match)) {
      if (typeof pattern !== "string")
        throw new Error(`${at}.match.${key}: must be a regex string`);
      try {
        new RegExp(pattern, "i");
      } catch {
        throw new Error(`${at}.match.${key}: not a valid regex: ${pattern}`);
      }
    }
    if (typeof rule.label !== "string" || !labels.includes(rule.label)) {
      throw new Error(`${at}.label: must be a label of the deciding question (${labels.join(", ")})`);
    }
  });
}
function validate(raw) {
  if (!isObject(raw))
    throw new Error("definition: must be a JSON object");
  if (typeof raw.name !== "string" || !NAME_PATTERN.test(raw.name)) {
    throw new Error("name: must be kebab-case (a-z, 0-9, single dashes)");
  }
  if (typeof raw.description !== "string")
    throw new Error("description: must be a string");
  if (!isObject(raw.questions) || Object.keys(raw.questions).length === 0) {
    throw new Error("questions: must be an object with at least one question");
  }
  for (const [key, question] of Object.entries(raw.questions))
    validateQuestion(key, question);
  const questions = raw.questions;
  validateDecide(raw.decide, questions);
  if (raw.input !== void 0) {
    if (!isObject(raw.input) || !Object.values(raw.input).every((p) => typeof p === "string")) {
      throw new Error("input: must be an object of state key -> dot path");
    }
  }
  if (raw.rules !== void 0)
    validateRules(raw.rules, labelsOf(questions[raw.decide.question]));
  if (raw.model !== void 0 && typeof raw.model !== "string")
    throw new Error("model: must be a string");
  if (raw.examples !== void 0) {
    if (!Array.isArray(raw.examples))
      throw new Error("examples: must be an array");
    const labels = labelsOf(questions[raw.decide.question]);
    raw.examples.forEach((example, i) => {
      if (!isObject(example) || !("input" in example) || typeof example.expect !== "string") {
        throw new Error(`examples[${i}]: must be {input, expect}`);
      }
      if (!labels.includes(example.expect)) {
        throw new Error(`examples[${i}].expect: "${example.expect}" is not a label (${labels.join(", ")})`);
      }
    });
  }
  return raw;
}

// packages/mm-classifier/dist/flow.js
import { dirname as dirname2, resolve as resolve2 } from "node:path";

// packages/mm-classifier/dist/decide.js
function getPath(value, path) {
  let current = value;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null)
      return void 0;
    current = current[segment];
  }
  return current;
}
function buildState(definition, input) {
  if (definition.input === void 0)
    return input;
  const state = {};
  for (const [key, path] of Object.entries(definition.input))
    state[key] = getPath(input, path);
  return state;
}
function ruleLabel(definition, state) {
  for (const rule of definition.rules ?? []) {
    const hit = Object.entries(rule.match).every(([key, pattern]) => {
      const value = getPath(state, key);
      return new RegExp(pattern, "i").test(value === void 0 || value === null ? "" : String(value));
    });
    if (hit)
      return rule.label;
  }
  return null;
}
function decideByRule(definition, label) {
  const outcome = definition.decide.routes?.[label] ?? definition.decide.fallback;
  return { classifier: definition.name, outcome, reason: "rule", label, confidence: 1, answers: {}, model: null };
}
function readAnswer(question, answer, threshold) {
  if (question.type === "noul") {
    const p = answer.noul;
    if (typeof p !== "number")
      throw new Error("Laya answer has no noul probability");
    return p >= threshold ? { label: "true", confidence: p } : { label: "false", confidence: 1 - p };
  }
  const confidence = answer.answer_confidence;
  if (typeof confidence !== "number")
    throw new Error("Laya answer has no answer_confidence");
  if (question.type === "choice") {
    if (typeof answer.choice !== "string")
      throw new Error("Laya answer has no choice");
    return { label: answer.choice, confidence };
  }
  if (typeof answer.score !== "number")
    throw new Error("Laya answer has no score");
  const options = question.criteria;
  const index = Math.min(Math.max(Math.round(answer.score), 0), options.length - 1);
  return { label: answer.legend?.[String(index)] ?? options[index], confidence };
}
function decide(definition, answers, model) {
  const { decide: rule } = definition;
  const answer = answers[rule.question];
  if (answer === void 0)
    throw new Error(`Laya returned no answer for "${rule.question}"`);
  const { label, confidence } = readAnswer(definition.questions[rule.question], answer, rule.threshold ?? 0.5);
  let outcome = rule.fallback;
  let reason = "unrouted";
  if (confidence < (rule.minConfidence ?? 0)) {
    reason = "low-confidence";
  } else if (rule.routes?.[label] !== void 0) {
    outcome = rule.routes[label];
    reason = "routed";
  }
  return { classifier: definition.name, outcome, reason, label, confidence, answers, model };
}

// packages/mm-classifier/dist/laya.js
import { homedir } from "node:os";
import { join } from "node:path";
var DEFAULT_URL = "http://127.0.0.1:8177";
function config(env = process.env) {
  return {
    url: env.MM_LAYA_URL || DEFAULT_URL,
    python: env.MM_LAYA_PYTHON || join(homedir(), ".local", "share", "muscle-memory", "laya", "bin", "python"),
    device: env.MM_LAYA_DEVICE || "cpu",
    models: env.MM_LAYA_MODELS || "english"
  };
}
var ServerUnreachable = class extends Error {
  constructor(url) {
    super(`no Laya server at ${url}; start it with: mm-classifier server start`);
  }
};
async function request(url, init, timeoutMs) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ServerUnreachable(new URL(url).origin);
  }
}
async function health(url, timeoutMs = 1e3) {
  try {
    const res = await request(`${url}/health`, {}, timeoutMs);
    return res.ok;
  } catch {
    return false;
  }
}
async function predict(url, definition, state, timeoutMs = 3e4) {
  const body = { state, questions: definition.questions };
  if (definition.model !== void 0)
    body.model = definition.model;
  const res = await request(`${url}/v1/systemone`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Laya server answered ${res.status}: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text);
  if (parsed.answers === void 0)
    throw new Error("Laya server response has no answers");
  return { answers: parsed.answers, model: parsed.routing?.model ?? null };
}

// packages/mm-classifier/dist/store.js
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join as join2, resolve } from "node:path";

// packages/mm-core/dist/paths.js
var MM_DIR = ".mm";

// packages/mm-classifier/dist/store.js
function classifiersDir(root) {
  return join2(root, MM_DIR, "classifiers");
}
var STORAGE_QUESTION = "choose where to store it: --store mm (.mm/classifiers/, local to this machine, gitignored) or --out <path> (any path, e.g. one you commit). Ask the user which they want.";
function targetPath(root, name, choice) {
  if (choice.store === void 0 === (choice.out === void 0)) {
    throw new Error(`exactly one storage option is required: ${STORAGE_QUESTION}`);
  }
  if (choice.store !== void 0) {
    if (choice.store !== "mm")
      throw new Error(`--store accepts only "mm"; for anything else use --out <path>`);
    if (!existsSync(join2(root, MM_DIR))) {
      throw new Error(`${MM_DIR}/ does not exist here. Run /mm:enable first (it also turns on event recording), or use --out <path>.`);
    }
    return join2(classifiersDir(root), `${name}.json`);
  }
  const out = resolve(root, choice.out);
  return out.endsWith(".json") ? out : join2(out, `${name}.json`);
}
function writeDefinition(path, definition, force) {
  if (existsSync(path) && !force)
    throw new Error(`${path} already exists; pass --force to overwrite`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(definition, null, 2)}
`);
}
function resolveRef(root, ref2) {
  if (ref2.includes("/") || ref2.endsWith(".json"))
    return resolve(root, ref2);
  return join2(classifiersDir(root), `${ref2}.json`);
}
function loadDefinition(path) {
  if (!existsSync(path))
    throw new Error(`no classifier at ${path}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${path}: not valid JSON`);
  }
  try {
    return validate(raw);
  } catch (err) {
    throw new Error(`${path}: ${err.message}`);
  }
}
function list(root) {
  const dir = classifiersDir(root);
  if (!existsSync(dir))
    return [];
  return readdirSync(dir).filter((file) => file.endsWith(".json")).sort().map((file) => {
    const path = join2(dir, file);
    try {
      const { name, description } = loadDefinition(path);
      return { ok: true, path, name, description };
    } catch (err) {
      return { ok: false, path, error: err.message };
    }
  });
}

// packages/mm-classifier/dist/flow.js
var MAX_DEPTH = 5;
function resolveNext(fromPath, ref2) {
  const base = dirname2(fromPath);
  return ref2.includes("/") || ref2.endsWith(".json") ? resolve2(base, ref2) : resolve2(base, `${ref2}.json`);
}
async function evaluate(path, input, options, chain = []) {
  if (chain.includes(path))
    throw new Error(`classifier cycle: ${[...chain, path].join(" -> ")}`);
  if (chain.length >= MAX_DEPTH)
    throw new Error(`classifier chain deeper than ${MAX_DEPTH}: ${chain.join(" -> ")}`);
  const definition = loadDefinition(path);
  const state = buildState(definition, input);
  const label = ruleLabel(definition, state);
  let decision;
  if (label !== null) {
    decision = decideByRule(definition, label);
  } else {
    const { answers, model } = await predict(options.url, definition, state, options.timeoutMs);
    decision = decide(definition, answers, model);
  }
  const nextRef = decision.reason === "low-confidence" ? void 0 : definition.decide.next?.[decision.label];
  if (nextRef === void 0 || options.follow === false)
    return decision;
  const next = await evaluate(resolveNext(path, nextRef), input, options, [...chain, path]);
  return { ...decision, outcome: next.outcome, next };
}

// packages/mm-classifier/dist/lint.js
var BOOLEAN_WORDS = /* @__PURE__ */ new Set(["true", "false", "yes", "no", "si", "s\xED", "verdadero", "falso"]);
var CATCH_ALL = /^(other|otro|otra|otros|none|ninguno|ninguna|rest|resto)$/i;
var HEAD_CHAR_BUDGET = 600;
function lint(definition) {
  const warnings = [];
  const stateKeys = definition.input === void 0 ? null : Object.keys(definition.input);
  for (const [id, q] of Object.entries(definition.questions)) {
    const at = `questions.${id}`;
    const refs = [...q.instructions.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (refs.length === 0) {
      warnings.push(`${at}: instructions name no state field in backticks (e.g. "... in \`body\`?"), as every Laya preset does`);
    } else if (stateKeys !== null && !refs.some((r) => stateKeys.includes(r))) {
      warnings.push(`${at}: instructions reference ${refs.map((r) => `\`${r}\``).join(", ")}, which is not a key of \`input\` (${stateKeys.join(", ")})`);
    }
    if (q.type === "noul" && q.labels === void 0) {
      warnings.push(`${at}: a noul follows its own "false:/true:" labels (Laya #156); prefer a small semantic choice, or add criteria and "labels": {"true": "A", "false": "B"}`);
    }
    if (q.type === "score") {
      warnings.push(`${at}: score is Laya's weakest primitive and multilingual rarely picks the first level (#131); prefer a choice, or validate with test`);
    }
    if (q.type === "choice") {
      const labels = Array.isArray(q.criteria) ? q.criteria : Object.keys(q.criteria ?? {});
      const booleans = labels.filter((l) => BOOLEAN_WORDS.has(l.toLowerCase()));
      if (booleans.length > 0) {
        warnings.push(`${at}: boolean-word labels (${booleans.join(", ")}) are followed instead of their descriptions; use semantic labels`);
      }
      if (labels.length > 20) {
        warnings.push(`${at}: ${labels.length} options; past ~20 each gets only a few tokens and accuracy collapses \u2014 split into a coarse question and a decide.next chain`);
      } else if (labels.length > 10) {
        warnings.push(`${at}: ${labels.length} options; keep a question to about 10`);
      }
      if (labels.length > 3 && !labels.some((l) => CATCH_ALL.test(l))) {
        warnings.push(`${at}: no catch-all option; add "other": "none of the other options fits"`);
      }
    }
    const rendered = Array.isArray(q.criteria) ? q.criteria.join(" ") : Object.entries(q.criteria ?? {}).map(([k, v]) => `${k}: ${v ?? ""}`).join(" ");
    const chars = q.instructions.length + rendered.length;
    if (chars > HEAD_CHAR_BUDGET) {
      warnings.push(`${at}: instructions and options are ${chars} characters; Laya's ~190-token head budget will cut them \u2014 shorten the glosses`);
    }
    if (definition.model === "english" && /[^\x00-\x7f]/.test(q.instructions + rendered)) {
      warnings.push(`${at}: model "english" with non-English text; the English checkpoint collapses outside English \u2014 leave model out`);
    }
  }
  return warnings;
}

// packages/mm-classifier/dist/hook.js
function reasonOf(decision) {
  return `classifier ${decision.classifier}: ${decision.label} (${decision.confidence.toFixed(2)})`;
}
function hookOutput(event, decision) {
  const outcome = decision.outcome === "block" ? "deny" : decision.outcome;
  if (event === "PreToolUse") {
    if (outcome !== "allow" && outcome !== "ask" && outcome !== "deny")
      return null;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: outcome,
        permissionDecisionReason: reasonOf(decision)
      }
    };
  }
  if (outcome === "deny")
    return { decision: "block", reason: reasonOf(decision) };
  return null;
}
function hookFragment(event, matcher, binPath, classifierRef) {
  return {
    hooks: {
      [event]: [
        {
          matcher,
          hooks: [
            { type: "command", command: `node "${binPath}" hook "${classifierRef}"`, timeout: 10 }
          ]
        }
      ]
    }
  };
}

// packages/mm-classifier/dist/server.js
import { spawn, spawnSync } from "node:child_process";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, openSync, readFileSync as readFileSync2, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
function stateDir(env = process.env) {
  return join3(env.XDG_STATE_HOME || join3(homedir2(), ".local", "state"), "muscle-memory");
}
function serverEnv(cfg, base = process.env) {
  const env = {
    ...base,
    LAYA_HOST: "127.0.0.1",
    LAYA_PORT: new URL(cfg.url).port || "80",
    LAYA_DEVICE: cfg.device,
    LAYA_MODELS: cfg.models,
    LAYA_PRELOAD: "1"
  };
  if (cfg.device === "cpu")
    env.CUDA_VISIBLE_DEVICES = "";
  return env;
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
var sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function start(cfg, waitSeconds, dir = stateDir()) {
  if (await health(cfg.url))
    return `Laya server already running at ${cfg.url}`;
  if (!existsSync2(cfg.python)) {
    throw new Error(`no Python interpreter at ${cfg.python}; install Laya with: mm-classifier setup (or set MM_LAYA_PYTHON)`);
  }
  mkdirSync2(dir, { recursive: true });
  const logPath = join3(dir, "laya-serve.log");
  const log = openSync(logPath, "a");
  const child = spawn(cfg.python, ["-m", "laya.serve"], {
    detached: true,
    stdio: ["ignore", log, log],
    env: serverEnv(cfg)
  });
  child.unref();
  const pid = child.pid;
  if (pid === void 0)
    throw new Error(`could not start ${cfg.python}; see ${logPath}`);
  writeFileSync2(join3(dir, "laya-serve.pid"), `${pid}
`);
  const deadline = Date.now() + waitSeconds * 1e3;
  while (Date.now() < deadline) {
    if (await health(cfg.url))
      return `Laya server running at ${cfg.url} (pid ${pid}, device ${cfg.device}, log ${logPath})`;
    if (!alive(pid))
      throw new Error(`Laya server exited during startup; see ${logPath}`);
    await sleep(500);
  }
  throw new Error(`Laya server did not answer within ${waitSeconds}s; see ${logPath}`);
}
function stop(dir = stateDir()) {
  const pidPath = join3(dir, "laya-serve.pid");
  if (!existsSync2(pidPath))
    return "no Laya server started by mm-classifier";
  const pid = Number(readFileSync2(pidPath, "utf8").trim());
  rmSync(pidPath);
  if (!Number.isInteger(pid) || !alive(pid))
    return "Laya server was not running";
  process.kill(pid, "SIGTERM");
  return `stopped Laya server (pid ${pid})`;
}
async function status(cfg) {
  const pythonExists = existsSync2(cfg.python);
  let layaVersion2 = null;
  if (pythonExists) {
    const probe = spawnSync(cfg.python, ["-I", "-c", "import laya; print(laya.__version__)"], {
      encoding: "utf8",
      timeout: 3e4
    });
    if (probe.status === 0)
      layaVersion2 = probe.stdout.trim();
  }
  return { python: cfg.python, pythonExists, layaVersion: layaVersion2, running: await health(cfg.url), url: cfg.url };
}

// packages/mm-classifier/dist/setup.js
import { spawnSync as spawnSync2 } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
import { dirname as dirname3 } from "node:path";
var defaultRunner = (command, args) => spawnSync2(command, args, { stdio: "inherit" }).status ?? 1;
var defaultProber = (command, args) => {
  const result = spawnSync2(command, args, { encoding: "utf8", timeout: 6e4 });
  return result.status === 0 ? result.stdout.trim() : null;
};
var PYTHON_VERSION = "3.12";
var CPU_TORCH_INDEX = "https://download.pytorch.org/whl/cpu";
function layaVersion(python, probe) {
  if (!existsSync3(python))
    return null;
  return probe(python, ["-I", "-c", "import laya; print(laya.__version__)"]);
}
function step(run, log, what, command, args) {
  log(`==> ${what}`);
  if (run(command, args) !== 0)
    throw new Error(`setup failed while trying to ${what}: ${command} ${args.join(" ")}`);
}
function pythonList(models) {
  const names = models.split(",").map((m) => m.trim()).filter(Boolean);
  return `[${names.map((n) => JSON.stringify(n)).join(", ")}]`;
}
function setup(cfg, options, run = defaultRunner, probe = defaultProber) {
  const { log } = options;
  const existing = layaVersion(cfg.python, probe);
  if (existing !== null) {
    log(`Laya ${existing} is already installed at ${cfg.python}`);
  } else {
    const venv = dirname3(dirname3(cfg.python));
    const uv = probe("uv", ["--version"]) !== null;
    if (!existsSync3(cfg.python)) {
      if (uv) {
        step(run, log, `create a Python ${PYTHON_VERSION} virtualenv at ${venv}`, "uv", ["venv", "--python", PYTHON_VERSION, venv]);
      } else {
        const version2 = probe("python3", ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"]);
        const [major = 0, minor = 0] = (version2 ?? "").split(".").map(Number);
        if (major < 3 || major === 3 && minor < 10) {
          throw new Error(`Laya needs Python >= 3.10 and uv is not installed; found python3 ${version2 ?? "missing"}`);
        }
        step(run, log, `create a virtualenv at ${venv}`, "python3", ["-m", "venv", venv]);
      }
    }
    const pip = (packages) => uv ? ["uv", ["pip", "install", "--python", cfg.python, ...packages]] : [cfg.python, ["-m", "pip", "install", ...packages]];
    const torch = cfg.device === "cpu" ? ["--index-url", CPU_TORCH_INDEX, "torch"] : ["torch"];
    step(run, log, `install torch (${cfg.device === "cpu" ? "CPU build" : "default build"})`, ...pip(torch));
    step(run, log, "install laya[serve]", ...pip(["laya[serve]"]));
  }
  const version = layaVersion(cfg.python, probe);
  if (version === null)
    throw new Error(`Laya still does not import from ${cfg.python}`);
  if (options.download) {
    step(run, log, `download the ${cfg.models} checkpoint(s) from Hugging Face`, cfg.python, [
      "-c",
      `from laya import Router; Router(device="cpu").preload(${pythonList(cfg.models)})`
    ]);
  }
  return version;
}

// packages/mm-classifier/dist/bin.js
var USAGE = `usage: mm-classifier <command>
  new <name> (--store mm | --out <path>) [--force]   read a definition from stdin and save it
  list                                               list classifiers in .mm/classifiers/
  run <name|path>                                    classify the JSON on stdin, print the decision
  test <name|path> [--min-accuracy 1.0]              run the classifier's own examples
  hook <name|path>                                   classify a Claude Code hook payload (fails open)
  hook-fragment <name|path> --event <E> [--matcher <M>]  print settings.json wiring, install nothing
  server start [--wait 120] | stop | status          manage the local Laya server
  setup [--no-download]                              install Laya and download its checkpoints`;
var UsageError = class extends Error {
};
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set(["--force", "--no-download"]);
function parse(argv) {
  const positional = [];
  const flags = /* @__PURE__ */ new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
    } else if (BOOLEAN_FLAGS.has(arg)) {
      flags.set(arg, true);
    } else {
      const value = argv[i + 1];
      if (value === void 0)
        throw new UsageError(`${arg} needs a value`);
      flags.set(arg, value);
      i++;
    }
  }
  return { positional, flags };
}
function flag(parsed, name) {
  const value = parsed.flags.get(name);
  return typeof value === "string" ? value : void 0;
}
function numberFlag(parsed, name, fallback) {
  const raw = flag(parsed, name);
  if (raw === void 0)
    return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new UsageError(`${name}: not a number: ${raw}`);
  return value;
}
function ref(parsed, command) {
  const value = parsed.positional[1];
  if (value === void 0)
    throw new UsageError(`${command} needs <name|path>`);
  return value;
}
function readStdinJson(what) {
  const text = readFileSync3(0, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`stdin: expected ${what} as JSON`);
  }
}
function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
var HOOK_REQUEST_TIMEOUT_MS = 8e3;
async function classify(path, input, timeoutMs, follow = true) {
  return evaluate(path, input, { url: config().url, timeoutMs, follow });
}
function cmdNew(parsed, root) {
  const name = parsed.positional[1];
  if (name === void 0)
    throw new UsageError("new needs <name>");
  const raw = readStdinJson("a classifier definition");
  const definition = validate({ ...raw, name });
  const path = targetPath(root, name, {
    store: flag(parsed, "--store"),
    out: flag(parsed, "--out")
  });
  writeDefinition(path, definition, parsed.flags.has("--force"));
  printWarnings(definition);
  process.stdout.write(`${path}
`);
}
function printWarnings(definition) {
  for (const warning of lint(definition))
    process.stderr.write(`warning: ${warning}
`);
}
function cmdList(root) {
  for (const entry of list(root)) {
    if (entry.ok)
      process.stdout.write(`${entry.name}	${entry.description}
`);
    else
      process.stderr.write(`invalid: ${entry.error}
`);
  }
}
async function cmdTest(parsed, root) {
  const path = resolveRef(root, ref(parsed, "test"));
  const definition = loadDefinition(path);
  const minAccuracy = numberFlag(parsed, "--min-accuracy", 1);
  const examples = definition.examples ?? [];
  if (examples.length === 0) {
    process.stderr.write(`${definition.name} has no examples; a classifier cannot be trusted untested
`);
    return 1;
  }
  printWarnings(definition);
  let hits = 0;
  const bySource = { rule: { n: 0, hits: 0 }, laya: { n: 0, hits: 0 } };
  for (const [i, example] of examples.entries()) {
    const decision = await classify(path, example.input, void 0, false);
    const ok = decision.label === example.expect;
    const source = decision.reason === "rule" ? bySource.rule : bySource.laya;
    source.n++;
    if (ok) {
      hits++;
      source.hits++;
    }
    process.stdout.write(`${ok ? "ok  " : "FAIL"} [${i}] expect=${example.expect} got=${decision.label} by=${decision.reason === "rule" ? "rule" : "laya"} confidence=${decision.confidence.toFixed(2)} outcome=${decision.outcome} (${decision.reason})
`);
  }
  const accuracy = hits / examples.length;
  process.stdout.write(`rules ${bySource.rule.hits}/${bySource.rule.n} \xB7 laya ${bySource.laya.hits}/${bySource.laya.n}` + (bySource.laya.n === 0 && bySource.rule.n > 0 ? " \u2014 no example reaches Laya, so this says nothing about it\n" : "\n"));
  process.stdout.write(`accuracy ${accuracy.toFixed(2)} (${hits}/${examples.length}), minimum ${minAccuracy}
`);
  return accuracy < minAccuracy ? 1 : 0;
}
async function cmdHook(parsed, root) {
  try {
    const path = resolveRef(root, ref(parsed, "hook"));
    const payload = readStdinJson("a hook payload");
    const event = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
    const output = hookOutput(event, await classify(path, payload, HOOK_REQUEST_TIMEOUT_MS));
    if (output !== null)
      process.stdout.write(`${JSON.stringify(output)}
`);
  } catch (err) {
    process.stderr.write(`mm-classifier hook: ${err.message} (allowed)
`);
  }
}
function cmdHookFragment(parsed, root) {
  const path = resolveRef(root, ref(parsed, "hook-fragment"));
  loadDefinition(path);
  const event = flag(parsed, "--event");
  if (event === void 0)
    throw new UsageError("hook-fragment needs --event <E>, e.g. PreToolUse");
  const rel = relative(root, path);
  const classifierRef = rel.startsWith("..") || isAbsolute(rel) ? path : `$CLAUDE_PROJECT_DIR/${rel}`;
  const binPath = fileURLToPath(import.meta.url);
  print(hookFragment(event, flag(parsed, "--matcher") ?? "*", binPath, classifierRef));
}
async function cmdServer(parsed) {
  const action = parsed.positional[1];
  const cfg = config();
  if (action === "start") {
    process.stdout.write(`${await start(cfg, numberFlag(parsed, "--wait", 120))}
`);
    return 0;
  }
  if (action === "stop") {
    process.stdout.write(`${stop()}
`);
    return 0;
  }
  if (action === "status") {
    const s = await status(cfg);
    process.stdout.write(`python  ${s.python}${s.pythonExists ? "" : " (missing)"}
laya    ${s.layaVersion ?? "not installed"}
server  ${s.url} ${s.running ? "running" : "not running"}
`);
    return s.running ? 0 : 1;
  }
  throw new UsageError("server needs start, stop or status");
}
async function main(argv) {
  const parsed = parse(argv);
  const root = process.cwd();
  switch (parsed.positional[0]) {
    case "new":
      cmdNew(parsed, root);
      return 0;
    case "list":
      cmdList(root);
      return 0;
    case "run":
      print(await classify(resolveRef(root, ref(parsed, "run")), readStdinJson("an input")));
      return 0;
    case "test":
      return cmdTest(parsed, root);
    case "hook":
      await cmdHook(parsed, root);
      return 0;
    case "hook-fragment":
      cmdHookFragment(parsed, root);
      return 0;
    case "server":
      return cmdServer(parsed);
    case "setup": {
      const cfg = config();
      const version = setup(cfg, {
        download: !parsed.flags.has("--no-download"),
        log: (line) => process.stdout.write(`${line}
`)
      });
      process.stdout.write(`Laya ${version} ready at ${cfg.python}; start it with: mm-classifier server start
`);
      return 0;
    }
    default:
      throw new UsageError(USAGE);
  }
}
main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
  process.stderr.write(`${err.message}
`);
  process.exit(err instanceof ServerUnreachable ? 3 : 1);
});
