/**
 * Warnings for the pitfalls Laya's own README documents (see the skill's
 * references/laya.md). Warnings, not errors: each is a measured risk on
 * Laya 0.3.20 checkpoints, and a definition may have a reason to accept it.
 */
import type { Definition } from "./definition.js";

const BOOLEAN_WORDS = new Set(["true", "false", "yes", "no", "si", "sí", "verdadero", "falso"]);
const CATCH_ALL = /^(other|otro|otra|otros|none|ninguno|ninguna|rest|resto)$/i;
/** Instructions plus every rendered option share ~190 tokens on the English
 * checkpoint; at ~3.2 characters per token that is about 600 characters. */
const HEAD_CHAR_BUDGET = 600;

export function lint(definition: Definition): string[] {
  const warnings: string[] = [];
  const stateKeys = definition.input === undefined ? null : Object.keys(definition.input);

  for (const [id, q] of Object.entries(definition.questions)) {
    const at = `questions.${id}`;
    const refs = [...q.instructions.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    if (refs.length === 0) {
      warnings.push(`${at}: instructions name no state field in backticks (e.g. "... in \`body\`?"), as every Laya preset does`);
    } else if (stateKeys !== null && !refs.some((r) => stateKeys.includes(r))) {
      warnings.push(`${at}: instructions reference ${refs.map((r) => `\`${r}\``).join(", ")}, which is not a key of \`input\` (${stateKeys.join(", ")})`);
    }

    if (q.type === "noul" && q.labels === undefined) {
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
        warnings.push(`${at}: ${labels.length} options; past ~20 each gets only a few tokens and accuracy collapses — split into a coarse question and a decide.next chain`);
      } else if (labels.length > 10) {
        warnings.push(`${at}: ${labels.length} options; keep a question to about 10`);
      }
      if (labels.length > 3 && !labels.some((l) => CATCH_ALL.test(l))) {
        warnings.push(`${at}: no catch-all option; add "other": "none of the other options fits"`);
      }
    }

    const rendered = Array.isArray(q.criteria)
      ? q.criteria.join(" ")
      : Object.entries(q.criteria ?? {}).map(([k, v]) => `${k}: ${v ?? ""}`).join(" ");
    const chars = q.instructions.length + rendered.length;
    if (chars > HEAD_CHAR_BUDGET) {
      warnings.push(`${at}: instructions and options are ${chars} characters; Laya's ~190-token head budget will cut them — shorten the glosses`);
    }
    // eslint-disable-next-line no-control-regex
    if (definition.model === "english" && /[^\x00-\x7f]/.test(q.instructions + rendered)) {
      warnings.push(`${at}: model "english" with non-English text; the English checkpoint collapses outside English — leave model out`);
    }
  }
  return warnings;
}
