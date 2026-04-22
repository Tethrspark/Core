import { createTethr, type TethrModule } from "../src/index.js";

type Dat = {
  prmt: string;
};

type Ctx = {
  intent?: string;
};

function intentProvider(): TethrModule<Dat, Ctx> {
  return {
    name: "intent-provider",
    provides: ["intent"],
    setup: (_state, tools) => {
      tools.ext.setIntent = (intent: string) => {
        tools.ext.intent = intent;
      };
      tools.ext.getIntent = () => tools.ext.intent as string | undefined;
    },
  };
}

function intentDetector(): TethrModule<Dat, Ctx> {
  return {
    name: "intent-detector",
    requires: ["intent"],
    runtime: (state, tools) => {
      const setIntent = tools.ext.setIntent as ((intent: string) => void) | undefined;
      if (!setIntent) return;

      const intent = state.dat.prmt.includes("refund") ? "refund-support" : "general";
      setIntent(intent);
      state.ctx.intent = intent;
      tools.respond(`Intent detected: ${intent}`, 0.8);
    },
  };
}

function responder(): TethrModule<Dat, Ctx> {
  return {
    name: "responder",
    requires: ["intent"],
    runtime: (_state, tools) => {
      const getIntent = tools.ext.getIntent as (() => string | undefined) | undefined;
      const intent = getIntent?.() ?? "unknown";
      tools.setOutput(`Handled prompt with intent: ${intent}`);
    },
  };
}

async function main(): Promise<void> {
  const assistant = createTethr<Dat, Ctx>()
    .use(intentProvider())
    .use(intentDetector())
    .use(responder());

  const result = await assistant.prompt("Can I request a refund?");

  console.log(result.output);
  console.log(result.state);
}

void main();
