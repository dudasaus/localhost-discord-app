import type { Context, Hono } from "@hono/hono";
import { envOrThrow } from "@dudasaus/env-or-throw";
import {
  type APIApplicationCommandInteraction,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";

type Handler = () => Promise<string> | string;

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export class DiscordHono {
  private handlersRegistered = false;
  private readonly commandHandlers = new Map<string, Handler>();
  private discordPublicKey: string;
  private discordAppId: string;
  private discordApiUrl: string;
  private discordBotToken: string;
  private discordChannelId: string;
  constructor(
    readonly app: Hono,
  ) {
    this.discordPublicKey = envOrThrow("DISCORD_PUBLIC_KEY");
    this.discordAppId = envOrThrow("DISCORD_APP_ID");
    this.discordApiUrl = Deno.env.get("DISCORD_API_URL") ??
      "https://discord.com/api/v10";
    this.discordBotToken = envOrThrow("DISCORD_BOT_TOKEN");
    this.discordChannelId = envOrThrow("DISCORD_CHANNEL_ID");
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
      const verified = await verifyKey(
        rawBody,
        signature,
        timestamp,
        publicKey,
      );
      if (
        !verified
      ) {
        console.error("Failed to verify", {
          publicKey,
          signature,
          timestamp,
          rawBody,
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

  async message(content: string, channelId?: string) {
    channelId = channelId ?? this.discordChannelId;
    const response = await fetch(
      `${this.discordApiUrl}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bot ${this.discordBotToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
        }),
      },
    );
    return await response.text();
  }
}
