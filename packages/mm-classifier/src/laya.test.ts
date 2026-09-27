import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Definition } from "./definition.js";
import { config, DEFAULT_URL, health, predict, ServerUnreachable } from "./laya.js";
import { DEAD_URL, startStub, type Stub } from "./stub-server.fixture.js";

const DEF: Definition = {
  name: "x",
  description: "",
  questions: { r: { type: "choice", instructions: "Risk?", criteria: { safe: "", destructive: "" } } },
  decide: { question: "r", fallback: "continue" },
  model: "multilingual",
};

let stub: Stub;
beforeAll(async () => {
  stub = await startStub();
});
afterAll(() => stub.close());

describe("config", () => {
  it("defaults to a loopback URL, CPU and the english checkpoint", () => {
    const cfg = config({});
    expect(cfg).toMatchObject({ url: DEFAULT_URL, device: "cpu", models: "english" });
    expect(cfg.python).toMatch(/muscle-memory\/laya\/bin\/python$/);
  });

  it("reads overrides from the environment", () => {
    expect(config({ MM_LAYA_URL: "http://127.0.0.1:1", MM_LAYA_DEVICE: "cuda" })).toMatchObject({
      url: "http://127.0.0.1:1",
      device: "cuda",
    });
  });
});

describe("predict", () => {
  it("sends state, questions and model, and returns answers and routed model", async () => {
    const result = await predict(stub.url, DEF, { command: "rm -rf x" });
    expect(result.answers.r).toMatchObject({ choice: "destructive" });
    expect(result.model).toBe("english");
    expect(stub.requests.at(-1)).toEqual({ state: { command: "rm -rf x" }, questions: DEF.questions, model: "multilingual" });
  });

  it("raises ServerUnreachable when nothing listens", async () => {
    await expect(predict(DEAD_URL, DEF, {})).rejects.toBeInstanceOf(ServerUnreachable);
  });
});

describe("health", () => {
  it("is true for a live server and false for a dead one", async () => {
    expect(await health(stub.url)).toBe(true);
    expect(await health(DEAD_URL)).toBe(false);
  });
});
