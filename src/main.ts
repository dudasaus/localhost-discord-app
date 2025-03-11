import "@std/dotenv/load";
import { Hono } from "@hono/hono";
import { DiscordHono } from "@dudasaus/discord-hono";

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

Deno.serve(app.fetch);
