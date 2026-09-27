/**
 * A stand-in for `laya-serve`: same two routes, deterministic answers. A
 * command containing "rm" is `destructive` at 0.9, anything else `safe` at
 * 0.9, so tests can assert routing without a model.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface StubRequest {
  state: unknown;
  questions: Record<string, { type: string }>;
  model?: string;
}

export interface Stub {
  url: string;
  requests: StubRequest[];
  close: () => Promise<void>;
}

function answerFor(state: unknown, questions: StubRequest["questions"]): Record<string, unknown> {
  const text = JSON.stringify(state ?? "");
  const answers: Record<string, unknown> = {};
  for (const [key, q] of Object.entries(questions)) {
    if (q.type === "noul") answers[key] = { type: "noul", noul: text.includes("rm") ? 0.9 : 0.1 };
    else if (q.type === "score") answers[key] = { type: "score", score: 2, answer_confidence: 0.8 };
    else answers[key] = { type: "choice", choice: text.includes("rm") ? "destructive" : "safe", answer_confidence: 0.9 };
  }
  return answers;
}

export async function startStub(): Promise<Stub> {
  const requests: StubRequest[] = [];
  const server: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const parsed = JSON.parse(body) as StubRequest;
      requests.push(parsed);
      const payload = { answers: answerFor(parsed.state, parsed.questions), routing: { model: "english" } };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(payload));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((done) => server.close(() => done())),
  };
}

/** A URL nothing listens on. */
export const DEAD_URL = "http://127.0.0.1:9";
