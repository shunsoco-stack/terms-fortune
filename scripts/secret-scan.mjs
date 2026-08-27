import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A local-only, dependency-free source-tree scan.
 * It never sends file contents anywhere or logs matched credential values.
 * This is a defense-in-depth check, not an exhaustive security audit.
 */

/** @typedef {{ file: string, line: number, rule: string }} Finding */

const rules = [
  {
    name: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/g },
  {
    name: "github-fine-grained-token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{40,255}\b/g,
  },
  {
    name: "stripe-secret",
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,255}\b/g,
  },
  {
    name: "openai-secret",
    pattern: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,255}\b/g,
  },
  {
    name: "anthropic-secret",
    pattern: /\bsk-ant-(?:api\d{2}-)?[A-Za-z0-9_-]{32,255}\b/g,
  },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,255}\b/g },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { name: "vercel-token", pattern: /\bvcp_[A-Za-z0-9_-]{20,255}\b/g },
  {
    name: "sendgrid-secret",
    pattern: /\bSG\.[A-Za-z0-9_-]{20,255}\.[A-Za-z0-9_-]{32,255}\b/g,
  },
  {
    name: "signed-token",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    name: "credential-in-url",
    pattern: /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^/\s:@]+:([^/\s@]+)@/g,
    valueGroup: 1,
  },
];

/** @param {string} name */
function isSensitiveKey(name) {
  return /(?:apikey|accesskey|accesstoken|authtoken|authorization|clientsecret|secretkey|privatekey|password|passwd|pwd|token|secret)$/i.test(
    name.replace(/[._-]/g, ""),
  );
}

/** @param {string} value */
function isPlaceholder(value) {
  return /^(?:<[^>]+>|\$\{[^}]+\}|\$\{\{[\s\S]+\}\}|\$[A-Z_][A-Z0-9_]*|process\.env(?:\.[A-Z_][A-Z0-9_]*|\[[^\]]+\])|import\.meta\.env\.[A-Z_][A-Z0-9_]*|undefined|null|true|false|your[-_ ]?(?:api[-_ ]?)?(?:key|token|secret|password)(?:[-_ ].*)?|replace[-_ ]?me|change[-_ ]?me|example(?:[-_ ](?:key|token|secret|password))?|placeholder|not[-_ ]a[-_ ]real[-_ ](?:key|token|secret|password)|x{4,}|\*{4,}|\.{3,})$/i.test(
    value.trim(),
  );
}

/**
 * Pure helper: callers receive metadata only, never matched values.
 * @param {string} content
 * @param {string} [filename]
 * @returns {Finding[]}
 */
export function scanText(content, filename = "<text>") {
  /** @type {Finding[]} */
  const findings = [];
  const seen = new Set();

  /** @param {number} index @param {string} rule */
  function add(index, rule) {
    const line = content.slice(0, index).split(/\r\n|\r|\n/).length;
    const key = line + ":" + rule;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ file: filename, line, rule });
  }

  for (const rule of rules) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of content.matchAll(pattern)) {
      const value = rule.valueGroup ? match[rule.valueGroup] : match[0];
      if (!isPlaceholder(value)) add(match.index, rule.name);
    }
  }

  const quotedAssignment =
    /(?:^|[^\w.-])["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?(?:[ \t]*:[ \t]*(?:string|unknown))?[ \t]*(?:=|:)[ \t]*(["'\x60])([^\r\n]*?)\2/gm;
  for (const match of content.matchAll(quotedAssignment)) {
    const value = match[3];
    if (
      isSensitiveKey(match[1]) &&
      value.trim().length > 0 &&
      !isPlaceholder(value)
    ) {
      const keyOffset = match[0].indexOf(match[1]);
      add(match.index + keyOffset, "credential-assignment");
    }
  }

  // Unquoted environment/YAML assignments, not arbitrary JS expressions.
  const bareAssignment =
    /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*(?:=|:)[ \t]*([^"'\x60\s#;,{}()[\]]+)[ \t]*(?:#.*)?$/gm;
  for (const match of content.matchAll(bareAssignment)) {
    const value = match[2];
    if (
      isSensitiveKey(match[1]) &&
      value.length > 0 &&
      !isPlaceholder(value)
    ) {
      add(match.index, "credential-assignment");
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

const skippedDirectories = new Set([
  ".git",
  "node_modules",
  ".next",
  ".vercel",
  ".cache",
  ".npm-cache",
  ".tools",
  "coverage",
  "dist",
  "out",
  "test-results",
  "playwright-report",
  ".playwright-cli",
]);

const binaryExtensions = new Set([
  ".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".webp",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".pdf", ".zip", ".gz", ".br", ".tar", ".7z",
  ".mp3", ".mp4", ".mov", ".wav", ".webm",
  ".exe", ".dll", ".node", ".wasm", ".bin",
]);

/** @param {Buffer} buffer */
function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff && buffer.length % 2 === 0) {
    return Buffer.from(buffer.subarray(2)).swap16().toString("utf16le");
  }
  if (buffer.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

async function main() {
  // Derive the root from this script, not cwd or a user-supplied path.
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const unreadable = [];
  let checked = 0;
  let skipped = 0;

  /** @param {string} directory */
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      unreadable.push(relative(projectRoot, directory) || ".");
      return;
    }
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const filename = relative(projectRoot, absolute).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) {
        skipped += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (skippedDirectories.has(entry.name)) skipped += 1;
        else await walk(absolute);
        continue;
      }
      if (
        !entry.isFile() ||
        filename === "scripts/secret-scan.mjs" ||
        binaryExtensions.has(extname(entry.name).toLowerCase()) ||
        /\.(?:log|tsbuildinfo)$/i.test(entry.name)
      ) {
        skipped += 1;
        continue;
      }
      try {
        const content = decodeText(await readFile(absolute));
        if (content === null) {
          skipped += 1;
          continue;
        }
        checked += 1;
        findings.push(...scanText(content, filename));
      } catch {
        unreadable.push(filename);
      }
    }
  }

  await walk(projectRoot);
  for (const finding of findings) {
    console.error(
      finding.rule + " at " + JSON.stringify(finding.file) + ":" + finding.line,
    );
  }
  for (const filename of unreadable) {
    console.error("Could not scan " + JSON.stringify(filename));
  }
  if (findings.length || unreadable.length) {
    console.error(
      "Secret scan failed: " + findings.length + " suspect match(es), " +
      unreadable.length + " unreadable entry/entries. No matched values printed.",
    );
    process.exitCode = unreadable.length ? 2 : 1;
  } else {
    console.log(
      "Secret scan passed: " + checked + " text files checked; " +
      skipped + " generated, binary, scanner-definition or linked entries skipped.",
    );
  }
}

const invocation = process.argv[1] ? resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
const isDirectInvocation = process.platform === "win32"
  ? invocation.toLowerCase() === modulePath.toLowerCase()
  : invocation === modulePath;

if (isDirectInvocation) {
  main().catch(() => {
    console.error("Secret scan could not complete. Check repository permissions.");
    process.exitCode = 2;
  });
}
