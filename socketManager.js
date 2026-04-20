import { Server } from "socket.io";
import { resolveUser } from "./middleware/auth.js"; // Needs an adapter for websocket

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // Matches existing permissive configuration
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    // Expect clients to authenticate via a query param or auth payload.
    // For simplicity, they can pass ?userId=XXX or similar, 
    // or we can use a custom event to register exactly who they are.
    
    // Modern socket.io uses auth payload: socket.handshake.auth
    const authPayload = socket.handshake.auth || {};
    // Fallback to query
    const token = authPayload.token || socket.handshake.query.token;

    // We can use a simple custom event for binding the user, 
    // since some users might not use Discord tokens on the backend but standard IDs
    socket.on("authenticate", (userId) => {
      if (typeof userId === "string" && userId.length > 0) {
        socket.join(userId);
        socket.emit("authenticated", { success: true });
      }
    });

    socket.on("disconnect", () => {
      // Cleanup happens automatically for socket rooms
    });
  });

  return io;
}

export function getIO() {
  return io;
}
