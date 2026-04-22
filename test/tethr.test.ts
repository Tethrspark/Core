import { describe, expect, it } from "vitest";
import {
  MissingCapabilityError,
  createTethr,
  type TethrModule,
} from "../src/index.js";

type Dat = {
  prmt: string;
  threadId?: string;
};

type Ctx = {
  marks?: string[];
};

describe("createTethr", () => {
  it("runs setup stack then runtime stack in registration order", async () => {
    const callOrder: string[] = [];

    const m1: TethrModule<Dat, Ctx> = {
      name: "m1",
      setup: async (state) => {
        callOrder.push("m1:setup");
        state.ctx.marks = ["m1-setup"];
      },
      runtime: async (state, tools) => {
        callOrder.push("m1:runtime");
        state.ctx.marks?.push("m1-runtime");
        tools.respond("from m1");
      },
    };

    const m2: TethrModule<Dat, Ctx> = {
      name: "m2",
      setup: async (state) => {
        callOrder.push("m2:setup");
        state.ctx.marks?.push("m2-setup");
      },
      runtime: async (state, tools) => {
        callOrder.push("m2:runtime");
        state.ctx.marks?.push("m2-runtime");
        tools.respond("from m2", 0.6);
      },
    };

    const assistant = createTethr<Dat, Ctx>().use(m1).use(m2);
    const result = await assistant.prompt("hello");

    expect(callOrder).toEqual([
      "m1:setup",
      "m2:setup",
      "m1:runtime",
      "m2:runtime",
    ]);
    expect(result.output).toBe("from m1\nfrom m2");
    expect(result.state.ctx.marks).toEqual([
      "m1-setup",
      "m2-setup",
      "m1-runtime",
      "m2-runtime",
    ]);
    expect(result.state.res).toHaveLength(2);
    expect(result.state.res[0]).toMatchObject({
      middleware: "m1",
      text: "from m1",
      score: 1,
    });
    expect(result.state.res[1]).toMatchObject({
      middleware: "m2",
      text: "from m2",
      score: 0.6,
    });
    expect(result.traces).toHaveLength(4);
    expect(result.traces.map((trace) => trace.phase)).toEqual([
      "setup",
      "setup",
      "runtime",
      "runtime",
    ]);
  });

  it("throws when a required capability has not been provided yet", () => {
    const assistant = createTethr();

    const requiresSynth: TethrModule = {
      name: "requires-synth",
      requires: ["synthesis"],
      runtime: () => undefined,
    };

    expect(() => assistant.use(requiresSynth)).toThrowError(
      MissingCapabilityError
    );
    expect(() => assistant.use(requiresSynth)).toThrow(
      /requires capability "synthesis"/
    );
  });

  it("accepts module when required capability was provided by an earlier module", async () => {
    const provider: TethrModule = {
      name: "provider",
      provides: ["synthesis"],
      setup: () => undefined,
    };

    const consumer: TethrModule = {
      name: "consumer",
      requires: ["synthesis"],
      runtime: (_state, tools) => {
        expect(tools.capabilities).toContain("synthesis");
        tools.respond("consumer ran");
      },
    };

    const result = await createTethr().use(provider).use(consumer).prompt("x");
    expect(result.output).toBe("consumer ran");
  });

  it("returns full state and uses explicit output when setOutput is called", async () => {
    const module: TethrModule<Dat, Ctx> = {
      name: "output-setter",
      runtime: (state, tools) => {
        state.ctx.marks = ["seen"];
        tools.respond("intermediate");
        tools.setOutput("final-output");
      },
    };

    const result = await createTethr<Dat, Ctx>().use(module).prompt("ping", {
      threadId: "t-1",
    });

    expect(result.output).toBe("final-output");
    expect(result.state.dat.prmt).toBe("ping");
    expect(result.state.dat.threadId).toBe("t-1");
    expect(result.state.ctx).toEqual({ marks: ["seen"] });
    expect(result.state.res).toHaveLength(1);
  });

  it("supports binary output via setOutput", async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    const module: TethrModule = {
      name: "binary",
      runtime: (_state, tools) => {
        tools.setOutput(bytes);
      },
    };

    const result = await createTethr().use(module).prompt("binary");
    expect(result.output).toBe(bytes);
  });

  it("clamps scores by default and can disable clamping", async () => {
    const module: TethrModule = {
      name: "scoring",
      runtime: (_state, tools) => {
        tools.respond("low", -4);
        tools.respond("high", 9);
      },
    };

    const clamped = await createTethr().use(module).prompt("clamped");
    expect(clamped.state.res.map((item) => item.score)).toEqual([0, 1]);

    const unclamped = await createTethr({ clampScores: false })
      .use(module)
      .prompt("unclamped");
    expect(unclamped.state.res.map((item) => item.score)).toEqual([-4, 9]);
  });
});
