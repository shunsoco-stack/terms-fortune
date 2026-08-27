import assert from "node:assert/strict";
import test from "node:test";
import { scanText } from "../scripts/secret-scan.mjs";

// Construct fixtures at runtime so test source contains no credential literals.
const knownForms = [
  {
    rule: "private-key",
    material: () => ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
  },
  {
    rule: "aws-access-key",
    material: () => ["AK", "IA"].join("") + "A".repeat(16),
  },
  {
    rule: "github-token",
    material: () => ["gh", "p_"].join("") + "A".repeat(36),
  },
  {
    rule: "github-fine-grained-token",
    material: () => ["github", "_pat_"].join("") + "B".repeat(60),
  },
  {
    rule: "stripe-secret",
    material: () => ["sk", "_live_"].join("") + "C".repeat(24),
  },
  {
    rule: "openai-secret",
    material: () => ["sk", "-proj-"].join("") + "D".repeat(48),
  },
  {
    rule: "anthropic-secret",
    material: () => ["sk", "-ant-api03-"].join("") + "E".repeat(48),
  },
  {
    rule: "slack-token",
    material: () => ["xox", "b-"].join("") + "1234567890-".repeat(3),
  },
  {
    rule: "google-api-key",
    material: () => ["AI", "za"].join("") + "F".repeat(35),
  },
  {
    rule: "npm-token",
    material: () => ["np", "m_"].join("") + "G".repeat(36),
  },
  {
    rule: "vercel-token",
    material: () => ["vc", "p_"].join("") + "H".repeat(36),
  },
  {
    rule: "sendgrid-secret",
    material: () => ["S", "G."].join("") + "J".repeat(22) + "." + "K".repeat(43),
  },
  {
    rule: "signed-token",
    material: () =>
      ["ey", "J"].join("") + "L".repeat(18) + "." +
      ["ey", "J"].join("") + "M".repeat(18) + "." + "N".repeat(24),
  },
];

for (const form of knownForms) {
  test("detects " + form.rule + " without returning its value", () => {
    const material = form.material();
    const findings = scanText("ordinary first line\n" + material, "src/fixture.ts");
    assert.ok(findings.some((finding) => finding.rule === form.rule));
    assert.equal(findings[0].file, "src/fixture.ts");
    assert.equal(findings[0].line, 2);
    assert.ok(!JSON.stringify(findings).includes(material));
  });
}

test("detects quoted, typed, JSON and unquoted credentials", () => {
  const field = ["api", "Key"].join("");
  const value = ["sTr0ng", "Value42"].join("");
  const cases = [
    "const " + field + ' = "' + value + '";',
    "const " + field + ': string = "' + value + '";',
    '{"' + field + '": "' + value + '"}',
    ["SERVICE", "TOKEN"].join("_") + "=" + value,
    ["SERVICE", "SECRET"].join("_") + ": " + value,
    "export " + ["API", "KEY"].join("_") + "=" + value + " # configuration",
    ["SERVICE", "TOKEN"].join("_") + "=" + ["a", "9"].join(""),
  ];
  for (const content of cases) {
    assert.ok(
      scanText(content).some((finding) => finding.rule === "credential-assignment"),
    );
  }
});

test("counts CRLF lines and reports each line once per rule", () => {
  const material = knownForms[2].material();
  const findings = scanText("header\r\n" + material + " " + material + "\r\n");
  assert.deepEqual(findings, [{ file: "<text>", line: 2, rule: "github-token" }]);
});

test("recognizes obvious placeholders and environment references", () => {
  const field = ["API", "KEY"].join("_");
  const placeholders = [
    "<your-token>",
    "$" + "{APP_TOKEN}",
    "$" + "{{ secrets.APP_TOKEN }}",
    "$APP_TOKEN",
    "process.env.APP_TOKEN",
    "import.meta.env.APP_TOKEN",
    "YOUR_API_KEY",
    "replace_me",
    "change-me",
    "example-token",
    "not-a-real-secret",
    "placeholder",
    "xxxxxxxx",
    "********",
    "null",
  ];
  for (const value of placeholders) {
    assert.deepEqual(scanText(field + '="' + value + '"'), []);
  }
});

test("does not treat normal settings, identifiers or public URLs as secrets", () => {
  const content = [
    'const title = "利用規約占い";',
    'const result = "大吉";',
    'const token = process.env.APP_TOKEN;',
    'const apiKey = getConfiguration();',
    "https://github.com/shunsoco-stack/terms-fortune",
    'const password = "";',
  ].join("\n");
  assert.deepEqual(scanText(content), []);
});

test("finds passwords embedded in connection URLs and allows placeholders", () => {
  const material = ["un", "published42"].join("");
  const url = "postgresql://app:" + material + "@example.invalid/database";
  const findings = scanText(url);
  assert.ok(findings.some((finding) => finding.rule === "credential-in-url"));
  assert.ok(!JSON.stringify(findings).includes(material));
  assert.deepEqual(
    scanText("postgresql://app:<password>@example.invalid/database"),
    [],
  );
});

test("scans independently on repeated calls", () => {
  const material = knownForms[2].material();
  assert.deepEqual(scanText(material), scanText(material));
  assert.deepEqual(scanText("ordinary text"), []);
});
