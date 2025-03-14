import "@std/dotenv/load";
import { Hono } from "@hono/hono";
import { Command, DiscordHono } from "@dudasaus/discord-hono";
import { parseArgs } from "@std/cli/parse-args";

const flags = parseArgs(Deno.args, {
  boolean: ["register"],
  string: ["message"],
});

const app = new Hono();
const discordApp = new DiscordHono();

discordApp
  .command(
    Command.create(
      "status",
      "Check the status of the Discord bot.",
      () => "ok",
    ),
  );

app.get("/", (c) => {
  return c.json({ status: "ok" });
});

app.post("/message", async (c) => {
  try {
    const data = await c.req.json();
    if (data.content && typeof data.content === "string") {
      await discordApp.message(data.content);
      return c.text("ok");
    }
    c.status(400);
    return c.text("Content not found");
  } catch (_e) {
    c.status(400);
    return c.text("Invalid JSON");
  }
});

if (flags.register) {
  const ok = await discordApp.registerCommands();
  Deno.exit(ok ? 0 : 1);
} else if (flags.message) {
  const response = await discordApp.message(flags.message);
  console.log(response);
} else {
  discordApp.listen(app);
  Deno.serve(app.fetch);
  console.log("App start");
}
