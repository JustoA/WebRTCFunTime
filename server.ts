import type { ServerWebSocket } from "bun";
import {v4 as uuidv4, type UUIDTypes} from "uuid";

const clientsByUUID = new Map<string, ServerWebSocket<unknown>>();
const clientsByWebSocket = new Map<ServerWebSocket<unknown>, string>();

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
    open(ws: ServerWebSocket<undefined>) {
      // i hate typescript
      const id = uuidv4();
      clientsByUUID.set(id,ws);
      clientsByWebSocket.set(ws,id);
      console.log("New peer just joined. " + id)
      console.log("Clients: "+ Array.from(clientsByUUID.keys()))
      
      // give client its own id as well as the current list of connected people 
      ws.send(JSON.stringify({ type: "init", id , peers: "guh"}));

      // let everyone know about the new peer
      for (const [otherId, client] of clientsByUUID){
        if (otherId !== id){
          console.log("Notifying " + otherId + " about new peer "+  id)
          client.send(JSON.stringify({type: "new-peer", id}))
        }
      }
    },

    message(ws, message) {
      const data = JSON.parse(message.toString());
      console.log(data)
      if (data.to && clientsByUUID.has(data.to)){
          clientsByUUID.get(data.to)?.send(JSON.stringify(data));
      }
    },

    close(ws) {
      let uuidToDelete = clientsByWebSocket.get(ws);
      if(uuidToDelete){
        console.log("Dropped peer " + uuidToDelete)
        clientsByWebSocket.delete(ws)
        clientsByUUID.delete(uuidToDelete);
      } 
    }
  }
});