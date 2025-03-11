import "@std/dotenv/load";
import { Hono } from "@hono/hono";
import { DiscordHono } from "@dudasaus/discord-hono";

const app = new Hono();
const _discordApp = new DiscordHono(app);

app.get("/", (c) => {
  return c.text("Hello world");
});

Deno.serve(app.fetch);
