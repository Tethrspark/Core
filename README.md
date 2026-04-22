# Tethrspark Core

[![CI](https://github.com/Tethrspark/Core/actions/workflows/ci.yml/badge.svg)](https://github.com/Tethrspark/Core/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/Tethrspark/Core/badge.svg?branch=main)](https://coveralls.io/github/Tethrspark/Core?branch=main)

Tethrspark Core is a TypeScript middleware framework for building virtual assistants.
It runs two middleware phases over a shared mutable state object:

1. `setup` phase
2. `runtime` phase

This document describes **v1 of the public API design**.

---

## Installation

Package naming is not finalized yet. Example:

```bash
pnpm add tethrspark-core
```

ESM only.

---

## Examples

- [Examples overview](./examples/README.md)
- [Minimal example](./examples/minimal.ts)
- [Capabilities example](./examples/capabilities.ts)

---

## Concepts

### Two-phase, single-pass execution

- Modules are registered with `.use(...)` in order.
- On each `.prompt(...)` call:
  - all `setup` functions run once in registration order
  - then all `runtime` functions run once in registration order
- No `next()` function is used.
- All functions are async-capable.
- State is mutated in place.

### Capability gating via `provides`/`requires`

Each module may declare:

- `provides: string[]`
- `requires: string[]`

At `.use(...)` time:

- Every required capability must already exist in the assistant capability list
  (from earlier modules' `provides`).
- If any required capability is missing, `.use(...)` throws immediately.
- Provided capabilities are appended to the assistant capability list.

This guarantees ordering and dependency safety before any prompt runs.

### State object

Each phase function receives the same state object:

```ts
interface TethrState<D extends BaseDat, C extends object> {
  dat: D;
  ctx: C;
  res: MiddlewareResponse[];
}
```

- `dat`: prompt-related data that should be persisted with prompt records.
- `ctx`: computed/contextual runtime data.
- `res`: middleware responses.

Core does not include built-in synthesis behavior. Features like synthesis should be
implemented inside modules.

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
  phase: "setup" | "runtime";
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  durationMs: number;
  responseCountDelta: number;
}

export interface TethrState<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>
> {
  dat: D;
  ctx: C;
  res: MiddlewareResponse[];
}

export interface MiddlewareTools<D extends BaseDat, C extends object> {
  name: string;
  capabilities: readonly string[];
  ext: Record<string, unknown>; // shared extension surface for setup/runtime modules
  respond: (text: string, score?: number) => void;
  setOutput: (output: string | Uint8Array) => void;
}

export type MiddlewareFn<
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
  provides?: string[];
  requires?: string[];
  setup?: MiddlewareFn<D, C>;
  runtime?: MiddlewareFn<D, C>;
}

export interface TethrOptions {
  clampScores?: boolean; // default true
}

export interface PromptResult<D extends BaseDat, C extends object> {
  output: string | Uint8Array;
  state: TethrState<D, C>; // full final state
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

`.use(...)` accepts a module instance (typically returned by a module factory):

```ts
assistant
  .use(myModule({ options }))
  .use(myOtherModule());
```

If a module declares missing `requires`, `.use(...)` throws a dependency error.

---

## Prompt lifecycle

`assistant.prompt(prompt, data, ctx)` initializes state as:

- `dat = { ...data, prmt: prompt }`
- `ctx = { ...ctx }`
- `res = []`

Then it:

1. Runs all registered `setup` functions in order.
2. Runs all registered `runtime` functions in order.
3. Returns:
   - `output`: explicit value set by any middleware via `tools.setOutput(...)`,
     otherwise newline-joined `state.res[].text`
   - `state`: full final mutable state object
   - `traces`: per-module per-phase timing metadata

---

## Error behavior

- Execution is fail-fast.
- If a phase function throws, prompt execution stops and the error is surfaced.
- Missing capabilities throw during `.use(...)` registration.
- No lifecycle hooks are defined in v1.

---

## Example

```ts
import { createTethr, type TethrModule } from "tethrspark-core";

type Dat = { prmt: string; sentAt?: string; replyToId?: string };
type Ctx = { intent?: string };

function synthesisModule(maxChars = 2500): TethrModule<Dat, Ctx> {
  return {
    name: "synthesis",
    provides: ["synthesis"],
    setup(state, tools) {
      state.ctx.intent = state.ctx.intent ?? "unknown";
      tools.ext.synthEnabled = false;
      tools.ext.selectForSynthesis = () => {
        const sorted = [...state.res].sort((a, b) => b.score - a.score);
        let used = 0;
        const selected: string[] = [];
        for (const item of sorted) {
          if (used + item.text.length > maxChars) continue;
          selected.push(item.text);
          used += item.text.length;
        }
        return selected.join("\n");
      };
    },
    runtime(_state, tools) {
      if (!tools.ext.synthEnabled) return;
      const select = tools.ext.selectForSynthesis as (() => string) | undefined;
      if (!select) return;
      tools.setOutput(select());
    },
  };
}

function decisionModule(): TethrModule<Dat, Ctx> {
  return {
    name: "decision",
    requires: ["synthesis"],
    runtime(state, tools) {
      if (state.dat.prmt.includes("summarize")) {
        tools.ext.synthEnabled = true;
      }
      tools.respond("Detected intent from decision module.", 0.7);
    },
  };
}

const assistant = createTethr<Dat, Ctx>()
  .use(synthesisModule())
  .use(decisionModule());

const result = await assistant.prompt(
  "summarize this thread",
  { sentAt: new Date().toISOString() },
  {}
);

console.log(result.output); // final output payload
console.log(result.state); // full internal state for app-level usage
```
