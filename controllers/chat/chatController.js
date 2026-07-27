import { ChatMessage } from "../../models/chat/chatMessageModel.js";
import Trip from "../../models/tripModel.js";
import Order from "../../models/orderModel.js";
import { User } from "../../models/driver/userModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import mongoose from "mongoose";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../../config/awsConfig.js";
import { sendPushToDriver } from "../../services/pushNotificationService.js";

// Get chat messages for a specific trip/order (supports both for backward compatibility)
export const getTripChatMessages = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const userId = req.user._id;

    // Validate tripId (can be orderId or tripId)
    if (!tripId || !mongoose.Types.ObjectId.isValid(tripId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trip/order ID"
      });
    }

    let order = null;
    let trip = null;
    let hasAccess = false;

    // Try to find as order first (since we're using orders now)
    order = await Order.findById(tripId).lean();
    
    if (order) {
      // Check if user has access to this order
      // User can access if: driver, coDriver, dispatcher/admin of same company, or superadmin
      const isDriver = order.driver?.toString() === userId.toString();
      const isCoDriver = order.coDriver?.toString() === userId.toString();
      const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(req.user.role?.toLowerCase());
      
      // Check company access for dispatchers
      if (isDispatcher && !isSuperadmin && companyId) {
        const orderCompanyId = order.company?.toString() || order.company;
        hasAccess = orderCompanyId === companyId;
      } else if (isSuperadmin) {
        hasAccess = true;
      } else {
        // Driver or co-driver always has access to their orders
        hasAccess = isDriver || isCoDriver;
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have access to this order."
        });
      }

      // Build filter for order messages
      const filter = { 
        $or: [
          { orderId: tripId },
          { tripId: tripId } // Also check tripId for backward compatibility
        ]
      };
      if (!isSuperadmin && companyId) {
        filter.company = companyId;
      }

      // Get combined filter (company + trial data filter)
      let baseFilter = filter;
      if (!isSuperadmin && companyId) {
        const companyFilter = { company: companyId };
        const combinedFilter = await getCombinedFilter(req.user, companyFilter);
        if (combinedFilter) {
          if (combinedFilter.$or) {
            baseFilter = {
              $and: [
                filter,
                combinedFilter
              ]
            };
          } else {
            baseFilter = { ...filter, ...combinedFilter };
          }
        }
      }

      // Get messages with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const messages = await ChatMessage.find(baseFilter)
        .populate("senderId", "name email")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      // Reverse to show oldest first (for chat UI)
      const reversedMessages = messages.reverse();

      // Get total count
      const totalMessages = await ChatMessage.countDocuments(baseFilter);

      return res.json({
        success: true,
        data: {
          messages: reversedMessages,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(totalMessages / parseInt(limit)),
            total: totalMessages,
            limit: parseInt(limit)
          }
        },
        message: "Chat messages fetched successfully"
      });
    }

    // Fallback: Try to find as trip (for backward compatibility)
    trip = await Trip.findById(tripId).lean();
    if (trip) {
      // Check company access
      if (!isSuperadmin) {
        if (!companyId) {
          return res.status(403).json({
            success: false,
            message: "No company assigned. Please complete company settings."
          });
        }

        // Verify trip belongs to user's company
        const tripCompanyId = trip.company?.toString() || trip.company;
        if (tripCompanyId !== companyId) {
          return res.status(403).json({
            success: false,
            message: "Access denied. This trip does not belong to your company."
          });
        }
      }

      // Build filter for trip messages
      const filter = { tripId };
      if (!isSuperadmin && companyId) {
        filter.company = companyId;
      }

      // Get combined filter (company + trial data filter)
      let baseFilter = filter;
      if (!isSuperadmin && companyId) {
        const companyFilter = { company: companyId };
        const combinedFilter = await getCombinedFilter(req.user, companyFilter);
        if (combinedFilter) {
          if (combinedFilter.$or) {
            baseFilter = {
              $and: [
                filter,
                combinedFilter
              ]
            };
          } else {
            baseFilter = { ...filter, ...combinedFilter };
          }
        }
      }

      // Get messages with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const messages = await ChatMessage.find(baseFilter)
        .populate("senderId", "name email")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      // Reverse to show oldest first (for chat UI)
      const reversedMessages = messages.reverse();

      // Get total count
      const totalMessages = await ChatMessage.countDocuments(baseFilter);

      return res.json({
        success: true,
        data: {
          messages: reversedMessages,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(totalMessages / parseInt(limit)),
            total: totalMessages,
            limit: parseInt(limit)
          }
        },
        message: "Chat messages fetched successfully"
      });
    }

    // Neither order nor trip found
    return res.status(404).json({
      success: false,
      message: "Order/Trip not found"
    });
  } catch (error) {
    console.error("Get Chat Messages Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Send a chat message (via HTTP API - for file uploads, supports both orderId and tripId)
export const sendChatMessage = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { message } = req.body;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const userId = req.user._id;

    // Validate tripId (can be orderId or tripId)
    if (!tripId || !mongoose.Types.ObjectId.isValid(tripId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trip/order ID"
      });
    }

    let order = null;
    let trip = null;
    let hasAccess = false;

    // Try to find as order first (since we're using orders now)
    order = await Order.findById(tripId).lean();
    
    if (order) {
      // Check if user has access to this order
      // User can access if: driver, coDriver, dispatcher/admin of same company, or superadmin
      const isDriver = order.driver?.toString() === userId.toString();
      const isCoDriver = order.coDriver?.toString() === userId.toString();
      const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(req.user.role?.toLowerCase());
      
      // Check company access for dispatchers
      if (isDispatcher && !isSuperadmin && companyId) {
        const orderCompanyId = order.company?.toString() || order.company;
        hasAccess = orderCompanyId === companyId;
      } else if (isSuperadmin) {
        hasAccess = true;
      } else {
        // Driver or co-driver always has access to their orders
        hasAccess = isDriver || isCoDriver;
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have access to this order."
        });
      }

      // Determine sender type
      const userRole = req.user.role?.toLowerCase() || "";
      let senderType = "dispatcher";
      if (userRole.includes("driver")) {
        senderType = "driver";
      } else if (userRole === "superadmin" || userRole.includes("admin")) {
        senderType = "dispatcher";
      }

      // Get sender name
      const senderName = req.user.name || req.user.email || "Unknown";

      // Handle file upload if present
      let fileUrl = null;
      let fileName = null;
      let fileType = null;
      let fileSize = null;

      if (req.file) {
        // File uploaded via multer
        fileUrl = req.file.location || req.file.path || null;
        fileName = req.file.originalname || null;
        fileSize = req.file.size || null;

        // Determine file type
        const mimeType = req.file.mimetype || "";
        if (mimeType.startsWith("image/")) {
          fileType = "image";
        } else if (mimeType === "application/pdf") {
          fileType = "pdf";
        } else if (mimeType.includes("document") || mimeType.includes("msword") || mimeType.includes("spreadsheet")) {
          fileType = "document";
        } else {
          fileType = "other";
        }
      }

      // Create chat message with orderId
      const chatMessage = new ChatMessage({
        orderId: tripId,
        senderId: req.user._id || req.user.id,
        senderType,
        senderName,
        message: message || "",
        fileUrl,
        fileName,
        fileType,
        fileSize,
        company: companyId || order.company
      });

      await chatMessage.save();

      // Populate sender info
      const populatedMessage = await ChatMessage.findById(chatMessage._id)
        .populate("senderId", "name email")
        .lean();

      // 🤖 AI Document Auto-Send: Process message for document requests (non-blocking)
      if (message && senderType === 'driver') {
        try {
          const { processChatMessageForDocuments } = await import('../../services/aiChatDocumentService.js');
          // Ensure companyId is always a string
          let finalCompanyId = companyId || trip.company;
          if (finalCompanyId && typeof finalCompanyId === 'object' && finalCompanyId.toString) {
            finalCompanyId = finalCompanyId.toString();
          }
          processChatMessageForDocuments(
            {
              message,
              senderType
            },
            {
              orderIdOrTripId: tripId,
              companyId: finalCompanyId,
              userId: req.user._id || req.user.id
            },
            null // No Socket.io instance in REST API
          ).catch(aiError => {
            console.error('❌ AI document processing error (non-blocking):', aiError);
          });
        } catch (aiError) {
          console.error('❌ AI document processing error (non-blocking):', aiError);
        }
      }

      return res.status(201).json({
        success: true,
        data: populatedMessage,
        message: "Message sent successfully"
      });
    }

    // Fallback: Try to find as trip (for backward compatibility)
    trip = await Trip.findById(tripId).lean();
    if (trip) {
      // Check company access
      if (!isSuperadmin) {
        if (!companyId) {
          return res.status(403).json({
            success: false,
            message: "No company assigned. Please complete company settings."
          });
        }

        const tripCompanyId = trip.company?.toString() || trip.company;
        if (tripCompanyId !== companyId) {
          return res.status(403).json({
            success: false,
            message: "Access denied. This trip does not belong to your company."
          });
        }
      }

      // Determine sender type
      const userRole = req.user.role?.toLowerCase() || "";
      let senderType = "dispatcher";
      if (userRole.includes("driver")) {
        senderType = "driver";
      } else if (userRole === "superadmin" || userRole.includes("admin")) {
        senderType = "dispatcher";
      }

      // Get sender name
      const senderName = req.user.name || req.user.email || "Unknown";

      // Handle file upload if present
      let fileUrl = null;
      let fileName = null;
      let fileType = null;
      let fileSize = null;

      if (req.file) {
        // File uploaded via multer
        fileUrl = req.file.location || req.file.path || null;
        fileName = req.file.originalname || null;
        fileSize = req.file.size || null;

        // Determine file type
        const mimeType = req.file.mimetype || "";
        if (mimeType.startsWith("image/")) {
          fileType = "image";
        } else if (mimeType === "application/pdf") {
          fileType = "pdf";
        } else if (mimeType.includes("document") || mimeType.includes("msword") || mimeType.includes("spreadsheet")) {
          fileType = "document";
        } else {
          fileType = "other";
        }
      }

      // Create chat message with tripId
      const chatMessage = new ChatMessage({
        tripId: tripId,
        senderId: req.user._id || req.user.id,
        senderType,
        senderName,
        message: message || "",
        fileUrl,
        fileName,
        fileType,
        fileSize,
        company: companyId || trip.company
      });

      await chatMessage.save();

      // Populate sender info
      const populatedMessage = await ChatMessage.findById(chatMessage._id)
        .populate("senderId", "name email")
        .lean();

      return res.status(201).json({
        success: true,
        data: populatedMessage,
        message: "Message sent successfully"
      });
    }

    // Neither order nor trip found
    return res.status(404).json({
      success: false,
      message: "Order/Trip not found"
    });
  } catch (error) {
    console.error("Send Chat Message Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mark messages as read (supports both orderId and tripId)
export const markMessagesAsRead = async (req, res) => {
  try {
    const { tripId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const userId = req.user._id;

    // Validate tripId (can be orderId or tripId)
    if (!tripId || !mongoose.Types.ObjectId.isValid(tripId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trip/order ID"
      });
    }

    let order = null;
    let trip = null;
    let hasAccess = false;

    // Try to find as order first (since we're using orders now)
    order = await Order.findById(tripId).lean();
    
    if (order) {
      // Check if user has access to this order
      const isDriver = order.driver?.toString() === userId.toString();
      const isCoDriver = order.coDriver?.toString() === userId.toString();
      const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(req.user.role?.toLowerCase());
      
      if (isDispatcher && !isSuperadmin && companyId) {
        const orderCompanyId = order.company?.toString() || order.company;
        hasAccess = orderCompanyId === companyId;
      } else if (isSuperadmin) {
        hasAccess = true;
      } else {
        hasAccess = isDriver || isCoDriver;
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have access to this order."
        });
      }

      // Find unread messages for this order (check both orderId and tripId for backward compatibility)
      const unreadMessages = await ChatMessage.find({
        $or: [
          { orderId: tripId },
          { tripId: tripId }
        ],
        senderId: { $ne: userId },
        "readBy.userId": { $ne: userId }
      });

      // Mark as read
      for (const msg of unreadMessages) {
        const alreadyRead = msg.readBy.some(
          (read) => read.userId.toString() === userId.toString()
        );
        if (!alreadyRead) {
          msg.readBy.push({
            userId: userId,
            readAt: new Date()
          });
          await msg.save();
        }
      }

      return res.json({
        success: true,
        message: "Messages marked as read",
        count: unreadMessages.length
      });
    }

    // Fallback: Try to find as trip (for backward compatibility)
    trip = await Trip.findById(tripId).lean();
    if (trip) {
      // Check company access
      if (!isSuperadmin) {
        if (!companyId) {
          return res.status(403).json({
            success: false,
            message: "No company assigned. Please complete company settings."
          });
        }

        const tripCompanyId = trip.company?.toString() || trip.company;
        if (tripCompanyId !== companyId) {
          return res.status(403).json({
            success: false,
            message: "Access denied. This trip does not belong to your company."
          });
        }
      }

      const userId = req.user._id || req.user.id;

      // Find unread messages for this trip
      const unreadMessages = await ChatMessage.find({
        tripId,
        senderId: { $ne: userId },
        "readBy.userId": { $ne: userId }
      });

      // Mark as read
      for (const msg of unreadMessages) {
        const alreadyRead = msg.readBy.some(
          (read) => read.userId.toString() === userId.toString()
        );

        if (!alreadyRead) {
          msg.readBy.push({
            userId,
            readAt: new Date()
          });
          await msg.save();
        }
      }

      return res.json({
        success: true,
        message: "Messages marked as read",
        count: unreadMessages.length
      });
    }

    // Neither order nor trip found
    return res.status(404).json({
      success: false,
      message: "Order/Trip not found"
    });
  } catch (error) {
    console.error("Mark Messages as Read Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get unread message count for a trip/order (supports both)
export const getUnreadMessageCount = async (req, res) => {
  try {
    const { tripId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const userId = req.user._id;

    // Validate tripId (can be orderId or tripId)
    if (!tripId || !mongoose.Types.ObjectId.isValid(tripId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trip/order ID"
      });
    }

    let order = null;
    let trip = null;
    let hasAccess = false;

    // Try to find as order first (since we're using orders now)
    order = await Order.findById(tripId).lean();
    
    if (order) {
      // Check if user has access to this order
      const isDriver = order.driver?.toString() === userId.toString();
      const isCoDriver = order.coDriver?.toString() === userId.toString();
      const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(req.user.role?.toLowerCase());
      
      if (isDispatcher && !isSuperadmin && companyId) {
        const orderCompanyId = order.company?.toString() || order.company;
        hasAccess = orderCompanyId === companyId;
      } else if (isSuperadmin) {
        hasAccess = true;
      } else {
        hasAccess = isDriver || isCoDriver;
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have access to this order."
        });
      }

      // Count unread messages for this order (check both orderId and tripId for backward compatibility)
      const unreadCount = await ChatMessage.countDocuments({
        $or: [
          { orderId: tripId },
          { tripId: tripId }
        ],
        senderId: { $ne: userId },
        "readBy.userId": { $ne: userId }
      });

      return res.json({
        success: true,
        data: {
          unreadCount
        },
        message: "Unread message count fetched successfully"
      });
    }

    // Fallback: Try to find as trip (for backward compatibility)
    trip = await Trip.findById(tripId).lean();
    if (trip) {
      // Check company access
      if (!isSuperadmin) {
        if (!companyId) {
          return res.status(403).json({
            success: false,
            message: "No company assigned. Please complete company settings."
          });
        }

        const tripCompanyId = trip.company?.toString() || trip.company;
        if (tripCompanyId !== companyId) {
          return res.status(403).json({
            success: false,
            message: "Access denied. This trip does not belong to your company."
          });
        }
      }

      const userId = req.user._id || req.user.id;

      // Count unread messages for this trip
      const unreadCount = await ChatMessage.countDocuments({
        tripId,
        senderId: { $ne: userId },
        "readBy.userId": { $ne: userId }
      });

      return res.json({
        success: true,
        data: {
          unreadCount
        },
        message: "Unread message count fetched successfully"
      });
    }

    // Neither order nor trip found
    return res.status(404).json({
      success: false,
      message: "Order/Trip not found"
    });
  } catch (error) {
    console.error("Get Unread Message Count Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get signed URL for chat message file
export const getChatMessageFileSignedUrl = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { disposition = 'inline' } = req.query; // 'inline' for viewing, 'attachment' for downloading
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    console.log('📎 Get chat message file signed URL:', {
      messageId,
      userId: req.user?._id || req.user?.id,
      userRole: req.user?.role,
      companyId,
      isSuperadmin
    });

    // Validate messageId
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID"
      });
    }

    // Find the chat message
    const message = await ChatMessage.findById(messageId).lean();
    if (!message) {
      console.error('❌ Chat message not found:', messageId);
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }

    console.log('📎 Chat message found:', {
      messageId: message._id,
      tripId: message.tripId,
      messageCompanyId: message.company?.toString() || message.company,
      hasFileUrl: !!message.fileUrl
    });

    // Check company access
    if (!isSuperadmin) {
      if (!companyId) {
        console.warn('⚠️ No company ID for user:', {
          userId: req.user?._id || req.user?.id,
          userRole: req.user?.role
        });
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const messageCompanyId = message.company?.toString() || message.company;
      if (messageCompanyId !== companyId) {
        console.error('❌ Company access denied:', {
          messageCompanyId,
          userCompanyId: companyId,
          userId: req.user?._id || req.user?.id
        });
        return res.status(403).json({
          success: false,
          message: "Access denied. This message does not belong to your company."
        });
      }
    }

    if (!message.fileUrl) {
      return res.status(400).json({
        success: false,
        message: "No file attached to this message"
      });
    }

    const fileUrl = message.fileUrl;
    console.log('📎 Original fileUrl from message:', fileUrl);
    
    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');
    console.log('📎 Is S3 URL?', isS3Url);

    if (isS3Url) {
      try {
        // Parse S3 URL to get bucket and key
        const cleanUrl = fileUrl.split('?')[0].split('#')[0];
        console.log('📎 Clean URL:', cleanUrl);
        
        let urlObj;
        try {
          urlObj = new URL(cleanUrl);
        } catch (urlError) {
          console.error('📎 ❌ Error parsing URL:', urlError.message);
          // Try adding protocol if missing
          const urlWithProtocol = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
          urlObj = new URL(urlWithProtocol);
          console.log('📎 Retried with protocol:', urlObj.href);
        }
        
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        console.log('📎 Initial parsing:', {
          hostname: urlObj.hostname,
          pathname: urlObj.pathname,
          bucketName,
          key: key.substring(0, 100)
        });

        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
          console.log('📎 Format: bucket.s3.region (virtual-hosted)', { bucketName, key: key.substring(0, 100) });
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
          console.log('📎 Format: s3.amazonaws.com/bucket/key (path-style)', { bucketName, key: key.substring(0, 100) });
        }

        // Additional cleanup
        if (key.includes('?')) {
          key = key.split('?')[0];
          console.log('📎 Removed ? from key');
        }
        if (key.includes('&')) {
          key = key.split('&')[0];
          console.log('📎 Removed & from key');
        }
        
        // Remove signature data that might be appended to filename
        const fileExtensionPattern = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|webp|txt|csv|zip|rar)/i;
        const extensionMatch = key.match(fileExtensionPattern);
        if (extensionMatch) {
          const extensionEndIndex = extensionMatch.index + extensionMatch[0].length;
          const baseKey = key.substring(0, extensionEndIndex);
          const afterExtension = key.substring(extensionEndIndex);
          
          if (afterExtension && /^[A-Za-z0-9+/=]{20,}/.test(afterExtension)) {
            key = baseKey;
            console.log('📎 Removed signature data from key, new key:', key.substring(0, 100));
          }
        }

        // Determine content type
        const getContentType = (url) => {
          const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
          const typeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'txt': 'text/plain',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
          };
          return typeMap[ext] || 'application/octet-stream';
        };

        const contentType = getContentType(fileUrl);
        const contentDisposition = disposition === 'attachment' 
          ? `attachment; filename="${encodeURIComponent(message.fileName || 'file')}"` 
          : 'inline';

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        console.log('📎 Final values before generating signed URL:', {
          bucketName,
          key: key.substring(0, 150), // Log first 150 chars of key
          keyLength: key.length,
          contentType,
          contentDisposition,
          fileName: message.fileName
        });

        // Validate bucket and key
        if (!bucketName) {
          throw new Error('Bucket name is empty');
        }
        if (!key) {
          throw new Error('Key is empty');
        }

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        console.log('📎 ✅ Signed URL generated successfully:', {
          urlLength: signedUrl.length,
          urlPreview: signedUrl.substring(0, 150),
          expiresIn: 3600
        });

        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('📎 ❌ Error generating signed URL for chat message file:', {
          error: s3Error.message,
          stack: s3Error.stack,
          fileUrl: fileUrl.substring(0, 100),
          fileName: message.fileName
        });
        
        // Return error instead of fallback
        return res.status(500).json({
          success: false,
          message: `Failed to generate signed URL: ${s3Error.message}`,
          error: s3Error.message
        });
      }
    } else {
      // Not an S3 URL (local storage), return as-is
      return res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0
      });
    }
  } catch (error) {
    console.error("Get Chat Message File Signed URL Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while getting the file URL."
    });
  }
};

// ===== ORDER CHAT FUNCTIONS (New) =====

// Get chat messages for a specific order
export const getOrderChatMessages = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Validate orderId
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    // Verify order exists and user has access
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Check company access
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const orderCompanyId = order.company?.toString() || order.company;
      if (orderCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This order does not belong to your company."
        });
      }
    }

    // Build filter - convert orderId to ObjectId
    const filter = { orderId: new mongoose.Types.ObjectId(orderId) };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    // Get combined filter (company + trial data filter)
    let baseFilter = filter;
    if (!isSuperadmin && companyId) {
      const companyFilter = { company: companyId };
      const combinedFilter = await getCombinedFilter(req.user, companyFilter);
      if (combinedFilter) {
        if (combinedFilter.$or) {
          baseFilter = {
            $and: [
              filter,
              combinedFilter
            ]
          };
        } else {
          baseFilter = { ...filter, ...combinedFilter };
        }
      }
    }

    // Get messages with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log("🔍 Fetching order messages with filter:", JSON.stringify(baseFilter));
    const messages = await ChatMessage.find(baseFilter)
      .populate("senderId", "name email")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    console.log("📨 Found order messages:", messages.length);

    // Reverse to show oldest first (for chat UI)
    const reversedMessages = messages.reverse();

    // Get total count
    const totalMessages = await ChatMessage.countDocuments(baseFilter);
    
    console.log("📊 Total order messages in DB:", totalMessages);

    res.json({
      success: true,
      data: {
        messages: reversedMessages,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(totalMessages / parseInt(limit)),
          total: totalMessages,
          limit: parseInt(limit)
        }
      },
      message: "Chat messages fetched successfully"
    });
  } catch (error) {
    console.error("Get Order Chat Messages Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Send a chat message for an order
export const sendOrderChatMessage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Validate orderId
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    // Verify order exists and user has access
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Check company access
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const orderCompanyId = order.company?.toString() || order.company;
      if (orderCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This order does not belong to your company."
        });
      }
    }

    // Determine sender type
    const userRole = req.user.role?.toLowerCase() || "";
    let senderType = "dispatcher";
    if (userRole.includes("driver")) {
      senderType = "driver";
    } else if (userRole === "superadmin" || userRole.includes("admin")) {
      senderType = "dispatcher";
    }

    // Get sender name
    const senderName = req.user.name || req.user.email || "Unknown";

    // Handle file upload if present
    let fileUrl = null;
    let fileName = null;
    let fileType = null;
    let fileSize = null;

    if (req.file) {
      fileUrl = req.file.location || req.file.path || null;
      fileName = req.file.originalname || null;
      fileSize = req.file.size || null;

      const mimeType = req.file.mimetype || "";
      if (mimeType.startsWith("image/")) {
        fileType = "image";
      } else if (mimeType === "application/pdf") {
        fileType = "pdf";
      } else if (mimeType.includes("document") || mimeType.includes("msword") || mimeType.includes("spreadsheet")) {
        fileType = "document";
      } else {
        fileType = "other";
      }
    }

    // Create chat message
    const chatMessage = new ChatMessage({
      orderId: new mongoose.Types.ObjectId(orderId),
      senderId: req.user._id || req.user.id,
      senderType,
      senderName,
      message: message || "",
      fileUrl,
      fileName,
      fileType,
      fileSize,
      company: companyId || order.company
    });

    console.log("💾 Saving chat message for order:", orderId);
    console.log("💾 Message data:", {
      orderId: chatMessage.orderId,
      senderId: chatMessage.senderId,
      senderName: chatMessage.senderName,
      message: chatMessage.message,
      company: chatMessage.company
    });
    await chatMessage.save();
    console.log("✅ Chat message saved with ID:", chatMessage._id);

    // Verify message was saved
    const verifyCount = await ChatMessage.countDocuments({
      orderId: new mongoose.Types.ObjectId(orderId)
    });
    console.log("✅ Total messages for this order now:", verifyCount);

    // Populate sender info
    const populatedMessage = await ChatMessage.findById(chatMessage._id)
      .populate("senderId", "name email")
      .lean();

    console.log("📤 Populated message:", populatedMessage);

    // 🤖 AI Document Auto-Send: Process message for document requests (non-blocking)
    if (message && senderType === 'driver') {
      try {
        const { processChatMessageForDocuments } = await import('../../services/aiChatDocumentService.js');
        // Ensure companyId is always a string
        let finalCompanyId = companyId || order.company;
        if (finalCompanyId && typeof finalCompanyId === 'object' && finalCompanyId.toString) {
          finalCompanyId = finalCompanyId.toString();
        }
        processChatMessageForDocuments(
          {
            message,
            senderType
          },
          {
            orderIdOrTripId: orderId,
            companyId: finalCompanyId,
            userId: req.user._id || req.user.id
          },
          null // No Socket.io instance in REST API
        ).catch(aiError => {
          console.error('❌ AI document processing error (non-blocking):', aiError);
        });
      } catch (aiError) {
        console.error('❌ AI document processing error (non-blocking):', aiError);
      }
    }

    res.status(201).json({
      success: true,
      data: populatedMessage,
      message: "Message sent successfully"
    });
  } catch (error) {
    console.error("Send Order Chat Message Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mark order messages as read
export const markOrderMessagesAsRead = async (req, res) => {
  try {
    const { orderId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Validate orderId
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    // Verify order exists and user has access
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Check company access
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const orderCompanyId = order.company?.toString() || order.company;
      if (orderCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This order does not belong to your company."
        });
      }
    }

    const userId = req.user._id || req.user.id;

    // Find unread messages for this order - convert orderId to ObjectId
    const unreadMessages = await ChatMessage.find({
      orderId: new mongoose.Types.ObjectId(orderId),
      senderId: { $ne: userId },
      "readBy.userId": { $ne: userId }
    });

    // Mark as read
    for (const msg of unreadMessages) {
      const alreadyRead = msg.readBy.some(
        (read) => read.userId.toString() === userId.toString()
      );

      if (!alreadyRead) {
        msg.readBy.push({
          userId,
          readAt: new Date()
        });
        await msg.save();
      }
    }

    res.json({
      success: true,
      message: "Messages marked as read",
      count: unreadMessages.length
    });
  } catch (error) {
    console.error("Mark Order Messages as Read Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get unread message count for an order
export const getOrderUnreadMessageCount = async (req, res) => {
  try {
    const { orderId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Validate orderId
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    // Verify order exists and user has access
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Check company access
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const orderCompanyId = order.company?.toString() || order.company;
      if (orderCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This order does not belong to your company."
        });
      }
    }

    const userId = req.user._id || req.user.id;

    // Count unread messages - convert orderId to ObjectId
    const unreadCount = await ChatMessage.countDocuments({
      orderId: new mongoose.Types.ObjectId(orderId),
      senderId: { $ne: userId },
      "readBy.userId": { $ne: userId }
    });

    res.json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error) {
    console.error("Get Order Unread Message Count Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ===== DRIVER CHAT FUNCTIONS =====

// Get chat messages for a driver (global chat between dispatcher and driver)
export const getDriverChatMessages = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const userId = req.user._id;

    // Validate driverId
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID"
      });
    }

    // Verify driver exists and user has access
    const driver = await User.findById(driverId).lean();
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Check company access
    if (!isSuperadmin) {
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const driverCompanyId = driver.company?.toString() || driver.company;
      if (driverCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This driver does not belong to your company."
        });
      }
    }

    // Build filter for driver messages
    const filter = { driverId: new mongoose.Types.ObjectId(driverId) };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    // Get combined filter (company + trial data filter)
    let baseFilter = filter;
    if (!isSuperadmin && companyId) {
      const companyFilter = { company: companyId };
      const combinedFilter = await getCombinedFilter(req.user, companyFilter);
      if (combinedFilter) {
        if (combinedFilter.$or) {
          baseFilter = {
            $and: [
              filter,
              combinedFilter
            ]
          };
        } else {
          baseFilter = { ...filter, ...combinedFilter };
        }
      }
    }

    // Get messages with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const messages = await ChatMessage.find(baseFilter)
      .populate("senderId", "name email")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Reverse to show oldest first (for chat UI)
    messages.reverse();

    // Get total count
    const total = await ChatMessage.countDocuments(baseFilter);

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error("Get Driver Chat Messages Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Send a chat message to a driver (via HTTP API - for file uploads)
export const sendDriverChatMessage = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { message } = req.body;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const userId = req.user._id;

    // Validate driverId
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID"
      });
    }

    // Verify driver exists and user has access
    const driver = await User.findById(driverId).lean();
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Check access: driver can send to their own chat, dispatcher/admin can send to any driver in their company
    const isDriver = req.user?.role === 'driver';
    const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(req.user?.role?.toLowerCase());
    
    if (isDriver) {
      // Driver can only send to their own chat
      if (userId.toString() !== driverId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only send messages to your own chat."
        });
      }
    } else if (!isSuperadmin) {
      // Dispatcher/admin must have company access
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const driverCompanyId = driver.company?.toString() || driver.company;
      if (driverCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This driver does not belong to your company."
        });
      }
    }

    // Determine sender type
    const userRole = req.user.role?.toLowerCase() || "";
    let senderType = "dispatcher";
    if (userRole.includes("driver")) {
      senderType = "driver";
    } else if (userRole === "superadmin" || userRole.includes("admin")) {
      senderType = "dispatcher";
    }

    // Get sender name
    const senderName = req.user.name || req.user.email || "Unknown";

    // Handle file upload if present
    let fileUrl = null;
    let fileName = null;
    let fileType = null;
    let fileSize = null;

    if (req.file) {
      // File uploaded via multer
      fileUrl = req.file.location || req.file.path || null;
      fileName = req.file.originalname || null;
      fileSize = req.file.size || null;

      // Determine file type
      const mimeType = req.file.mimetype || "";
      if (mimeType.startsWith("image/")) {
        fileType = "image";
      } else if (mimeType === "application/pdf") {
        fileType = "pdf";
      } else if (mimeType.includes("document") || mimeType.includes("msword") || mimeType.includes("spreadsheet")) {
        fileType = "document";
      } else {
        fileType = "other";
      }
    }

    // Create chat message with driverId
    const chatMessage = new ChatMessage({
      driverId: new mongoose.Types.ObjectId(driverId),
      senderId: req.user._id || req.user.id,
      senderType,
      senderName,
      message: message || "",
      fileUrl,
      fileName,
      fileType,
      fileSize,
      company: companyId || driver.company
    });

    await chatMessage.save();

    // Populate sender info
    const populatedMessage = await ChatMessage.findById(chatMessage._id)
      .populate("senderId", "name email")
      .lean();

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`driver-chat-${driverId}`).emit('newChatMessage', populatedMessage);
    }

    // Send push notification to driver if message is from dispatcher
    if (senderType === 'dispatcher') {
      try {
        const driverDoc = await User.findById(driverId).select('expoPushToken').lean();
        if (driverDoc?.expoPushToken) {
          await sendPushToDriver(
            driverDoc.expoPushToken,
            senderName,
            message || '📎 Sent an attachment',
            { type: 'chat', driverId, channelId: 'logistiq-chat' }
          );
        }
      } catch (pushErr) {
        console.error('[Push] Chat push failed:', pushErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      data: populatedMessage,
      message: "Message sent successfully"
    });
  } catch (error) {
    console.error("Send Driver Chat Message Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mark driver messages as read
export const markDriverMessagesAsRead = async (req, res) => {
  try {
    const { driverId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const userId = req.user._id || req.user.id;

    // Validate driverId
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID"
      });
    }

    // Verify driver exists and user has access
    const driver = await User.findById(driverId).lean();
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Check access: driver can mark their own messages as read, dispatcher/admin can mark any driver in their company
    const isDriver = req.user?.role === 'driver';
    const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(req.user?.role?.toLowerCase());
    
    if (isDriver) {
      // Driver can only mark their own messages as read
      if (userId.toString() !== driverId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only mark your own messages as read."
        });
      }
    } else if (!isSuperadmin) {
      // Dispatcher/admin must have company access
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const driverCompanyId = driver.company?.toString() || driver.company;
      if (driverCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This driver does not belong to your company."
        });
      }
    }

    // Build filter
    const filter = {
      driverId: new mongoose.Types.ObjectId(driverId),
      senderId: { $ne: userId },
      "readBy.userId": { $ne: userId }
    };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    // Mark messages as read
    const result = await ChatMessage.updateMany(
      filter,
      {
        $push: {
          readBy: {
            userId: userId,
            readAt: new Date()
          }
        }
      }
    );

    res.json({
      success: true,
      message: "Messages marked as read",
      count: result.modifiedCount
    });
  } catch (error) {
    console.error("Mark Driver Messages As Read Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get unread message count for a driver
export const getDriverUnreadMessageCount = async (req, res) => {
  try {
    const { driverId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    // Validate driverId
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID"
      });
    }

    // Verify driver exists and user has access
    const driver = await User.findById(driverId).lean();
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Check access: driver can get their own unread count, dispatcher/admin can get any driver in their company
    const isDriver = req.user?.role === 'driver';
    const isDispatcher = ['admin', 'superadmin', 'dispatcher'].includes(req.user?.role?.toLowerCase());
    const userId = req.user._id || req.user.id;
    
    if (isDriver) {
      // Driver can only get their own unread count
      if (userId.toString() !== driverId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only get your own unread count."
        });
      }
    } else if (!isSuperadmin) {
      // Dispatcher/admin must have company access
      if (!companyId) {
        return res.status(403).json({
          success: false,
          message: "No company assigned. Please complete company settings."
        });
      }

      const driverCompanyId = driver.company?.toString() || driver.company;
      if (driverCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This driver does not belong to your company."
        });
      }
    }

    // Count unread messages
    const filter = {
      driverId: new mongoose.Types.ObjectId(driverId),
      senderId: { $ne: userId },
      "readBy.userId": { $ne: userId }
    };
    if (!isSuperadmin && companyId) {
      filter.company = companyId;
    }

    const unreadCount = await ChatMessage.countDocuments(filter);

    res.json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error) {
    console.error("Get Driver Unread Message Count Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get last message + unread count for all drivers in the company (for dispatcher sidebar)
export const getDriversLastMessages = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const userId = req.user._id || req.user.id;

    const companyFilter = isSuperadmin ? {} : { company: new mongoose.Types.ObjectId(companyId) };

    // Aggregate: for each driverId get the last non-system message and unread count
    const results = await ChatMessage.aggregate([
      { $match: { ...companyFilter, isSystemMessage: { $ne: true }, senderType: { $ne: 'system' } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$driverId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $toString: '$senderId' }, userId.toString()] },
                    { $not: { $in: [userId.toString(), { $map: { input: { $ifNull: ['$readBy', []] }, as: 'r', in: { $toString: '$$r.userId' } } }] } }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          driverId: '$_id',
          lastMessage: {
            _id: '$lastMessage._id',
            message: '$lastMessage.message',
            fileUrl: '$lastMessage.fileUrl',
            senderType: '$lastMessage.senderType',
            createdAt: '$lastMessage.createdAt'
          },
          unreadCount: 1
        }
      }
    ]);

    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Get Drivers Last Messages Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

