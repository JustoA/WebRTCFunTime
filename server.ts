import type { ServerWebSocket } from "bun";

const clients = new Set<ServerWebSocket<unknown>>();

Bun.serve({
  port: 3000,

  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("Upgrade failed", { status: 500 });
    }

    if (url.pathname === "/") {
      return new Response(Bun.file("./public/index.html"));
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      clients.add(ws);
    },

    message(ws, message) {
      for (const client of clients) {
        if (client !== ws) {
          client.send(message);
        }
      }
    },

    close(ws) {
      clients.delete(ws);
    }
  }
});