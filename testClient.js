import { io } from "socket.io-client";

// Replace with your backend URL & port
const socket = io("http://localhost:3000", {
  transports: ["websocket"], // ensure websocket
});

// Check connection
socket.on("connect", () => {
  console.log("✅ Connected to Socket.IO server with id:", socket.id);

  // Emit a test event
  socket.emit("driverLocation", {
    driverId: "123",
    lat: 10.123,
    lng: 76.543,
  });
});

// Listen for location update
socket.on("locationUpdate", (data) => {
  console.log("📍 Location update received:", data);
});

// Handle disconnect
socket.on("disconnect", () => {
  console.log("❌ Disconnected from server");
});
