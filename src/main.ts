import { Hono } from "@hono/hono";
import { DiscordHono } from "@dudasaus/discord-hono";

const app = new Hono();
const discordApp = new DiscordHono(app);

app.get("/", (c) => {
  return c.text("Hello world");
});

Deno.serve(app.fetch);
