import { describe, expect, it } from "vitest";
import { argHash, toolSignature } from "./signature.js";

const CHARSET_RE = /^[a-z0-9:._-]+$/;

describe("toolSignature", () => {
  // Scenario: Two runs of the same command share a signature
  it("collapses flag variants of the same command to the same signature", () => {
    const a = toolSignature("Bash", { command: "pnpm test" });
    const b = toolSignature("Bash", { command: "pnpm test -- --watch=false" });
    expect(a).toBe("bash:pnpm-test");
    expect(b).toBe("bash:pnpm-test");
  });

  // Scenario: Different commands do not collide
  it("gives different commands different signatures", () => {
    const a = toolSignature("Bash", { command: "pnpm test" });
    const b = toolSignature("Bash", { command: "pnpm lint" });
    expect(a).not.toBe(b);
  });

  // Scenario: File tools signature on extension, not path
  it("signs file tools on extension, ignoring the path", () => {
    const a = toolSignature("Edit", { file_path: "/a/b/Foo.ts" });
    const b = toolSignature("Edit", { file_path: "/x/y/Bar.ts" });
    expect(a).toBe("edit:ts");
    expect(b).toBe("edit:ts");
  });

  // Scenario: A file with no extension is still stable
  it("gives an extension-less file a stable, path-free discriminator", () => {
    const result = toolSignature("Read", { file_path: "/etc/hosts" });
    expect(result).toBe("read:noext");
    expect(result).not.toContain("/");
    expect(result).not.toContain("etc");
    expect(result).not.toContain("hosts");
  });

  // Scenario: A command bearing a token is stripped
  it("strips a bearer token and the URL it was sent to", () => {
    const result = toolSignature("Bash", {
      command:
        "curl -H 'Authorization: Bearer sk-abc123def456ghi789jkl' https://api.example.com",
    });
    expect(result).not.toContain("sk-");
    expect(result).not.toContain("example.com");
    expect(CHARSET_RE.test(result)).toBe(true);
  });

  // Scenario: Flag values are dropped
  it("drops a --key=value flag's value", () => {
    const result = toolSignature("Bash", {
      command: "psql --password=hunter2 -c 'select 1'",
    });
    expect(result).not.toContain("hunter2");
  });

  // Scenario: The output character set is constrained
  it("only ever emits the allowed character set", () => {
    const samples = [
      toolSignature("Bash", { command: "pnpm test" }),
      toolSignature("Bash", {
        command: "curl -H 'Authorization: Bearer sk-abc123def456ghi789jkl' https://api.example.com",
      }),
      toolSignature("Bash", { command: "psql --password=hunter2 -c 'select 1'" }),
      toolSignature("Edit", { file_path: "/a/b/Foo.ts" }),
      toolSignature("Read", { file_path: "/etc/hosts" }),
      toolSignature("Write", { file_path: "/Weird Name (v2).TSX" }),
      toolSignature(undefined, {}),
      toolSignature("SomeToolNobodyRecognises", { anything: true }),
      toolSignature("Bash", {}),
    ];
    for (const sig of samples) {
      expect(sig).toMatch(CHARSET_RE);
    }
  });

  // The character-set filter as a last-resort net: a case the semantic
  // scrubbing does not target (a stray symbol inside a kept token, or an
  // uppercase-with-punctuation extension) must still come out clean.
  it("strips a disallowed character that semantic scrubbing does not target", () => {
    const bash = toolSignature("Bash", { command: "echo hello@world" });
    expect(bash).not.toContain("@");
    expect(bash).toMatch(CHARSET_RE);

    const file = toolSignature("Edit", { file_path: "/a/b/weird.t!s?x" });
    expect(file).not.toContain("!");
    expect(file).not.toContain("?");
    expect(file).toMatch(CHARSET_RE);
  });

  // Absent/unrecognised toolName
  it("collapses an absent tool name to unknown:unknown", () => {
    expect(toolSignature(undefined, { command: "pnpm test" })).toBe("unknown:unknown");
  });

  it("collapses an unrecognised tool name to unknown:unknown", () => {
    expect(toolSignature("SomeToolNobodyRecognises", { command: "pnpm test" })).toBe(
      "unknown:unknown",
    );
  });

  // Additional privacy boundary: Edit/Write payload content never leaks
  it("never leaks an Edit payload's content into the signature", () => {
    const result = toolSignature("Edit", {
      file_path: "/a/b/Foo.ts",
      old_string: "const secretApiKey = 'sk-abc123def456ghi789jklmno'",
      new_string: "const secretApiKey = process.env.API_KEY",
    });
    expect(result).toBe("edit:ts");
    expect(result).not.toContain("secret");
  });
});

describe("argHash", () => {
  // Scenario: Equal inputs hash equally regardless of key order
  it("hashes equal inputs the same way regardless of key order", () => {
    const a = argHash({ a: 1, b: 2 });
    const b = argHash({ b: 2, a: 1 });
    expect(a).toBe(b);
    expect(a).toHaveLength(12);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  // Scenario: Inputs collapsed by the signature remain distinguishable by hash
  it("distinguishes two inputs the signature collapses to the same discriminator", () => {
    const sigA = toolSignature("Edit", { file_path: "/a/b/Foo.ts" });
    const sigB = toolSignature("Edit", { file_path: "/x/y/Bar.ts" });
    expect(sigA).toBe(sigB);

    const hashA = argHash({ file_path: "/a/b/Foo.ts" });
    const hashB = argHash({ file_path: "/x/y/Bar.ts" });
    expect(hashA).not.toBe(hashB);
  });

  it("does not throw on a non-serialisable input and still returns a 12-char string", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => argHash(circular)).not.toThrow();
    expect(argHash(circular)).toHaveLength(12);

    expect(() => argHash({ big: 1n })).not.toThrow();
    expect(argHash({ big: 1n })).toHaveLength(12);
  });
});
