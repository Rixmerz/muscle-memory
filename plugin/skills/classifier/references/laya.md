# Laya: how it actually works, and how to use it

Reference for writing `mm-classifier` definitions. Facts come from Laya
0.3.20's own source and shipped README (`laya-0.3.20.dist-info/METADATA`),
its repository (README, BENCHMARKS.md, docs/), and measurements on a real
Gmail inbox (2026-09-26). Section names below are the README's.

## 1. What it is, and what it is not

Laya is a bidirectional encoder (ModernBERT-large for `english`,
mmBERT-base for `multilingual`) plus a small decision head. One forward pass
reads **only** this sequence:

```
[CLS] "<type> question: <instructions>" [SEP] [MASK] opt0 [MASK] opt1 ... [SEP] <state> [SEP]
```

There is no retrieval and no knowledge lookup. **It answers what the given
text says, not what the world knows.** "Is `bancochile.cl` a bank?" or "is
this sender my employer?" cannot be answered from the text, and measured
accordingly: domain-only questions scored 9–27% on 8 categories.

The vendor is explicit (README, *Honest limits* / *Fine-Tuning*): "Laya is
a fast base to specialise, not a zero-shot decision engine." Published
zero-shot ceilings:

| Task | Accuracy | Note |
|---|---|---|
| AG News (topic) | 0.947 | in training mix |
| Email spam / phishing | 0.993 | in training mix |
| Support triage, 10-way | 0.50–0.52 | **in training mix** |
| Typed-decisions (4 workflows) | 0.36 base vs 0.766 fine-tuned | base is **below** the 0.461 majority-class baseline |
| Moderation (held out) | 0.53 | barely above chance |
| SST-5 ordinal `score` | 0.37 | weakest primitive |

Zero-shot works when the label is a property of the text itself and close
to something it was trained on (topic, spam, entailment, relevance). A
custom 10-category schema lands around 50%, as ours did.

## 2. Input format

**State** is a string, a dict, or a list. Dicts and lists are sent as
`json.dumps(state, ensure_ascii=False)`; a list is only treated specially in
that truncation drops its oldest items first (a conversation, newest last).
Keys are not interpreted, but every shipped preset follows one convention,
and following it is the canonical form:

- one field carries the text, and the instructions name it in backticks:
  `` "Which team should handle the email in `body`?" ``
- email state is `{"subject", "body", "from"}`, the shape `laya.email_state`
  builds; `laya.clean_email_body` strips quoted history, signatures,
  footers and disclaimers (English, Portuguese, Spanish).

**Questions** are `{id: {type, instructions, criteria?, labels?}}`:

| Type | `criteria` | Result |
|---|---|---|
| `choice` | `{label: gloss}`, `{label: null}` or `[labels]` | `choice`, `probabilities`, `answer_confidence` |
| `score` | ordered list, rendered `level 0: …`, `level 1: …` | `score` (expected index), `legend`, `probabilities` |
| `noul` | optional, keys exactly `true`/`false`; `labels` renames what the model sees | `noul` = P(true) |

The model sees `label: gloss` for each `choice` option; the label itself is
read. Presets use short noun-phrase glosses ("money returned or a duplicate
charge reversed"), a catch-all `other: none of the other options fits`, and
instructions phrased as one question ending in `?`.

**Token budget.** Instructions and all options share `head_max_len`
(192 tokens `english`, 256 `multilingual`); each option is also cut at 48
tokens. When options overflow, every option is cut to an equal share and the
instructions shrink (to as little as 8 tokens). The state gets what is left
of `max_len` (512 / 1024). Keep a question to about 10 options with short
glosses; past ~20 accuracy collapses (Banking77, 77 labels: 0.425).

## 3. Pitfalls the vendor documents

- **Boolean-word `choice` labels** (`true`/`false`, `yes`/`no`) are followed
  instead of the glosses. Use semantic labels.
- **`noul` follows its own `false:`/`true:` labels** (#156), strongest on
  `english`. Measured here: the shipped `is_spam` preset scored **19%** on
  newsletters vs transactional mail — inverted. Workarounds, measured on
  the same 166 emails:

  | Form | Accuracy |
  |---|---|
  | preset `noul`, no criteria | 19–30% |
  | `noul` + criteria | 30–37% |
  | `noul` + criteria + `labels: {"true": "A", "false": "B"}` | 61–63% |
  | 2-option `choice`, keys `A`/`B` | 34–45% |
  | **3-option `choice`, semantic keys** (`bulk`/`transactional`/`personal`) | **70–73%** |

  Prefer a small semantic `choice` to a `noul`.
- **Negation is not safe** even with semantic labels (#377).
- **`score` is the weakest primitive**, and `multilingual` rarely picks the
  first level (#131). Avoid it, or validate it on your data.
- **`action.act_probability` carries no signal** (#185): it reads 1.0 for
  almost everything. Never gate on it.
- **`english` collapses outside English, and stays confident while wrong.**
  Let the Router pick (it sends Spanish to `multilingual`); only force
  `model` after measuring.

## 4. Confidence

Gate on `answer_confidence` (the probability of the chosen answer, the
calibrated quantity). The plain `confidence` field of `choice`/`score` is a
normalised entropy and must not share a threshold with it. But calibration
is weak as shipped: both checkpoints are over-confident, and
**`multilingual` ships with no fitted temperatures at all** — on Spanish
mail, wrong labels came back at 0.95–1.00. A threshold is a policy you
choose from measured accuracy on your own data, not a property of the model.

## 5. Specialising: where the accuracy is

1. **Head on the frozen encoder.** Embed labelled rows with Laya's encoder
   and train a small classifier per decision; set the threshold that keeps
   holdout agreement at a target, and escalate below it. The community tool
   `stuntd` does this behind the same `/v1/systemone` API (≥300 rows per
   decision; 12-label intent 89.5% → 100%; not remeasured by the vendor).
2. **Full fine-tune** with the vendor notebook
   (`notebooks/laya_finetune_typed_decisions_2xT4_kaggle.ipynb`): RLCD
   training on teacher probability distributions, 2×T4 GPUs, hours for
   ~30k questions; it also fits calibration temperatures.

Labels can come from rules, from a person, or from an LLM answering the
same question (distillation).

## 6. What does not exist in 0.3.20

`predict_long` (use `max_len`), a `laya-evals` command in the pip package
(it lives in the repository's `research/`), and any few-shot or in-context
example slot: the sequence has no place for examples, so examples in a
definition only serve `mm-classifier test`.
