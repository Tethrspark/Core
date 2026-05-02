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
  setup: (s) => {
    s.ctx.tags = [];
  },
  runtime: (s, _m, t) => {
    if (s.dat.prmt.includes("?")) {
      s.ctx.tags?.push("question");
    }
    t.respond(`You asked: ${s.dat.prmt}`);
  },
};

const assistant = createTethr<Dat, Ctx>().use(taggingModule);

const result = await assistant.prompt("How are you?", {
  sentAt: new Date().toISOString(),
});

console.log("output:", result.output);
console.log("state:", result.state);
