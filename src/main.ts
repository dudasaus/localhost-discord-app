import "@std/dotenv/load";
import { Hono } from "@hono/hono";
import { DiscordHono } from "@dudasaus/discord-hono";
import { parseArgs } from "@std/cli/parse-args";

const flags = parseArgs(Deno.args, {
  boolean: ["register"],
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
} else {
  Deno.serve(app.fetch);
  console.log("App start");
}
