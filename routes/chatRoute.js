import express from 'express';
import { FileUpload } from '../middleware/upload.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { driverAuth } from '../middleware/authDriver.js';
import {
  getTripChatMessages,
  getOrderChatMessages,
  sendChatMessage,
  sendOrderChatMessage,
  markMessagesAsRead,
  markOrderMessagesAsRead,
  getUnreadMessageCount,
  getOrderUnreadMessageCount,
  getChatMessageFileSignedUrl,
  getDriverChatMessages,
  sendDriverChatMessage,
  markDriverMessagesAsRead,
  getDriverUnreadMessageCount,
  getDriversLastMessages
} from '../controllers/chat/chatController.js';

export const chatRoute = express.Router();

// ===== TRIP CHAT ROUTES (Legacy) =====
// Get chat messages for a trip (both dispatcher and driver)
chatRoute.get(
  '/trip/:tripId/messages',
  authMiddleware,
  getTripChatMessages
);

// Send chat message (with optional file upload)
chatRoute.post(
  '/trip/:tripId/message',
  authMiddleware,
  FileUpload.single('file'),
  sendChatMessage
);

// Mark messages as read
chatRoute.post(
  '/trip/:tripId/mark-read',
  authMiddleware,
  markMessagesAsRead
);

// Get unread message count
chatRoute.get(
  '/trip/:tripId/unread-count',
  authMiddleware,
  getUnreadMessageCount
);

// ===== ORDER CHAT ROUTES (New) =====
// Get chat messages for an order
chatRoute.get(
  '/order/:orderId/messages',
  authMiddleware,
  getOrderChatMessages
);

// Send chat message for an order (with optional file upload)
chatRoute.post(
  '/order/:orderId/message',
  authMiddleware,
  FileUpload.single('file'),
  sendOrderChatMessage
);

// Mark order messages as read
chatRoute.post(
  '/order/:orderId/mark-read',
  authMiddleware,
  markOrderMessagesAsRead
);

// Get unread message count for an order
chatRoute.get(
  '/order/:orderId/unread-count',
  authMiddleware,
  getOrderUnreadMessageCount
);

// Get signed URL for chat message file
chatRoute.get(
  '/message/:messageId/file-signed-url',
  authMiddleware,
  getChatMessageFileSignedUrl
);

// Driver-specific routes (using driverAuth)
export const driverChatRoute = express.Router();

driverChatRoute.get(
  '/trip/:tripId/messages',
  driverAuth,
  getTripChatMessages
);

driverChatRoute.post(
  '/trip/:tripId/message',
  driverAuth,
  FileUpload.single('file'),
  sendChatMessage
);

driverChatRoute.post(
  '/trip/:tripId/mark-read',
  driverAuth,
  markMessagesAsRead
);

driverChatRoute.get(
  '/trip/:tripId/unread-count',
  driverAuth,
  getUnreadMessageCount
);

// Get signed URL for chat message file (driver)
driverChatRoute.get(
  '/message/:messageId/file-signed-url',
  driverAuth,
  getChatMessageFileSignedUrl
);

// Driver order chat routes
driverChatRoute.get(
  '/order/:orderId/messages',
  driverAuth,
  getOrderChatMessages
);

driverChatRoute.post(
  '/order/:orderId/message',
  driverAuth,
  FileUpload.single('file'),
  sendOrderChatMessage
);

driverChatRoute.post(
  '/order/:orderId/mark-read',
  driverAuth,
  markOrderMessagesAsRead
);

driverChatRoute.get(
  '/order/:orderId/unread-count',
  driverAuth,
  getOrderUnreadMessageCount
);

// ===== DRIVER CHAT ROUTES (Global Chat) - For Mobile App =====
// Get chat messages for a driver (driver can access their own chat)
driverChatRoute.get(
  '/driver/:driverId/messages',
  driverAuth,
  getDriverChatMessages
);

// Send a chat message to dispatcher (driver can send to their own chat)
driverChatRoute.post(
  '/driver/:driverId/message',
  driverAuth,
  FileUpload.single('file'),
  sendDriverChatMessage
);

// Mark driver messages as read
driverChatRoute.post(
  '/driver/:driverId/mark-read',
  driverAuth,
  markDriverMessagesAsRead
);

// Get unread message count for a driver
driverChatRoute.get(
  '/driver/:driverId/unread-count',
  driverAuth,
  getDriverUnreadMessageCount
);

// ===== DRIVER CHAT ROUTES (Global Chat) =====
// Get chat messages for a driver
chatRoute.get(
  '/driver/:driverId/messages',
  authMiddleware,
  getDriverChatMessages
);

// Send a chat message to a driver (with optional file upload)
chatRoute.post(
  '/driver/:driverId/message',
  authMiddleware,
  FileUpload.single('file'),
  sendDriverChatMessage
);

// Mark driver messages as read
chatRoute.post(
  '/driver/:driverId/mark-read',
  authMiddleware,
  markDriverMessagesAsRead
);

// Get unread message count for a driver
chatRoute.get(
  '/driver/:driverId/unread-count',
  authMiddleware,
  getDriverUnreadMessageCount
);

// Get last message + unread count for all drivers (dispatcher sidebar)
chatRoute.get(
  '/drivers/last-messages',
  authMiddleware,
  getDriversLastMessages
);

