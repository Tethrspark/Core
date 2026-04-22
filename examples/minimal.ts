import { createTethr, type TethrModule } from "../src/index.js";

type Dat = {
  prmt: string;
  sentAt?: string;
};

type Ctx = {
  tags?: string[];
};

const taggingModule: TethrModule<Dat, Ctx> = {
  name: "tagging",
  setup: (state) => {
    state.ctx.tags = [];
  },
  runtime: (state, tools) => {
    if (state.dat.prmt.includes("?")) {
      state.ctx.tags?.push("question");
    }
    tools.respond(`You asked: ${state.dat.prmt}`);
  },
};

const assistant = createTethr<Dat, Ctx>().use(taggingModule);

const result = await assistant.prompt("How are you?", {
  sentAt: new Date().toISOString(),
});

console.log("output:", result.output);
console.log("state:", result.state);
