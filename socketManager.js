import { Server } from "socket.io";
import { authenticateAuthorizationHeader } from "./middleware/auth.js";

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    try {
      const initData = socket.handshake.auth?.initData;
      const devUserId = socket.handshake.auth?.devUserId;
      const authHeader = initData
        ? `tma ${initData}`
        : devUserId
          ? `dev ${devUserId}`
          : "";
      const auth = await authenticateAuthorizationHeader(authHeader);
      socket.data.auth = auth;
      socket.join(auth.accountId);
      next();
    } catch (err) {
      next(new Error(err.message || "Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.emit("authenticated", {
      success: true,
      accountId: socket.data.auth.accountId,
      provider: socket.data.auth.provider,
    });
  });

  return io;
}

export function getIO() {
  return io;
}
