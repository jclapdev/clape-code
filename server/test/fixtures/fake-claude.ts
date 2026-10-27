// Stands in for `claude auth …` in tests, printing what Claude Code 2.1.304 printed on John's computer.
// FAKE_CLAUDE_LOG gets one line per call: args | cwd | CLAUDE_CONFIG_DIR.
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const dir = process.env.CLAUDE_CONFIG_DIR ?? process.env.FAKE_CLAUDE_STATE ?? "";
if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, `${args.join(" ")}|${process.cwd()}|${process.env.CLAUDE_CONFIG_DIR ?? ""}\n`);
const loggedOutFlag = join(dir || process.cwd(), "fake-logged-out");

if (args[0] === "auth" && args[1] === "status") {
  const common = { analyticsDisabled: false, projectsDirectory: join(dir, "projects"), configDirectory: dir };
  if (basename(process.cwd()) === "bedrock-proj" || process.env.FAKE_CLAUDE_BEDROCK) {
    console.log(JSON.stringify({ loggedIn: true, authMethod: "third_party", apiProvider: "bedrock", ...common, analyticsDisabled: true }, null, 2));
    process.exit(0);
  }
  if (existsSync(loggedOutFlag)) {
    console.log(JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty", ...common }, null, 2));
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", ...common, email: "me@example.com", orgId: "org-secret-id", orgName: "Acme", subscriptionType: "pro", accessToken: "sk-ant-oat01-secret-token" },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (args[0] === "auth" && args[1] === "login") {
  if (process.env.FAKE_CLAUDE_SILENT) await new Promise(() => {});
  process.stdout.write("Opening browser to sign in…\n");
  process.stdout.write("If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=abc\n");
  process.stdout.write("Paste code here if prompted > ");
  const reader = Bun.stdin.stream().getReader();
  let buf = "";
  let code = "";
  // Like Claude Code 2.1.304: a code without "#" is rejected on the spot (on stderr, as is "Login failed") and it
  // keeps waiting for another.
  for (;;) {
    while (!buf.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) process.exit(1);
      buf += new TextDecoder().decode(value);
    }
    code = buf.slice(0, buf.indexOf("\n")).trim();
    buf = buf.slice(buf.indexOf("\n") + 1);
    if (code.includes("#")) break;
    process.stderr.write("Invalid code. Please make sure the full code was copied.\n");
  }
  if (code === "good#code") {
    if (existsSync(loggedOutFlag)) rmSync(loggedOutFlag);
    console.log("Login successful.");
    process.exit(0);
  }
  console.error("Login failed: Request failed with status code 400");
  process.exit(1);
}

if (args[0] === "auth" && args[1] === "logout") {
  writeFileSync(loggedOutFlag, "");
  console.log("Successfully logged out from your Anthropic account.");
  process.exit(0);
}

// `claude mcp remove|add-json <name> … --scope user|project`: edits FAKE_CLAUDE_JSON (user) or ./.mcp.json (project).
if (args[0] === "mcp" && (args[1] === "remove" || args[1] === "add-json")) {
  const scope = args[args.indexOf("--scope") + 1];
  const file = scope === "project" ? join(process.cwd(), ".mcp.json") : process.env.FAKE_CLAUDE_JSON!;
  const o = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  o.mcpServers ??= {};
  const name = args[2];
  if (args[1] === "remove") {
    if (!o.mcpServers[name]) {
      console.error(`No ${scope}-scoped MCP server found with name: ${name}`);
      process.exit(1);
    }
    delete o.mcpServers[name];
    console.log(`Removed MCP server ${name} from ${scope} config`);
  } else {
    if (o.mcpServers[name]) {
      console.error(`MCP server ${name} already exists in ${scope} config`);
      process.exit(1);
    }
    o.mcpServers[name] = JSON.parse(args[3]);
    console.log(`Added stdio MCP server ${name} to ${scope} config`);
  }
  writeFileSync(file, JSON.stringify(o, null, 2));
  process.exit(0);
}

console.error(`fake claude: unknown command ${args.join(" ")}`);
process.exit(2);
