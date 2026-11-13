import { DUSK, nextAt } from "./time";
import { emit, schedule } from "./world";
import type { Handler, World } from "./world";

/**
 * Molly (ADR-0012). In M3 she only recognises the turn of day and night and
 * lets everyone feel it; village recognition, naming and house concepts come in M4.
 */
export class Molly {
  readonly handlers: ReadonlyMap<string, Handler>;

  constructor(
    private readonly world: World,
    private readonly onSignal: (name: string) => void,
  ) {
    this.handlers = new Map<string, Handler>([
      ["molly.dusk", () => this.signal("dusk", DUSK)],
      ["molly.dawn", () => this.signal("dawn", 0)],
    ]);
  }

  start(): void {
    const t = this.world.time;
    schedule(this.world, nextAt(t, DUSK), { handler: "molly.dusk" });
    schedule(this.world, nextAt(t, 0), { handler: "molly.dawn" });
  }

  private signal(name: string, fraction: number): void {
    emit(this.world, "molly", { kind: "signal", name });
    this.onSignal(name);
    schedule(this.world, nextAt(this.world.time, fraction), { handler: `molly.${name}` });
  }
}
