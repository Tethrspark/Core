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
    setup: (_s, m, _t) => {
      m.share.setIntent = (intent: string) => {
        m.share.intent = intent;
      };
      m.share.getIntent = () => m.share.intent as string | undefined;
    },
  };
}

function intentDetector(): TethrModule<Dat, Ctx> {
  return {
    name: "intent-detector",
    requires: ["intent"],
    runtime: (s, m, t) => {
      const setIntent = m.share.setIntent as ((intent: string) => void) | undefined;
      if (!setIntent) return;

      const intent = s.dat.prmt.includes("refund") ? "refund-support" : "general";
      setIntent(intent);
      s.ctx.intent = intent;
      t.respond(`Intent detected: ${intent}`, 0.8);
    },
  };
}

function responder(): TethrModule<Dat, Ctx> {
  return {
    name: "responder",
    requires: ["intent"],
    runtime: (_s, m, t) => {
      const getIntent = m.share.getIntent as (() => string | undefined) | undefined;
      const intent = getIntent?.() ?? "unknown";
      t.setOutput(`Handled prompt with intent: ${intent}`);
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
