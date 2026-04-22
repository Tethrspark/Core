# Tethrspark Core

Tethrspark Core is a TypeScript middleware framework for building virtual assistants.
It runs a middleware stack once, in registration order, and shares a mutable state
object across all middleware.

## Status

This document describes **v1 of the public API design**.

---

## Installation

Package naming is not finalized yet. Example:

```bash
npm install tethrspark-core
```

ESM only.

---

## Concepts

### Single-pass middleware

- Middleware are traversed exactly once.
- Execution order matches `.use(...)` registration order.
- Every middleware is async-capable.
- Middleware mutate shared state in place.
- No `next()` function is used.

### State object

Each middleware receives the same state object:

```ts
interface TethrState<D extends BaseDat, C extends object> {
  dat: D;
  ctx: C;
  res: MiddlewareResponse[];
  synthesize: boolean; // default false
}
```

- `dat`: prompt-related data that should be persisted with prompt records.
- `ctx`: computed/contextual data for runtime/debug use only.
- `res`: middleware responses.
- `synthesize`: if true, a synthesis middleware can create a final merged response.

---

## Type definitions

```ts
export interface BaseDat {
  prmt: string; // required for every prompt call
  [key: string]: unknown;
}

export interface MiddlewareResponse {
  middleware: string; // module name
  score: number; // 0..1 (default: 1)
  text: string;
}

export interface MiddlewareTrace {
  middleware: string;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  durationMs: number;
  responseCountDelta: number;
}

export interface SynthesisSelection {
  selected: MiddlewareResponse[];
  combinedText: string; // newline-joined selected items
  usedChars: number;
  maxChars: number;
}

export interface TethrState<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>
> {
  dat: D;
  ctx: C;
  res: MiddlewareResponse[];
  synthesize: boolean;
}

export interface MiddlewareTools<D extends BaseDat, C extends object> {
  name: string;
  respond: (text: string, score?: number) => void;
  selectForSynthesis: (maxChars?: number) => SynthesisSelection;
}

export type Middleware<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>
> = (
  state: TethrState<D, C>,
  tools: MiddlewareTools<D, C>
) => void | Promise<void>;

export interface TethrModule<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>
> {
  name: string;
  run: Middleware<D, C>;
}

export interface TethrOptions {
  synthesisMaxChars?: number; // default 4000
  clampScores?: boolean; // default true
}

export interface PromptResult<D extends BaseDat, C extends object> {
  state: TethrState<D, C>;
  output: string;
  traces: MiddlewareTrace[];
}
```

---

## Public API

```ts
export interface Tethr<D extends BaseDat, C extends object> {
  use(module: TethrModule<D, C>): this;
  prompt(
    prompt: string,
    data?: Omit<Partial<D>, "prmt">,
    ctx?: Partial<C>
  ): Promise<PromptResult<D, C>>;
}

export function createTethr<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>
>(options?: TethrOptions): Tethr<D, C>;
```

### `.use(...)`

`.use(...)` accepts a **module instance** (typically returned by a module factory).

```ts
assistant.use(myModule({ options })).use(myOtherModule());
```

---

## Prompt lifecycle

`assistant.prompt(prompt, data, ctx)` initializes state as:

- `dat = { ...data, prmt: prompt }`
- `ctx = { ...ctx }`
- `res = []`
- `synthesize = false`

Then it:

1. Runs each registered module once in order.
2. Captures middleware timing traces.
3. Returns output:
   - if `synthesize === false`: newline-joined `res[].text`
   - if `synthesize === true`: output depends on middleware responses (typically a synthesizer module adds final text as a response)

---

## Synthesis behavior

Synthesis is middleware-driven:

- Any middleware may set `state.synthesize = true`.
- A synthesis module may call `selectForSynthesis(maxChars?)`.
- Selection uses character budget and preserves at least one response per middleware when available.

### Selection algorithm

1. Group responses by `middleware`.
2. Pick highest-scoring response from each non-empty group.
3. Fill remaining budget with other responses by descending score.
4. Return newline-joined `combinedText`.
5. Do not apply score-threshold dropping.

If a middleware emits no responses, it has nothing to preserve.

---

## Error behavior

- Execution is fail-fast.
- If a middleware throws, prompt execution stops and the error is surfaced.
- No lifecycle hooks are defined in v1.

---

## Example

```ts
import { createTethr, type TethrModule } from "tethrspark-core";

type Dat = { prmt: string; sentAt?: string; replyToId?: string };
type Ctx = { intent?: string };

function intentModule(): TethrModule<Dat, Ctx> {
  return {
    name: "intent",
    async run(state, { respond }) {
      state.ctx.intent = "support";
      respond("Detected support intent.", 0.7);
    },
  };
}

function factsModule(): TethrModule<Dat, Ctx> {
  return {
    name: "facts",
    async run(_state, { respond }) {
      respond("Refunds are available within 30 days.", 0.9);
      respond("VIP customers can receive expedited processing.", 0.6);
    },
  };
}

function synthModule(maxChars = 2500): TethrModule<Dat, Ctx> {
  return {
    name: "synth",
    async run(state, { respond, selectForSynthesis }) {
      if (!state.synthesize) return;

      const selected = selectForSynthesis(maxChars);
      const finalText = `Synthesized reply:\n${selected.combinedText}`;
      respond(finalText, 1);
    },
  };
}

const assistant = createTethr<Dat, Ctx>({ synthesisMaxChars: 3000 })
  .use(intentModule())
  .use(factsModule())
  .use(synthModule());

const result = await assistant.prompt(
  "Can I get a refund?",
  { sentAt: new Date().toISOString() },
  {}
);

console.log(result.output);
```

---

## Planned clarifications for next revision

- Whether framework should include an optional built-in synthesizer helper.
- Exact score clamping semantics (`respond` input validation behavior).
- Whether final output should distinguish synthesized vs non-synthesized responses in metadata.
