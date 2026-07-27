import { callOpenAI } from '../../services/openaiService.js';
import { User } from '../../models/driver/userModel.js';
import Trip from '../../models/tripModel.js';
import Order from '../../models/orderModel.js';
import { FleetUnit } from '../../models/fleet/fleetUnitModel.js';
import { Invoice } from '../../models/hr/invoiceModel.js';
import { Expense } from '../../models/hr/expenseModel.js';
import { WorkOrder } from '../../models/driver/workOrderModel.js';
import { Subscription } from '../../models/subscriptionModel.js';
import { Plan } from '../../models/planModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import mongoose from 'mongoose';

/**
 * AI Chat Controller
 * Handles AI-powered queries about drivers, trips, orders, etc.
 */

/**
 * Get subscription information for the current user
 */
const getUserSubscription = async (userId) => {
  try {
    const subscription = await Subscription.findOne({ admin: userId })
      .populate('plan', 'planName planType description')
      .sort({ createdAt: -1 })
      .lean();
    
    if (!subscription) {
      return null;
    }
    
    return {
      id: subscription._id.toString(),
      planName: subscription.planSnapshot?.planName || subscription.plan?.planName || 'N/A',
      planType: subscription.planType,
      subscriptionType: subscription.subscriptionType,
      status: subscription.status,
      paymentStatus: subscription.paymentStatus,
      amount: subscription.amount,
      currency: subscription.currency || 'CAD',
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      nextBillingDate: subscription.nextBillingDate,
      cancelledAt: subscription.cancelledAt,
      lastPaymentDate: subscription.lastPaymentDate,
      installments: subscription.installments
    };
  } catch (error) {
    console.error('Error getting user subscription:', error);
    return null;
  }
};

/**
 * Get context data for AI to answer questions
 */
const getSystemContext = async (user) => {
  const companyId = getUserCompanyId(user);
  const companyFilter = companyId ? { company: companyId } : {};
  
  // Get subscription information for the current user (if admin)
  let userSubscription = null;
  if (user.role === 'admin' || user.role === 'superadmin') {
    userSubscription = await getUserSubscription(user._id);
  }

  try {
    // Get basic stats
    const totalDrivers = await User.countDocuments({ 
      role: 'driver', 
      status: 'active',
      ...companyFilter 
    });
    
    // Get total employees (all users except admin, superadmin, and driver)
    const employeeRoles = [
      'dispatcher',
      'hr',
      'contact',
      'customer',
      'reporter',
      'Maintenance Crew (Mechanics)',
      'Fleet Maintenance Manager',
      'Compliance Manager',
      'safety officer'
    ];
    const totalEmployees = await User.countDocuments({
      role: { $in: employeeRoles },
      ...companyFilter
    });
    
    const totalTrips = await Trip.countDocuments(companyFilter);
    const activeTrips = await Trip.countDocuments({ 
      status: 'in-progress',
      ...companyFilter 
    });
    
    const totalOrders = await Order.countDocuments(companyFilter);
    const totalVehicles = await FleetUnit.countDocuments(companyFilter);
    
    // Get financial stats
    const totalInvoices = await Invoice.countDocuments(companyFilter);
    const paidInvoices = await Invoice.countDocuments({ 
      status: 'paid',
      ...companyFilter 
    });
    const pendingInvoices = await Invoice.countDocuments({ 
      status: 'pending',
      ...companyFilter 
    });
    
    // Get invoice totals
    const invoiceStats = await Invoice.aggregate([
      { $match: companyFilter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: { $toDouble: '$amount' } },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, { $toDouble: '$amount' }, 0]
            }
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, { $toDouble: '$amount' }, 0]
            }
          }
        }
      }
    ]);
    
    const totalExpenses = await Expense.countDocuments(companyFilter);
    const expenseStats = await Expense.aggregate([
      { $match: companyFilter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    // Get work orders stats
    const totalWorkOrders = await WorkOrder.countDocuments(companyFilter);
    const openWorkOrders = await WorkOrder.countDocuments({ 
      status: 'open',
      ...companyFilter 
    });
    const inProgressWorkOrders = await WorkOrder.countDocuments({ 
      status: 'inprogress',
      ...companyFilter 
    });
    const completedWorkOrders = await WorkOrder.countDocuments({ 
      status: 'completed',
      ...companyFilter 
    });

    // Get recent drivers list (limited)
    const recentDrivers = await User.find({ 
      role: 'driver',
      ...companyFilter 
    })
      .select('_id name email internalId status')
      .limit(50)
      .lean();

    // Get recent trips (limited)
    const recentTrips = await Trip.find(companyFilter)
      .select('_id tripNumber driver coDriver status')
      .populate('driver', 'name internalId')
      .populate('coDriver', 'name internalId')
      .limit(50)
      .lean();

    // Get recent orders (limited)
    const recentOrders = await Order.find(companyFilter)
      .select('_id orderNumber orderType status totalAmount currency')
      .limit(30)
      .lean();
    
    // Get recent invoices (limited)
    const recentInvoices = await Invoice.find(companyFilter)
      .select('_id clientName amount status invoiceDate dueDate')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    
    // Get recent expenses (limited)
    const recentExpenses = await Expense.find(companyFilter)
      .select('_id type amount description date')
      .populate('userId', 'name')
      .sort({ date: -1 })
      .limit(30)
      .lean();

    return {
      totalDrivers,
      totalEmployees,
      totalTrips,
      activeTrips,
      totalOrders,
      totalVehicles,
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      invoiceTotalAmount: invoiceStats[0]?.totalAmount || 0,
      invoicePaidAmount: invoiceStats[0]?.paidAmount || 0,
      invoicePendingAmount: invoiceStats[0]?.pendingAmount || 0,
      totalExpenses,
      expenseTotalAmount: expenseStats[0]?.totalAmount || 0,
      totalWorkOrders,
      openWorkOrders,
      inProgressWorkOrders,
      completedWorkOrders,
      userSubscription,
      recentDrivers: recentDrivers.map(d => ({
        id: d._id.toString(),
        name: d.name,
        email: d.email,
        internalId: d.internalId,
        status: d.status
      })),
      recentTrips: recentTrips.map(t => ({
        id: t._id.toString(),
        tripNumber: t.tripNumber,
        driverId: t.driver?._id?.toString(),
        driverName: t.driver?.name,
        driverInternalId: t.driver?.internalId,
        coDriverId: t.coDriver?._id?.toString(),
        coDriverName: t.coDriver?.name,
        coDriverInternalId: t.coDriver?.internalId,
        status: t.status
      })),
      recentOrders: recentOrders.map(o => ({
        id: o._id.toString(),
        orderNumber: o.orderNumber,
        orderType: o.orderType,
        status: o.status,
        totalAmount: o.totalAmount,
        currency: o.currency
      })),
      recentInvoices: recentInvoices.map(i => ({
        id: i._id.toString(),
        clientName: i.clientName,
        amount: i.amount,
        status: i.status,
        invoiceDate: i.invoiceDate,
        dueDate: i.dueDate
      })),
      recentExpenses: recentExpenses.map(e => ({
        id: e._id.toString(),
        type: e.type,
        amount: e.amount,
        description: e.description,
        date: e.date,
        userName: e.userId?.name || 'N/A'
      }))
    };
  } catch (error) {
    console.error('Error getting system context:', error);
    return null;
  }
};

/**
 * Check if a driver is assigned to any trip (as driver or co-driver)
 */
const checkDriverAssignment = async (driverId, companyFilter) => {
  try {
    const driver = await User.findOne({ 
      _id: driverId,
      role: 'driver',
      ...companyFilter 
    }).lean();

    if (!driver) {
      return { exists: false, assigned: false };
    }

    // Check if driver is assigned as main driver OR co-driver
    const activeTripAsDriver = await Trip.findOne({ 
      driver: driverId,
      status: { $in: ['in-progress', 'planned'] },
      ...companyFilter 
    })
      .select('tripNumber status driver coDriver')
      .populate('driver', 'name internalId')
      .populate('coDriver', 'name internalId')
      .lean();

    const activeTripAsCoDriver = await Trip.findOne({ 
      coDriver: driverId,
      status: { $in: ['in-progress', 'planned'] },
      ...companyFilter 
    })
      .select('tripNumber status driver coDriver')
      .populate('driver', 'name internalId')
      .populate('coDriver', 'name internalId')
      .lean();

    const activeTrip = activeTripAsDriver || activeTripAsCoDriver;
    const role = activeTripAsDriver ? 'driver' : (activeTripAsCoDriver ? 'co-driver' : null);

    // Get all trips where driver is either driver or co-driver
    const allTripsAsDriver = await Trip.find({ 
      driver: driverId,
      ...companyFilter 
    })
      .select('tripNumber status driver coDriver')
      .populate('driver', 'name internalId')
      .populate('coDriver', 'name internalId')
      .limit(10)
      .lean();

    const allTripsAsCoDriver = await Trip.find({ 
      coDriver: driverId,
      ...companyFilter 
    })
      .select('tripNumber status driver coDriver')
      .populate('driver', 'name internalId')
      .populate('coDriver', 'name internalId')
      .limit(10)
      .lean();

    // Combine and deduplicate trips
    const allTripsMap = new Map();
    [...allTripsAsDriver, ...allTripsAsCoDriver].forEach(trip => {
      if (!allTripsMap.has(trip._id.toString())) {
        allTripsMap.set(trip._id.toString(), {
          tripNumber: trip.tripNumber,
          status: trip.status,
          role: trip.driver?._id?.toString() === driverId ? 'driver' : 'co-driver',
          driverName: trip.driver?.name,
          coDriverName: trip.coDriver?.name
        });
      }
    });

    return {
      exists: true,
      assigned: !!activeTrip,
      driver: {
        id: driver._id.toString(),
        name: driver.name,
        email: driver.email,
        internalId: driver.internalId,
        status: driver.status
      },
      activeTrip: activeTrip ? {
        tripNumber: activeTrip.tripNumber,
        status: activeTrip.status,
        role: role,
        driverName: activeTrip.driver?.name,
        coDriverName: activeTrip.coDriver?.name
      } : null,
      recentTrips: Array.from(allTripsMap.values())
    };
  } catch (error) {
    console.error('Error checking driver assignment:', error);
    return { exists: false, assigned: false, error: error.message };
  }
};

/**
 * Get all free drivers (not assigned as driver or co-driver in active trips)
 */
const getFreeDrivers = async (companyFilter) => {
  try {
    // Get all active trips with their drivers and co-drivers
    const activeTrips = await Trip.find({
      status: { $in: ['in-progress', 'planned'] },
      ...companyFilter
    })
      .select('driver coDriver')
      .lean();

    // Collect all assigned driver IDs (both as driver and co-driver)
    const assignedDriverIds = new Set();
    activeTrips.forEach(trip => {
      if (trip.driver) assignedDriverIds.add(trip.driver.toString());
      if (trip.coDriver) assignedDriverIds.add(trip.coDriver.toString());
    });

    // Get all active drivers
    const allDrivers = await User.find({
      role: 'driver',
      status: 'active',
      ...companyFilter
    })
      .select('_id name email internalId status')
      .lean();

    // Filter out assigned drivers
    const freeDrivers = allDrivers.filter(driver => 
      !assignedDriverIds.has(driver._id.toString())
    );

    return freeDrivers.map(d => ({
      id: d._id.toString(),
      name: d.name,
      email: d.email,
      internalId: d.internalId,
      status: d.status
    }));
  } catch (error) {
    console.error('Error getting free drivers:', error);
    return [];
  }
};

/**
 * Main AI chat handler
 */
export const handleAIChat = async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    const user = req.user;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Get system context
    const context = await getSystemContext(user);
    const companyId = getUserCompanyId(user);
    const companyFilter = companyId ? { company: companyId } : {};

    // Check if query is asking for free drivers
    const isFreeDriversQuery = /(?:which|who|what|list).*driver.*(?:free|available|not assigned|unassigned)/i.test(message);
    let freeDrivers = [];
    if (isFreeDriversQuery) {
      freeDrivers = await getFreeDrivers(companyFilter);
    }

    // Build system prompt with context
    let systemPrompt = `You are an AI assistant for a logistics and fleet management system. You help users answer questions about drivers, trips, orders, vehicles, and other system data.

Current System Context:
- Total Drivers: ${context?.totalDrivers || 0}
- Total Employees: ${context?.totalEmployees || 0} (includes dispatchers, HR, contacts, customers, reporters, maintenance crew, fleet managers, compliance managers, and safety officers - excludes admin, superadmin, and drivers)
- Total Trips: ${context?.totalTrips || 0}
- Active Trips: ${context?.activeTrips || 0}
- Total Orders: ${context?.totalOrders || 0}
- Total Vehicles: ${context?.totalVehicles || 0}
- Total Invoices: ${context?.totalInvoices || 0} (Paid: ${context?.paidInvoices || 0}, Pending: ${context?.pendingInvoices || 0})
- Invoice Amounts: Total: $${(context?.invoiceTotalAmount || 0).toFixed(2)}, Paid: $${(context?.invoicePaidAmount || 0).toFixed(2)}, Pending: $${(context?.invoicePendingAmount || 0).toFixed(2)}
- Total Expenses: ${context?.totalExpenses || 0} (Total Amount: $${(context?.expenseTotalAmount || 0).toFixed(2)})
- Work Orders: Total: ${context?.totalWorkOrders || 0}, Open: ${context?.openWorkOrders || 0}, In Progress: ${context?.inProgressWorkOrders || 0}, Completed: ${context?.completedWorkOrders || 0}

${context?.userSubscription ? `\nCurrent User Subscription:
- Plan: ${context.userSubscription.planName}
- Plan Type: ${context.userSubscription.planType}
- Subscription Type: ${context.userSubscription.subscriptionType}
- Status: ${context.userSubscription.status}
- Payment Status: ${context.userSubscription.paymentStatus}
- Amount: ${context.userSubscription.currency} ${context.userSubscription.amount}
- Start Date: ${context.userSubscription.startDate ? new Date(context.userSubscription.startDate).toLocaleDateString() : 'N/A'}
- End Date: ${context.userSubscription.endDate ? new Date(context.userSubscription.endDate).toLocaleDateString() : 'N/A'}
- Next Billing Date: ${context.userSubscription.nextBillingDate ? new Date(context.userSubscription.nextBillingDate).toLocaleDateString() : 'N/A'}
${context.userSubscription.installments?.total > 0 ? `- Installments: ${context.userSubscription.installments.paid}/${context.userSubscription.installments.total} paid, ${context.userSubscription.installments.remaining} remaining` : ''}` : ''}

Available Drivers (sample):
${context?.recentDrivers?.map(d => `- ID: ${d.id}, Name: ${d.name}, Internal ID: ${d.internalId || 'N/A'}, Status: ${d.status}`).join('\n') || 'None'}

Recent Trips (sample):
${context?.recentTrips?.map(t => `- Trip: ${t.tripNumber}, Driver: ${t.driverName} (${t.driverInternalId || 'N/A'})${t.coDriverName ? `, Co-Driver: ${t.coDriverName} (${t.coDriverInternalId || 'N/A'})` : ''}, Status: ${t.status}`).join('\n') || 'None'}

Recent Orders (sample):
${context?.recentOrders?.map(o => `- Order: ${o.orderNumber}, Type: ${o.orderType || 'N/A'}, Status: ${o.status}, Amount: ${o.currency || 'CAD'} ${o.totalAmount || 0}`).join('\n') || 'None'}

Recent Invoices (sample):
${context?.recentInvoices?.map(i => `- Invoice: ${i.clientName || 'N/A'}, Amount: $${i.amount || 0}, Status: ${i.status}, Due: ${i.dueDate ? new Date(i.dueDate).toLocaleDateString() : 'N/A'}`).join('\n') || 'None'}

Recent Expenses (sample):
${context?.recentExpenses?.map(e => `- Expense: ${e.type || 'N/A'}, Amount: $${e.amount || 0}, User: ${e.userName}, Date: ${e.date ? new Date(e.date).toLocaleDateString() : 'N/A'}, Description: ${e.description || 'N/A'}`).join('\n') || 'None'}

You have access to comprehensive database information including:
- Drivers (assignment status, active/inactive, trip assignments)
- Employees (all non-admin/superadmin/driver users)
- Trips (status, drivers, co-drivers, dates, routes)
- Orders (status, amounts, customers, pickup/delivery locations)
- Invoices (status, amounts, clients, dates, payment information)
- Expenses (types, amounts, descriptions, dates, users)
- Work Orders (status, vehicles, mechanics, completion)
- Vehicles/Fleet Units (status, assignments, maintenance)
- Financial data (totals, pending amounts, paid amounts)
- Subscriptions (plan details, status, payment information, billing dates)

You can answer questions like:
- "Is driver [ID or name] assigned to any trip?"
- "What is the status of trip [trip number]?"
- "How many active trips are there?"
- "List all drivers"
- "What trips is driver [ID] assigned to?"
- "Which driver is free now?"
- "How many employees are there?"
- "How many drivers are there?"
- "What is the total invoice amount?"
- "How many invoices are pending?"
- "What are the recent expenses?"
- "How many work orders are open?"
- "What is the status of order [order number]?"
- "Show me recent invoices"
- "What is the total expense amount?"
- "What about my subscription?" or "What is my subscription status?"
- "When is my next billing date?"
- "What plan am I on?"
- And many more questions about the system data

IMPORTANT: When users ask about "my subscription" or "subscription", provide information from the Current User Subscription section above. Include details about plan name, status, payment status, dates, and amounts.

IMPORTANT: When checking if a driver is assigned, remember that a driver can be assigned as either:
1. Main Driver (driver field)
2. Co-Driver (coDriver field)

A driver is considered "assigned" or "not free" if they are assigned as EITHER the main driver OR the co-driver of an active trip (status: 'in-progress' or 'planned').

When answering about driver assignments, you can check if a driver ID is provided in the query. If a driver ID is mentioned, provide accurate information about their assignment status, including whether they are assigned as a driver or co-driver.

${freeDrivers.length > 0 ? `\n\nFREE DRIVERS (Not assigned to any active trip):
${freeDrivers.map(d => `- ${d.name} (Internal ID: ${d.internalId || 'N/A'}, Email: ${d.email || 'N/A'})`).join('\n')}` : ''}

Be helpful, concise, and accurate. If you don't have enough information to answer a question, say so clearly.`;

    // Check if the query is about a specific driver assignment
    const driverIdMatch = message.match(/(?:driver\s+)?(?:id\s+)?([a-f0-9]{24})/i);
    if (driverIdMatch) {
      const driverId = driverIdMatch[1];
      if (mongoose.Types.ObjectId.isValid(driverId)) {
        const companyFilter = companyId ? { company: companyId } : {};
        const driverInfo = await checkDriverAssignment(driverId, companyFilter);
        
        if (driverInfo.exists) {
          systemPrompt += `\n\nSPECIFIC DRIVER QUERY DETECTED:
Driver ID: ${driverId}
Driver Name: ${driverInfo.driver?.name}
Driver Internal ID: ${driverInfo.driver?.internalId || 'N/A'}
Driver Status: ${driverInfo.driver?.status}
Currently Assigned: ${driverInfo.assigned ? 'YES' : 'NO'}
${driverInfo.activeTrip ? `Active Trip: ${driverInfo.activeTrip.tripNumber} (${driverInfo.activeTrip.status})
Role in Active Trip: ${driverInfo.activeTrip.role}
Main Driver: ${driverInfo.activeTrip.driverName || 'N/A'}
Co-Driver: ${driverInfo.activeTrip.coDriverName || 'N/A'}` : 'No active trip'}
Recent Trips: ${driverInfo.recentTrips?.length || 0} trip(s)`;

          if (driverInfo.recentTrips?.length > 0) {
            systemPrompt += '\n' + driverInfo.recentTrips.map(t => `- ${t.tripNumber} (${t.status}) - Role: ${t.role}${t.driverName ? `, Main Driver: ${t.driverName}` : ''}${t.coDriverName ? `, Co-Driver: ${t.coDriverName}` : ''}`).join('\n');
          }
        } else {
          systemPrompt += `\n\nSPECIFIC DRIVER QUERY DETECTED:
Driver ID: ${driverId}
Status: Driver not found or not accessible`;
        }
      }
    }

    // Build conversation messages
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      {
        role: 'user',
        content: message
      }
    ];

    // Build the prompt from messages (combine system and user messages)
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || message;
    const assistantMessages = messages.filter(m => m.role === 'assistant').slice(-3).map(m => m.content).join('\n\n');
    
    // Combine into a single prompt
    let prompt = systemMessage;
    if (assistantMessages) {
      prompt += '\n\nPrevious conversation:\n' + assistantMessages;
    }
    prompt += '\n\nUser question: ' + lastUserMessage;

    // Call OpenAI with custom system prompt
    const aiResponse = await callOpenAI(lastUserMessage, {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 500,
      systemPrompt: systemMessage
    });

    if (!aiResponse.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get AI response',
        error: aiResponse.error
      });
    }

    return res.json({
      success: true,
      data: {
        message: aiResponse.data,
        usage: aiResponse.usage
      }
    });

  } catch (error) {
    console.error('Error in AI chat:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

