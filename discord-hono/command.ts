export type CommandHandler = () => Promise<string> | string;

export interface CommandInterface {
  name: string;
  description: string;
  handler: CommandHandler;
}

export class Command implements CommandInterface {
  constructor(
    readonly name: string,
    readonly description: string,
    readonly handler: CommandHandler,
  ) {}

  static create(...args: ConstructorParameters<typeof Command>): Command {
    return new Command(...args);
  }
}
