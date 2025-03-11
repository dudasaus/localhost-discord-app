import "@std/dotenv/load";
import { Hono } from "@hono/hono";
import { DiscordHono } from "@dudasaus/discord-hono";
import { parseArgs } from "@std/cli/parse-args";

const flags = parseArgs(Deno.args, {
  boolean: ["register"],
  string: ["message"],
});

const app = new Hono();
const discordApp = new DiscordHono(app);

discordApp
  .command("status", () => {
    return "ok";
  })
  .register();

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
  const response = await fetch(
    `https://discord.com/api/v10/applications/${
      Deno.env.get("DISCORD_APP_ID")
    }/commands`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bot ${Deno.env.get("DISCORD_BOT_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "status",
        description: "Check the status of the discord bot",
      }),
    },
  );
  console.log(response.status, await response.json());
} else if (flags.message) {
  const response = await discordApp.message(flags.message);
  console.log(response);
} else {
  Deno.serve(app.fetch);
  console.log("App start");
}
