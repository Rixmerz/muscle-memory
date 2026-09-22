## ADDED Requirements

### Requirement: A tool invocation SHALL reduce to a stable low-cardinality signature

`toolSignature(toolName, toolInput)` SHALL return a string of the form
`<tool>:<discriminator>`, lowercase, where the discriminator is derived from
the fields that determine *what kind of action* this is, never from the
specific values it acted on. The same kind of action SHALL produce the same
signature across sessions, machines and repositories.

#### Scenario: Two runs of the same command share a signature

- **WHEN** `toolSignature("Bash", {command: "pnpm test"})` and `toolSignature("Bash", {command: "pnpm test -- --watch=false"})` are called
- **THEN** both return `"bash:pnpm-test"`

#### Scenario: Different commands do not collide

- **WHEN** `toolSignature("Bash", {command: "pnpm test"})` and `toolSignature("Bash", {command: "pnpm lint"})` are called
- **THEN** the two results differ

#### Scenario: File tools signature on extension, not path

- **WHEN** `toolSignature("Edit", {file_path: "/a/b/Foo.ts"})` and `toolSignature("Edit", {file_path: "/x/y/Bar.ts"})` are called
- **THEN** both return `"edit:ts"`

#### Scenario: A file with no extension is still stable

- **WHEN** `toolSignature("Read", {file_path: "/etc/hosts"})` is called
- **THEN** the result is a stable string containing no path segment

### Requirement: A signature SHALL never carry secrets, paths or free text

The returned signature SHALL contain no absolute path, no URL, no value from a
flag of the form `--key=value`, no token-shaped substring (20+ characters of
base64, hex, or `sk-`/`ghp_`-prefixed), and no content of an `Edit` or `Write`
payload. Characters outside `[a-z0-9:._-]` SHALL NOT appear in the output.

This is a privacy boundary, not a formatting preference: the NDJSON file is the
input to pattern mining and may be read by a subagent.

#### Scenario: A command bearing a token is stripped

- **WHEN** `toolSignature("Bash", {command: "curl -H 'Authorization: Bearer sk-abc123def456ghi789jkl' https://api.example.com"})` is called
- **THEN** the result contains neither `"sk-"` nor `"example.com"`

#### Scenario: Flag values are dropped

- **WHEN** `toolSignature("Bash", {command: "psql --password=hunter2 -c 'select 1'"})` is called
- **THEN** the result does not contain `"hunter2"`

#### Scenario: The output character set is constrained

- **WHEN** any signature is produced from any input
- **THEN** it matches `^[a-z0-9:._-]+$`

### Requirement: An argument hash SHALL accompany the signature for determinism measurement

`argHash(toolInput)` SHALL return the first 12 hex characters of the SHA-256 of
a canonical JSON serialisation of the tool input, with object keys sorted. It
SHALL be reproducible for equal inputs and SHALL NOT be reversible to the
input. Determinism of a pattern is later computed as the share of occurrences
sharing the modal argument hash, so the hash SHALL distinguish inputs that the
signature deliberately collapses.

#### Scenario: Equal inputs hash equally regardless of key order

- **WHEN** `argHash({a: 1, b: 2})` and `argHash({b: 2, a: 1})` are called
- **THEN** both return the same 12-character string

#### Scenario: Inputs collapsed by the signature remain distinguishable by hash

- **GIVEN** `toolSignature` returns `"edit:ts"` for two different files
- **WHEN** `argHash` is called on each tool input
- **THEN** the two hashes differ
