import { EventEmitter } from "node:events";
import { open, stat } from "node:fs/promises";

export class LogTail extends EventEmitter {
  constructor(path, { intervalMs = 500 } = {}) {
    super();
    this.path = path;
    this.intervalMs = intervalMs;
    this.position = 0;
    this.remainder = "";
  }

  async start({ fromEnd = true } = {}) {
    if (!this.path || this.timer) return;
    try {
      this.position = fromEnd ? (await stat(this.path)).size : 0;
    } catch {
      this.position = 0;
    }
    this.timer = setInterval(() => this.poll().catch(error => this.emit("error", error)), this.intervalMs);
    this.timer.unref?.();
  }

  async poll() {
    const info = await stat(this.path);
    if (info.size < this.position) this.position = 0;
    if (info.size === this.position) return;
    const length = info.size - this.position;
    const buffer = Buffer.alloc(length);
    const handle = await open(this.path, "r");
    try {
      await handle.read(buffer, 0, length, this.position);
    } finally {
      await handle.close();
    }
    this.position = info.size;
    const lines = (this.remainder + buffer.toString("utf8")).split(/\r?\n/);
    this.remainder = lines.pop() ?? "";
    for (const line of lines) this.emit("line", line);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
