export interface BaseDat {
  prmt: string;
  [key: string]: unknown;
}

export interface MiddlewareResponse {
  middleware: string;
  score: number;
  text: string;
}

export interface MiddlewareTrace {
  middleware: string;
  phase: "setup" | "runtime";
  startedAt: number;
  endedAt: number;
  durationMs: number;
  responseCountDelta: number;
}

export interface TethrState<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>,
> {
  dat: D;
  ctx: C;
  res: MiddlewareResponse[];
}

export interface MiddlewareTools<D extends BaseDat, C extends object> {
  name: string;
  capabilities: readonly string[];
  ext: Record<string, unknown>;
  respond: (text: string, score?: number) => void;
  setOutput: (output: string | Uint8Array) => void;
}

export type MiddlewareFn<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>,
> = (state: TethrState<D, C>, tools: MiddlewareTools<D, C>) => void | Promise<void>;

export interface TethrModule<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>,
> {
  name: string;
  provides?: string[];
  requires?: string[];
  setup?: MiddlewareFn<D, C>;
  runtime?: MiddlewareFn<D, C>;
}

export interface TethrOptions {
  clampScores?: boolean;
}

export interface PromptResult<D extends BaseDat, C extends object> {
  output: string | Uint8Array;
  state: TethrState<D, C>;
  traces: MiddlewareTrace[];
}

export interface Tethr<D extends BaseDat, C extends object> {
  use(module: TethrModule<D, C>): this;
  prompt(
    prompt: string,
    data?: Omit<Partial<D>, "prmt">,
    ctx?: Partial<C>,
  ): Promise<PromptResult<D, C>>;
}

export class MissingCapabilityError extends Error {
  public readonly module: string;
  public readonly missing: string[];
  public readonly requires: string[];
  public readonly capabilities: string[];

  public constructor(args: {
    module: string;
    missing: string[];
    requires: string[];
    capabilities: string[];
  }) {
    const message = `Module "${args.module}" requires capabilities [${args.requires.join(", ")}], missing [${args.missing.join(", ")}]. Registered capabilities: [${args.capabilities.join(", ")}]`;
    super(message);
    this.name = "MissingCapabilityError";
    this.module = args.module;
    this.missing = args.missing;
    this.requires = args.requires;
    this.capabilities = args.capabilities;
  }
}

const DEFAULT_OPTIONS: Required<TethrOptions> = {
  clampScores: true,
};

class TethrImpl<D extends BaseDat, C extends object> implements Tethr<D, C> {
  private readonly modules: TethrModule<D, C>[] = [];

  private readonly capabilitySet = new Set<string>();

  private readonly capabilityList: string[] = [];

  private readonly options: Required<TethrOptions>;

  public constructor(options?: TethrOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  public use(module: TethrModule<D, C>): this {
    const requires = module.requires ?? [];
    const missing = requires.filter((capability) => !this.capabilitySet.has(capability));
    if (missing.length > 0) {
      throw new MissingCapabilityError({
        module: module.name,
        missing,
        requires,
        capabilities: [...this.capabilityList],
      });
    }

    this.modules.push(module);

    for (const provided of module.provides ?? []) {
      this.capabilityList.push(provided);
      this.capabilitySet.add(provided);
    }

    return this;
  }

  public async prompt(
    prompt: string,
    data?: Omit<Partial<D>, "prmt">,
    ctx?: Partial<C>,
  ): Promise<PromptResult<D, C>> {
    const state: TethrState<D, C> = {
      dat: { ...(data ?? {}), prmt: prompt } as D,
      ctx: { ...(ctx ?? {}) } as C,
      res: [],
    };

    const traces: MiddlewareTrace[] = [];
    const ext: Record<string, unknown> = {};
    let output: string | Uint8Array | undefined;

    const createTools = (moduleName: string): MiddlewareTools<D, C> => ({
      name: moduleName,
      capabilities: [...this.capabilityList],
      ext,
      respond: (text: string, score = 1): void => {
        const normalizedScore = this.options.clampScores
          ? Math.max(0, Math.min(1, score))
          : score;

        state.res.push({
          middleware: moduleName,
          score: normalizedScore,
          text,
        });
      },
      setOutput: (nextOutput): void => {
        output = nextOutput;
      },
    });

    for (const module of this.modules) {
      if (!module.setup) continue;
      const startedAt = Date.now();
      const beforeCount = state.res.length;
      await module.setup(state, createTools(module.name));
      const endedAt = Date.now();
      traces.push({
        middleware: module.name,
        phase: "setup",
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        responseCountDelta: state.res.length - beforeCount,
      });
    }

    for (const module of this.modules) {
      if (!module.runtime) continue;
      const startedAt = Date.now();
      const beforeCount = state.res.length;
      await module.runtime(state, createTools(module.name));
      const endedAt = Date.now();
      traces.push({
        middleware: module.name,
        phase: "runtime",
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        responseCountDelta: state.res.length - beforeCount,
      });
    }

    const finalOutput =
      output === undefined ? state.res.map((response) => response.text).join("\n") : output;

    return {
      output: finalOutput,
      state,
      traces,
    };
  }
}

export function createTethr<
  D extends BaseDat = BaseDat,
  C extends object = Record<string, unknown>,
>(options?: TethrOptions): Tethr<D, C> {
  return new TethrImpl<D, C>(options);
}

// Backward-friendly alias for the dependency registration error type.
export { MissingCapabilityError as TethrDependencyError };
