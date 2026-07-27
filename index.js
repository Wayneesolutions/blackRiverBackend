import { app } from "./app.js";
import { connectDB } from "./config/mongoConnection.js";
import 'dotenv/config'
import { config } from "./config/config.js";
import http from "http";
import { initSocket } from "./services/socketIo.js";

const server = http.createServer(app);

// initialize socket.io
initSocket(server);

const PORT = config.PORT;

connectDB();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server connected on http://0.0.0.0:${PORT}`);
  console.log(`✅ Server accessible on http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO server available at http://0.0.0.0:${PORT}`);
  console.log(`🔌 Socket.IO endpoint: http://0.0.0.0:${PORT}/socket.io/`);
  console.log(`📱 Mobile devices can connect using: http://<YOUR_IP>:${PORT}`);
  console.log(`   Replace <YOUR_IP> with your machine's IP (e.g., 192.168.31.161)`);
});
