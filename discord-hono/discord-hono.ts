import type { Context, Hono } from "@hono/hono";
import {
  type APIApplicationCommandInteraction,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import { verifySignature } from "./verify.ts";

type Handler = () => Promise<string> | string;

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function envOrThrow(key: string): string {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Environment variable ${key} not found`);
  }
  return value;
}

export class DiscordHono<T> {
  private handlersRegistered = false;
  private readonly commandHandlers = new Map<string, Handler>();
  private discordPublicKey: string;
  private discordAppId: string;
  private discordApiUrl: string;
  constructor(
    readonly app: Hono,
  ) {
    this.discordPublicKey = envOrThrow("DISCORD_PUBLIC_KEY");
    this.discordAppId = envOrThrow("DISCORD_APP_ID");
    this.discordApiUrl = Deno.env.get("DISCORD_API_URL") ??
      "https://discord.com/api/v10";
  }

  command(name: string, handler: Handler): this {
    if (this.handlersRegistered) {
      throw new Error("Handlers already registered.");
    }
    this.commandHandlers.set(name, handler);
    return this;
  }

  private handleCommand(
    c: Context,
    body: APIApplicationCommandInteraction,
  ) {
    const commandName = body.data.name;

    const handler = this.commandHandlers.get(commandName);

    if (!handler) {
      return c.body("Command handler not found", 404);
    }

    const handlerResult = handler();
    if (typeof handlerResult === "string") {
      return c.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: handlerResult,
        },
      });
    }

    // Start the late update.
    const lateUpdate = async () => {
      const content = await handler();
      const baseUrl = this.discordApiUrl;
      const updateRequest = new Request(
        `${baseUrl}/webhooks/${this.discordAppId}/${body.token}/messages/@original`,
        {
          method: "PATCH",
          body: JSON.stringify({ content }),
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      const retryTimers = [1, 5, 10];
      for (const attempt of [...retryTimers, 0]) {
        const res = await fetch(updateRequest);
        if (res.ok) {
          break;
        }
        if (attempt > 0) {
          await wait(attempt * 1000);
        }
      }
    };
    c.executionCtx.waitUntil(lateUpdate());

    return c.json({
      type: InteractionResponseType.DeferredChannelMessageWithSource,
    });
  }

  private pong(c: Context) {
    return c.json({
      type: InteractionResponseType.Pong,
    });
  }

  register() {
    this.handlersRegistered = true;
    this.app.post("/interactions", async (c) => {
      const rawBody = await c.req.text();

      // Verify.
      const signature = c.req.header("x-signature-ed25519");
      if (!signature) {
        console.error("Missing signature");
        return c.body("Signature not found", 401);
      }
      const timestamp = c.req.header("x-signature-timestamp");
      if (!timestamp) {
        console.error("Missing timestamp");
        return c.body("Timestamp not found", 401);
      }
      const publicKey = this.discordPublicKey;
      if (
        !verifySignature({
          publicKey,
          signature,
          timestamp,
          rawBody,
        })
      ) {
        console.error("Failed to verify", {
          publicKey,
          signature,
        });
        return c.body("Unable to verify", 401);
      }

      const body = JSON.parse(rawBody);
      const { type } = body;

      switch (type) {
        case InteractionType.Ping:
          return this.pong(c);
        case InteractionType.ApplicationCommand:
          return this.handleCommand(c, body);
        default:
          return;
      }
    });
  }
}
