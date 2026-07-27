import { callOpenAI } from './openaiService.js';
import { ChatMessage } from '../models/chat/chatMessageModel.js';
import VehicleDocuments from '../models/driver/vehicleDocumentsModel.js';
import Order from '../models/orderModel.js';
import { Vehicle } from '../models/driver/vehicleModel.js';
import { Trailer } from '../models/driver/trailerModel.js';
import mongoose from 'mongoose';

/**
 * AI Chat Document Service
 * Detects document requests in chat messages and automatically sends relevant documents
 */

/**
 * Detect if a chat message is asking for a document using OpenAI
 * @param {string} message - The chat message
 * @param {string} senderType - 'driver' or 'dispatcher'
 * @returns {Promise<object>} Detection result with document type and intent
 */
export const detectDocumentRequest = async (message, senderType = 'driver') => {
  try {
    // Only process messages from drivers (they ask for documents)
    if (senderType !== 'driver') {
      return {
        isDocumentRequest: false,
        documentType: null,
        confidence: 0
      };
    }

    const systemPrompt = `You are an AI assistant that detects when a driver is asking for a document in a chat message.

Common document requests include:
- BOL (Bill of Lading)
- POD (Proof of Delivery)
- Manifest
- Insurance documents
- Registration documents
- Permit documents
- Fitness certificate
- Safety inspection
- Vehicle documents (also called "fleet documents", "truck documents", "vehicle docs")
- Fleet documents (refers to vehicle/truck documents)
- Trip documents
- Any other transportation/logistics related documents

IMPORTANT: "fleet documents", "fleet docs", "fleet document", "truck documents", "vehicle documents" all refer to VEHICLE documents.

Respond ONLY with a valid JSON object in this exact format:
{
  "isDocumentRequest": true/false,
  "documentType": "bol" | "pod" | "manifest" | "insurance" | "registration" | "permit" | "fitness" | "safety" | "vehicle" | "fleet" | "trip" | "other" | null,
  "confidence": 0.0-1.0,
  "extractedKeywords": ["keyword1", "keyword2"]
}

If the message is NOT asking for a document, set isDocumentRequest to false and documentType to null.`;

    const userPrompt = `Analyze this chat message from a driver: "${message}"

Is the driver asking for a document? If yes, what type of document?`;

    const response = await callOpenAI(userPrompt, {
      systemPrompt,
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 200,
      responseFormat: { type: 'json_object' }
    });

    if (!response.success || !response.data) {
      console.error('❌ AI Document Detection Error:', response.error);
      return {
        isDocumentRequest: false,
        documentType: null,
        confidence: 0
      };
    }

    try {
      const result = JSON.parse(response.data);
      return {
        isDocumentRequest: result.isDocumentRequest === true,
        documentType: result.documentType || null,
        confidence: result.confidence || 0,
        keywords: result.extractedKeywords || []
      };
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      // Fallback: simple keyword detection
      return detectDocumentRequestFallback(message);
    }
  } catch (error) {
    console.error('❌ Error detecting document request:', error);
    return detectDocumentRequestFallback(message);
  }
};

/**
 * Fallback document detection using keyword matching
 */
const detectDocumentRequestFallback = (message) => {
  const lowerMessage = message.toLowerCase();
  
  const documentKeywords = {
    'bol': ['bol', 'bill of lading', 'bill of lad'],
    'pod': ['pod', 'proof of delivery', 'delivery proof'],
    'manifest': ['manifest', 'shipping manifest'],
    'insurance': ['insurance', 'insurance document', 'insurance paper'],
    'registration': ['registration', 'reg document', 'vehicle registration'],
    'permit': ['permit', 'permit document'],
    'fitness': ['fitness', 'fitness certificate', 'fitness doc'],
    'safety': ['safety', 'safety inspection', 'safety certificate'],
    'vehicle': [
      'vehicle document', 'vehicle documents', 'vehicle docs', 'vehicle doc',
      'truck document', 'truck documents', 'truck docs', 'truck doc',
      'trailer document', 'trailer documents', 'trailer docs',
      'fleet document', 'fleet documents', 'fleet docs', 'fleet doc',
      'fleet', 'fleet doc', 'fleet paperwork'
    ],
    'trip': ['trip document', 'trip doc', 'trip documents']
  };

  for (const [docType, keywords] of Object.entries(documentKeywords)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return {
        isDocumentRequest: true,
        documentType: docType,
        confidence: 0.7,
        keywords: keywords.filter(k => lowerMessage.includes(k))
      };
    }
  }

  // Check for general document request patterns
  const requestPatterns = [
    /(?:can|could|please|need|want|send|give|provide|share|get|show).*document/i,
    /(?:document|doc|paper|file|paperwork).*(?:please|need|want|send|give|provide|share|get|show)/i,
    /(?:fleet|vehicle|truck).*(?:document|doc|paper|file|paperwork)/i
  ];

  if (requestPatterns.some(pattern => pattern.test(message))) {
    // Check if it mentions fleet/vehicle/truck
    if (/fleet|vehicle|truck/i.test(message)) {
      return {
        isDocumentRequest: true,
        documentType: 'vehicle',
        confidence: 0.7,
        keywords: ['fleet', 'vehicle', 'truck']
      };
    }
    return {
      isDocumentRequest: true,
      documentType: 'other',
      confidence: 0.5,
      keywords: []
    };
  }

  return {
    isDocumentRequest: false,
    documentType: null,
    confidence: 0
  };
};

/**
 * Get relevant documents for an order based on VehicleDocument model
 * Uses: Order -> Vehicle/Trailer -> VehicleDocuments
 * @param {string} orderId - Order ID
 * @param {string} companyId - Company ID (optional, will be retrieved from Vehicle/Trailer if not provided)
 * @param {string} documentType - Type of document requested (optional)
 * @returns {Promise<{documents: Array, companyId: string}>} Object with documents array and validated companyId
 */
export const getRelevantDocuments = async (orderId, companyId = null, documentType = null) => {
  try {
    const documents = [];

    // Find Order
    const order = await Order.findById(orderId).lean();
    
    if (!order) {
      console.log(`⚠️ Order not found: ${orderId}`);
      return { documents: [], companyId: null };
    }

    // Get vehicle and trailer from order
    let vehicleId = order.truck || order.vehicle;
    let trailerId = order.trailer;
    
    // Convert to string if ObjectId
    if (vehicleId && typeof vehicleId === 'object' && vehicleId.toString) {
      vehicleId = vehicleId.toString();
    }
    if (trailerId && typeof trailerId === 'object' && trailerId.toString) {
      trailerId = trailerId.toString();
    }
    
    console.log(`🔍 Order found: ${order.orderNumber || orderId}`);
    console.log(`🚛 Vehicle ID from order: ${vehicleId}`);
    console.log(`🚚 Trailer ID from order: ${trailerId}`);

    // Get companyId from Vehicle model if vehicleId exists
    let finalCompanyId = companyId;
    if (vehicleId && mongoose.Types.ObjectId.isValid(vehicleId)) {
      try {
        const vehicle = await Vehicle.findById(vehicleId).lean();
        if (vehicle && vehicle.company) {
          finalCompanyId = vehicle.company;
          console.log(`✅ Got companyId from Vehicle model: ${finalCompanyId}`);
        } else {
          console.log(`⚠️ Vehicle not found or has no company: ${vehicleId}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching vehicle for companyId:`, error);
      }
    }
    
    // If still no companyId, try Trailer model
    if ((!finalCompanyId || !mongoose.Types.ObjectId.isValid(finalCompanyId)) && trailerId && mongoose.Types.ObjectId.isValid(trailerId)) {
      try {
        const trailer = await Trailer.findById(trailerId).lean();
        if (trailer && trailer.company) {
          finalCompanyId = trailer.company;
          console.log(`✅ Got companyId from Trailer model: ${finalCompanyId}`);
        } else {
          console.log(`⚠️ Trailer not found or has no company: ${trailerId}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching trailer for companyId:`, error);
      }
    }

    // Convert companyId to string if it's an ObjectId
    if (finalCompanyId && typeof finalCompanyId === 'object' && finalCompanyId.toString) {
      finalCompanyId = finalCompanyId.toString();
      console.log(`🔄 Converted companyId to string: ${finalCompanyId}`);
    }

    // Validate companyId
    if (!finalCompanyId || !mongoose.Types.ObjectId.isValid(finalCompanyId)) {
      console.log(`⚠️ Invalid companyId after all attempts: ${finalCompanyId} (type: ${typeof finalCompanyId})`);
      return { documents: [], companyId: null };
    }
    const companyIdObj = new mongoose.Types.ObjectId(finalCompanyId);
    console.log(`✅ Valid companyId ObjectId created: ${finalCompanyId}`);

    // Get vehicle documents - only filter by vehicleId, not company
    if (vehicleId && mongoose.Types.ObjectId.isValid(vehicleId)) {
      const vehicleIdObj = new mongoose.Types.ObjectId(vehicleId);
      const vehicleDocs = await VehicleDocuments.find({
        vehicleId: vehicleIdObj
      }).lean();

      for (const doc of vehicleDocs) {
        if (doc.files && doc.files.length > 0) {
          for (const file of doc.files) {
            // If documentType is "fleet" or "vehicle", include all vehicle documents
            // Otherwise filter by specific document type
            const shouldInclude = !documentType || 
                                 documentType.toLowerCase() === 'fleet' || 
                                 documentType.toLowerCase() === 'vehicle' ||
                                 (() => {
                                   const docType = doc.documentType?.toLowerCase() || '';
                                   return docType.includes(documentType.toLowerCase()) || 
                                          documentType.toLowerCase().includes(docType);
                                 })();
            
            if (shouldInclude) {
              documents.push({
                source: 'vehicle',
                type: doc.documentType || 'other',
                documentNumber: doc.documentNumber,
                fileName: file.fileName,
                fileUrl: file.fileUrl,
                fileSize: file.fileSize,
                fileType: file.fileType,
                expiryDate: doc.expiryDate,
                status: doc.status
              });
              console.log(`✅ Added vehicle document: ${file.fileName} (${doc.documentType})`);
            }
          }
        } else {
          console.log(`⚠️ Vehicle document record ${doc._id} has no files`);
        }
      }
      
      console.log(`📦 Total vehicle documents collected: ${documents.filter(d => d.source === 'vehicle').length}`);
    } else {
      console.log(`⚠️ No vehicleId found for order ${orderId}`);
    }

    // Get trailer documents - only filter by trailerId, not company
    if (trailerId && mongoose.Types.ObjectId.isValid(trailerId)) {
      const trailerIdObj = new mongoose.Types.ObjectId(trailerId);
      const trailerDocs = await VehicleDocuments.find({
        trailerId: trailerIdObj
      }).lean();

      for (const doc of trailerDocs) {
        if (doc.files && doc.files.length > 0) {
          for (const file of doc.files) {
            // Filter by document type if specified
            if (documentType) {
              const docType = doc.documentType?.toLowerCase() || '';
              if (docType.includes(documentType.toLowerCase()) || 
                  documentType.toLowerCase().includes(docType)) {
                documents.push({
                  source: 'trailer',
                  type: doc.documentType || 'other',
                  documentNumber: doc.documentNumber,
                  fileName: file.fileName,
                  fileUrl: file.fileUrl,
                  fileSize: file.fileSize,
                  fileType: file.fileType,
                  expiryDate: doc.expiryDate,
                  status: doc.status
                });
              }
            } else {
              documents.push({
                source: 'trailer',
                type: doc.documentType || 'other',
                documentNumber: doc.documentNumber,
                fileName: file.fileName,
                fileUrl: file.fileUrl,
                fileSize: file.fileSize,
                fileType: file.fileType,
                expiryDate: doc.expiryDate,
                status: doc.status
              });
            }
          }
        }
      }
    }

    console.log(`📦 Total documents collected: ${documents.length}`);
    return { documents, companyId: finalCompanyId };
  } catch (error) {
    console.error('❌ Error getting relevant documents:', error);
    return { documents: [], companyId: null };
  }
};

/**
 * Automatically send document(s) to driver via chat
 * @param {string} orderId - Order ID
 * @param {string} companyId - Company ID
 * @param {Array} documents - Array of documents to send
 * @param {string} senderId - AI sender ID (use a system user or null)
 * @param {object} io - Socket.io instance for real-time sending
 * @param {string} roomName - Socket room name
 * @returns {Promise<Array>} Array of sent chat messages
 */
export const sendDocumentsViaChat = async (orderId, companyId, documents, senderId = null, io = null, roomName = null) => {
  try {
    if (!documents || documents.length === 0) {
      return [];
    }

    // Calculate roomName if not provided (always use order-chat format)
    if (!roomName && orderId) {
      roomName = `order-chat-${orderId}`;
    }

    const sentMessages = [];

    // Send each document as a separate chat message
    for (const doc of documents) {
      try {
        // Determine file type
        let fileType = 'other';
        const fileName = doc.fileName || '';
        const lowerFileName = fileName.toLowerCase();
        
        if (lowerFileName.endsWith('.pdf')) {
          fileType = 'pdf';
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].some(ext => lowerFileName.endsWith(ext))) {
          fileType = 'image';
        } else if (['.doc', '.docx', '.xls', '.xlsx'].some(ext => lowerFileName.endsWith(ext))) {
          fileType = 'document';
        }

        // Validate orderId
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
          console.error(`❌ Invalid orderId: ${orderId}, skipping document send`);
          continue;
        }
        const orderIdObj = orderId instanceof mongoose.Types.ObjectId ? orderId : new mongoose.Types.ObjectId(orderId);

        // Validate senderId - must be a valid ObjectId
        if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
          console.error(`❌ Invalid senderId provided: ${senderId}, skipping document send`);
          continue; // Skip this document if senderId is invalid
        }
        const finalSenderId = new mongoose.Types.ObjectId(senderId);

        // Validate companyId
        if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
          console.error(`❌ Invalid companyId: ${companyId}, skipping document send`);
          continue;
        }
        const companyIdObj = new mongoose.Types.ObjectId(companyId);

        // Create chat message from AI
        const chatMessage = new ChatMessage({
          orderId: orderIdObj,
          tripId: null, // Only using Order model
          senderId: finalSenderId,
          senderType: 'dispatcher', // AI acts as dispatcher
          senderName: 'AI Assistant',
          message: `📄 Here's the ${doc.type || 'document'} you requested: ${doc.fileName || 'Document'}`,
          fileUrl: doc.fileUrl,
          fileName: doc.fileName,
          fileType: fileType,
          fileSize: doc.fileSize || 0,
          company: companyIdObj
        });

        await chatMessage.save();
        
        // Log document URL for debugging
        console.log('📄 ===== AI DOCUMENT SENT =====');
        console.log('📄 Document Message ID:', chatMessage._id.toString());
        console.log('📄 File Name:', doc.fileName);
        console.log('📄 File Type:', fileType);
        console.log('📄 File Size:', doc.fileSize || 0);
        console.log('📄 File URL:', doc.fileUrl);
        console.log('📄 Full File URL:', doc.fileUrl);
        console.log('📄 Order ID:', orderId);
        console.log('📄 Room Name:', roomName);
        console.log('📄 ============================');

        // Populate sender info
        const populatedMessage = await ChatMessage.findById(chatMessage._id)
          .populate("senderId", "name email")
          .lean();

        // Send via Socket.io if available
        if (io && roomName) {
          console.log(`📤 Emitting message to room: ${roomName}`);
          
          // Emit to the specific room (order-chat-{orderId})
          io.to(roomName).emit("newChatMessage", populatedMessage);
          
          // Also emit to trip-chat room for backward compatibility (in case mobile app joined that)
          const tripRoomName = roomName.replace('order-chat-', 'trip-chat-');
          if (tripRoomName !== roomName) {
            io.to(tripRoomName).emit("newChatMessage", populatedMessage);
            console.log(`📤 Also emitting to backward-compatible room: ${tripRoomName}`);
          }
          
          console.log(`✅ AI sent document via socket: ${doc.fileName} to rooms ${roomName}${tripRoomName !== roomName ? ` and ${tripRoomName}` : ''}`);
        } else {
          console.log(`⚠️ Cannot send via socket - io: ${!!io}, roomName: ${roomName}`);
        }

        sentMessages.push(populatedMessage);
        console.log(`✅ AI sent document: ${doc.fileName} to chat ${orderId}`);
      } catch (docError) {
        console.error(`❌ Error sending document ${doc.fileName}:`, docError);
      }
    }

    return sentMessages;
  } catch (error) {
    console.error('❌ Error sending documents via chat:', error);
    return [];
  }
};

/**
 * Send a message to driver when no documents are found
 * @param {string} orderId - Order ID
 * @param {string} companyId - Company ID
 * @param {string} documentType - Type of document requested
 * @param {string} userId - User ID for sender
 * @param {object} io - Socket.io instance
 * @param {string} roomName - Socket room name (optional, will be calculated if not provided)
 * @returns {Promise<boolean>} True if message was sent
 */
const sendNoDocumentsMessage = async (orderId, companyId, documentType, userId, io = null, roomName = null) => {
  try {
    // Calculate roomName if not provided (always use order-chat format)
    if (!roomName && orderId) {
      roomName = `order-chat-${orderId}`;
    }

    // Get a valid sender ID
    let validSenderId = userId;
    if (!validSenderId || !mongoose.Types.ObjectId.isValid(validSenderId)) {
      try {
        const { User } = await import('../models/driver/userModel.js');
        const dispatcher = await User.findOne({
          company: companyIdObj,
          role: { $in: ['admin', 'dispatcher', 'superadmin'] },
          status: 'active'
        }).lean();
        if (dispatcher) {
          validSenderId = dispatcher._id.toString();
        } else {
          console.log(`⚠️ No dispatcher found, cannot send AI message`);
          return false;
        }
      } catch (error) {
        console.error('❌ Error finding dispatcher for AI message:', error);
        return false;
      }
    }
    
    validSenderId = validSenderId.toString();

    // Validate orderId
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      console.log(`⚠️ Invalid orderId: ${orderId}`);
      return false;
    }
    const orderIdObj = orderId instanceof mongoose.Types.ObjectId ? orderId : new mongoose.Types.ObjectId(orderId);

    // Validate companyId
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      console.log(`⚠️ Invalid companyId: ${companyId}`);
      return false;
    }
    const companyIdObj = new mongoose.Types.ObjectId(companyId);

    // Create friendly message based on document type
    const documentTypeName = documentType === 'vehicle' || documentType === 'fleet' 
      ? 'fleet/vehicle documents' 
      : documentType === 'bol' 
      ? 'BOL (Bill of Lading)'
      : documentType === 'pod'
      ? 'POD (Proof of Delivery)'
      : documentType || 'documents';

    const message = `📋 I couldn't find any ${documentTypeName} in the company database for this trip. Please contact your dispatcher to get the documents you need.`;

    // Create chat message from AI
    const chatMessage = new ChatMessage({
      orderId: orderIdObj,
      tripId: null, // Only using Order model
      senderId: new mongoose.Types.ObjectId(validSenderId),
      senderType: 'dispatcher', // AI acts as dispatcher
      senderName: 'AI Assistant',
      message: message,
      fileUrl: null,
      fileName: null,
      fileType: null,
      fileSize: 0,
      company: companyIdObj
    });

    await chatMessage.save();

    // Populate sender info
    const populatedMessage = await ChatMessage.findById(chatMessage._id)
      .populate("senderId", "name email")
      .lean();

    // Send via Socket.io if available
    if (io && roomName) {
      console.log(`📤 Emitting "no documents" message to room: ${roomName}`);
      
      // Emit to the specific room (order-chat-{orderId})
      io.to(roomName).emit("newChatMessage", populatedMessage);
      
      // Also emit to trip-chat room for backward compatibility
      const tripRoomName = roomName.replace('order-chat-', 'trip-chat-');
      if (tripRoomName !== roomName) {
        io.to(tripRoomName).emit("newChatMessage", populatedMessage);
      }
      
      console.log(`✅ AI sent "no documents" message via socket to rooms ${roomName}${tripRoomName !== roomName ? ` and ${tripRoomName}` : ''}`);
    } else {
      console.log(`⚠️ Cannot send "no documents" message via socket - io: ${!!io}, roomName: ${roomName}`);
    }

    console.log(`✅ AI sent "no documents" message to driver`);
    return true;
  } catch (error) {
    console.error('❌ Error sending "no documents" message:', error);
    return false;
  }
};

/**
 * Process chat message and auto-send documents if driver is asking for them
 * @param {object} chatData - Chat message data
 * @param {object} context - Context (order/trip, company, user info)
 * @param {object} io - Socket.io instance
 * @returns {Promise<boolean>} True if documents were sent
 */
export const processChatMessageForDocuments = async (chatData, context, io = null) => {
  try {
    const { message, senderType } = chatData;
    let { orderIdOrTripId, companyId, userId } = context;

    // Ensure companyId is always a string (handle ObjectId objects)
    if (companyId) {
      if (typeof companyId === 'object' && companyId.toString) {
        companyId = companyId.toString();
      } else if (typeof companyId !== 'string') {
        companyId = String(companyId);
      }
    }

    console.log(`🤖 AI Document Service - Processing message:`, {
      message: message?.substring(0, 50),
      senderType,
      orderIdOrTripId,
      companyId,
      hasIo: !!io
    });

    // Only process messages from drivers
    if (senderType !== 'driver' || !message || !message.trim()) {
      console.log(`⚠️ Skipping - not a driver message or empty message`);
      return false;
    }

    // Detect if driver is asking for a document
    const detection = await detectDocumentRequest(message, senderType);

    console.log(`🤖 AI Document Detection Result:`, {
      isDocumentRequest: detection.isDocumentRequest,
      documentType: detection.documentType,
      confidence: detection.confidence,
      keywords: detection.keywords
    });

    if (!detection.isDocumentRequest || detection.confidence < 0.5) {
      console.log(`⚠️ Document request not detected or confidence too low`);
      return false;
    }

    // Normalize document type: "fleet" should be treated as "vehicle"
    const normalizedDocType = (detection.documentType === 'fleet') ? 'vehicle' : detection.documentType;
    
    console.log(`🤖 AI detected document request: ${normalizedDocType} (confidence: ${detection.confidence})`);

    // Get relevant documents (use normalized type)
    const result = await getRelevantDocuments(
      orderIdOrTripId,
      companyId,
      normalizedDocType
    );
    
    const documents = result.documents || [];
    const validatedCompanyId = result.companyId || companyId;
    
    // Ensure validatedCompanyId is a string
    let finalCompanyId = validatedCompanyId;
    if (finalCompanyId && typeof finalCompanyId === 'object' && finalCompanyId.toString) {
      finalCompanyId = finalCompanyId.toString();
    } else if (finalCompanyId && typeof finalCompanyId !== 'string') {
      finalCompanyId = String(finalCompanyId);
    }
    
    // Determine room name for Socket.io (always use order-chat format)
    const roomName = orderIdOrTripId ? `order-chat-${orderIdOrTripId}` : null;
    
    console.log(`📋 Retrieved ${documents.length} relevant documents`);
    console.log(`📡 Room name for socket: ${roomName}`);
    console.log(`🏢 Using validated companyId: ${finalCompanyId} (type: ${typeof finalCompanyId})`);

    if (documents.length === 0) {
      console.log(`⚠️ No documents found for request: ${normalizedDocType}`);
      
      // Send a message to driver saying no documents found, contact dispatcher
      try {
        await sendNoDocumentsMessage(
          orderIdOrTripId,
          finalCompanyId, // Use validated companyId from Vehicle/Trailer model
          normalizedDocType,
          userId,
          io,
          roomName
        );
        return true; // Message was sent
      } catch (error) {
        console.error('❌ Error sending "no documents" message:', error);
        return false;
      }
    }

    // Get a valid sender ID - use the first dispatcher/admin from the company if userId is not available
    let validSenderId = userId;
    if (!validSenderId || !mongoose.Types.ObjectId.isValid(validSenderId)) {
      try {
        const { User } = await import('../models/driver/userModel.js');
        // Use validated companyId
        const dispatcherCompanyId = finalCompanyId && mongoose.Types.ObjectId.isValid(finalCompanyId) 
          ? new mongoose.Types.ObjectId(finalCompanyId) 
          : null;
        const dispatcher = await User.findOne({
          company: dispatcherCompanyId,
          role: { $in: ['admin', 'dispatcher', 'superadmin'] },
          status: 'active'
        }).lean();
        if (dispatcher) {
          validSenderId = dispatcher._id.toString();
          console.log(`✅ Using dispatcher ${dispatcher.name || dispatcher.email} as AI sender`);
        } else {
          console.log(`⚠️ No dispatcher found for company ${finalCompanyId}, cannot send AI documents`);
          return false; // Don't send if we can't find a valid sender
        }
      } catch (error) {
        console.error('❌ Error finding dispatcher for AI sender:', error);
        return false; // Don't send if there's an error
      }
    }
    
    // Ensure validSenderId is a string
    validSenderId = validSenderId.toString();

    // Send documents via chat (use validated companyId)
    const sentMessages = await sendDocumentsViaChat(
      orderIdOrTripId,
      finalCompanyId, // Use validated companyId from Vehicle/Trailer model
      documents,
      validSenderId, // Use valid sender ID
      io,
      roomName
    );

    if (sentMessages.length > 0) {
      console.log(`✅ AI automatically sent ${sentMessages.length} document(s) to driver`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Error processing chat message for documents:', error);
    return false;
  }
};

