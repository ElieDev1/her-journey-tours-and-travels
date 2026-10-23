#!/usr/bin/env node
// Create (or reset the password of) an administrator account in D1.
//
//   npm run admin:create -- --local            # local development database
//   npm run admin:create -- --remote           # production database
//
// Options: --email, --name, --role (owner|manager|staff). The password is
// always read interactively (or from ADMIN_PASSWORD for automation) so it
// never appears in shell history. Only the PBKDF2 hash is sent to D1.
import { webcrypto as crypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "owner" },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
  },
});

if (values.local === values.remote) {
  console.error("Choose exactly one target: --local or --remote");
  process.exit(1);
}
if (!["owner", "manager", "staff"].includes(values.role)) {
  console.error("--role must be owner, manager or staff");
  process.exit(1);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const email = (values.email ?? (await ask("Admin email: "))).toLowerCase();
const name = values.name ?? (await ask("Full name: "));
let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await ask("Password (min 12 chars, letters and numbers): ", { hidden: true });
  const confirm = await ask("Confirm password: ", { hidden: true });
  if (password !== confirm) {
    console.error("Passwords do not match");
    process.exit(1);
  }
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid email");
if (!name) throw new Error("Name is required");
if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
  console.error("Password must be at least 12 characters and include letters and numbers");
  process.exit(1);
}

// Must match src/worker/lib/crypto.ts
const ITERATIONS = 100_000;
const toHex = (buf) => Buffer.from(buf).toString("hex");
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
const hash = `pbkdf2_sha256$${ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `INSERT INTO admin_users (email, name, password_hash, role, is_active)
VALUES (${q(email)}, ${q(name)}, ${q(hash)}, ${q(values.role)}, 1)
ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash,
  role = excluded.role, is_active = 1, failed_login_count = 0, locked_until = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`;

const dir = mkdtempSync(join(tmpdir(), "hj-admin-"));
const file = join(dir, "admin.sql");
writeFileSync(file, sql, { mode: 0o600 });
try {
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", values.remote ? "--remote" : "--local", "--file", file], {
    stdio: "inherit",
  });
  console.log(`\nAdministrator ${email} (${values.role}) is ready. Sign in at /admin/login`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
