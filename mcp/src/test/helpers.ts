import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/** Isolate OAuth file storage under a temp directory (Linux-style XDG). */
export function withTempXdgConfig(): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tymio-mcp-test-"));
  const prev = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = root;
  return {
    root,
    cleanup: () => {
      if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prev;
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

/**
 * Returns a free TCP port on loopback (bind port 0, read port, close — port is free for the test server).
 */
export function reserveEphemeralPort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}
