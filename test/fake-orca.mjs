// A stand-in for the Orca CLI. Logs every call to $FAKE_ORCA_DIR/calls.jsonl and answers from
// $FAKE_ORCA_DIR/responses.json, keyed by the first words of the command ("orchestration check", "terminal send").
// A response may be a list: each call takes the next one, and the last one repeats.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.FAKE_ORCA_DIR;
const args = process.argv.slice(2).filter((a) => a !== "--json");
appendFileSync(join(dir, "calls.jsonl"), `${JSON.stringify(args)}\n`);

const file = join(dir, "responses.json");
const responses = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const key = [args.slice(0, 2).join(" "), args[0]].find((k) => k in responses);
let answer = { ok: true, result: {} };
if (key) {
  const value = responses[key];
  if (Array.isArray(value)) {
    answer = value.length > 1 ? value.shift() : value[0];
    writeFileSync(file, JSON.stringify(responses));
  } else answer = value;
}
process.stdout.write(typeof answer === "string" ? answer : JSON.stringify(answer));
