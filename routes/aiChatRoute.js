import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { handleAIChat } from '../controllers/ai/aiChatController.js';

export const aiChatRoute = express.Router();

// AI Chat endpoint
aiChatRoute.post('/chat', authMiddleware, handleAIChat);

export default aiChatRoute;

