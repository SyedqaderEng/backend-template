import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId, requireRoles } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';
import { supportRepository } from '../database';

const router = Router();

const createTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  category: z.enum(['billing', 'technical', 'account', 'feature_request', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
});

const createMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});

const errorReportSchema = z.object({
  errorType: z.string().max(100),
  message: z.string().max(1000),
  stack: z.string().max(10000).optional(),
  context: z.record(z.unknown()).optional(),
  url: z.string().url().optional(),
});

/**
 * @openapi
 * /v1/support/tickets:
 *   get:
 *     summary: List my support tickets
 *     description: Returns all support tickets for the authenticated user
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [open, in_progress, waiting_on_customer, resolved, closed]
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of support tickets
 */
router.get('/tickets', authMiddleware, async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const status = req.query.status as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  const tickets = await supportRepository.findTicketsByUserId(userId, { status, limit });

  const result = tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @openapi
 * /v1/support/tickets:
 *   post:
 *     summary: Create support ticket
 *     description: Creates a new support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - description
 *               - category
 *             properties:
 *               subject:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 minLength: 20
 *                 maxLength: 5000
 *               category:
 *                 type: string
 *                 enum: [billing, technical, account, feature_request, other]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *     responses:
 *       201:
 *         description: Ticket created successfully
 */
router.post('/tickets', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);

    const validationResult = createTicketSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ApiError(400, 'Validation failed', errors);
    }

    const { subject, description, category, priority } = validationResult.data;

    const ticket = await supportRepository.createTicket({
      user_id: userId,
      subject,
      description,
      category,
      priority,
      status: 'open',
    });

    logger.info({ userId, ticketId: ticket.id, category }, 'Support ticket created');

    res.status(201).json({
      success: true,
      data: {
        id: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/support/tickets/{ticketId}:
 *   get:
 *     summary: Get ticket details
 *     description: Returns details of a specific support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket details
 *       404:
 *         description: Ticket not found
 */
router.get('/tickets/:ticketId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { ticketId } = req.params;

    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket || ticket.user_id !== userId) {
      throw new ApiError(404, 'Ticket not found');
    }

    const messages = await supportRepository.getTicketMessages(ticketId);

    res.status(200).json({
      success: true,
      data: {
        id: ticket.id,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
        resolvedAt: ticket.resolved_at,
        messages: messages.map((m) => ({
          id: m.id,
          message: m.message,
          isStaff: m.is_staff,
          createdAt: m.created_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/support/tickets/{ticketId}/messages:
 *   post:
 *     summary: Add message to ticket
 *     description: Adds a new message to a support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message added successfully
 */
router.post('/tickets/:ticketId/messages', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { ticketId } = req.params;

    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket || ticket.user_id !== userId) {
      throw new ApiError(404, 'Ticket not found');
    }

    if (ticket.status === 'closed') {
      throw new ApiError(400, 'Cannot add messages to a closed ticket');
    }

    const validationResult = createMessageSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ApiError(400, 'Message is required');
    }

    const message = await supportRepository.createMessage({
      ticket_id: ticketId,
      user_id: userId,
      message: validationResult.data.message,
      is_staff: false,
    });

    res.status(201).json({
      success: true,
      data: {
        id: message.id,
        message: message.message,
        createdAt: message.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/support/tickets/{ticketId}/close:
 *   post:
 *     summary: Close ticket
 *     description: Closes a support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket closed
 */
router.post('/tickets/:ticketId/close', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { ticketId } = req.params;

    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket || ticket.user_id !== userId) {
      throw new ApiError(404, 'Ticket not found');
    }

    await supportRepository.closeTicket(ticketId);

    logger.info({ userId, ticketId }, 'Support ticket closed');

    res.status(200).json({
      success: true,
      message: 'Ticket closed successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/support/tickets/{ticketId}/reopen:
 *   post:
 *     summary: Reopen ticket
 *     description: Reopens a closed support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket reopened
 */
router.post('/tickets/:ticketId/reopen', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { ticketId } = req.params;

    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket || ticket.user_id !== userId) {
      throw new ApiError(404, 'Ticket not found');
    }

    if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
      throw new ApiError(400, 'Ticket is not closed');
    }

    await supportRepository.reopenTicket(ticketId);

    res.status(200).json({
      success: true,
      message: 'Ticket reopened successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/support/errors:
 *   post:
 *     summary: Report client error
 *     description: Reports a client-side error for debugging
 *     tags: [Support]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - errorType
 *               - message
 *             properties:
 *               errorType:
 *                 type: string
 *               message:
 *                 type: string
 *               stack:
 *                 type: string
 *               context:
 *                 type: object
 *               url:
 *                 type: string
 *     responses:
 *       201:
 *         description: Error reported successfully
 */
router.post('/errors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = errorReportSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ApiError(400, 'Invalid error report');
    }

    const { errorType, message, stack, context, url } = validationResult.data;

    const report = await supportRepository.createErrorReport({
      user_id: null, // Can be populated from optional auth
      error_type: errorType,
      message,
      stack: stack || null,
      context: context || {},
      url: url || null,
      user_agent: req.headers['user-agent'] || null,
    });

    logger.warn({ errorType, message, url }, 'Client error reported');

    res.status(201).json({
      success: true,
      data: {
        reportId: report.id,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/support/errors/all:
 *   get:
 *     summary: List all error reports (Admin)
 *     description: Returns all error reports. Admin only.
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: errorType
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of error reports
 */
router.get('/errors/all', authMiddleware, requireRoles('admin'), async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const errorType = req.query.errorType as string | undefined;

  const reports = await supportRepository.getErrorReports({ errorType, limit });

  const result = reports.map((r) => ({
    id: r.id,
    errorType: r.error_type,
    message: r.message,
    url: r.url,
    createdAt: r.created_at,
  }));

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @openapi
 * /v1/support/faq:
 *   get:
 *     summary: Get FAQ
 *     description: Returns frequently asked questions
 *     tags: [Support]
 *     responses:
 *       200:
 *         description: FAQ list
 */
router.get('/faq', async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: [
      {
        id: '1',
        question: 'How do I upgrade my plan?',
        answer: 'Go to Settings > Subscription and click on "Upgrade Plan" to see available options.',
        category: 'billing',
      },
      {
        id: '2',
        question: 'How do I cancel my subscription?',
        answer: 'Go to Settings > Subscription and click on "Cancel Subscription". Your plan will remain active until the end of the billing period.',
        category: 'billing',
      },
      {
        id: '3',
        question: 'How do I reset my password?',
        answer: 'Click "Forgot Password" on the login page and follow the instructions sent to your email.',
        category: 'account',
      },
      {
        id: '4',
        question: 'How do I enable two-factor authentication?',
        answer: 'Go to Settings > Security and click "Enable 2FA". Follow the setup wizard to configure your authenticator app.',
        category: 'security',
      },
      {
        id: '5',
        question: 'How do I export my data?',
        answer: 'Go to Settings > Privacy and click "Export My Data". You will receive a download link via email within 24 hours.',
        category: 'privacy',
      },
    ],
  });
});

/**
 * @openapi
 * /v1/support/contact:
 *   get:
 *     summary: Get contact information
 *     description: Returns support contact information
 *     tags: [Support]
 *     responses:
 *       200:
 *         description: Contact information
 */
router.get('/contact', async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      email: 'support@example.com',
      hours: 'Monday - Friday, 9am - 5pm EST',
      responseTime: 'Within 24 hours',
      urgentEmail: 'urgent@example.com',
      documentation: 'https://docs.example.com',
      statusPage: 'https://status.example.com',
    },
  });
});

/**
 * @openapi
 * /v1/support/tickets/all:
 *   get:
 *     summary: List all tickets (Admin)
 *     description: Returns all support tickets. Admin only.
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *       - name: priority
 *         in: query
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of all tickets
 */
router.get('/tickets/all', authMiddleware, requireRoles('admin'), async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  const tickets = await supportRepository.findAllTickets({ status, priority, limit });

  const result = tickets.map((t) => ({
    id: t.id,
    userId: t.user_id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignedTo: t.assigned_to,
    createdAt: t.created_at,
  }));

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @openapi
 * /v1/support/tickets/{ticketId}/assign:
 *   post:
 *     summary: Assign ticket (Admin)
 *     description: Assigns a ticket to a staff member. Admin only.
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assigneeId
 *             properties:
 *               assigneeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ticket assigned
 */
router.post('/tickets/:ticketId/assign', authMiddleware, requireRoles('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticketId } = req.params;
    const { assigneeId } = req.body;

    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    await supportRepository.updateTicket(ticketId, {
      assigned_to: assigneeId,
      status: 'in_progress',
    });

    res.status(200).json({
      success: true,
      message: 'Ticket assigned successfully',
    });
  } catch (error) {
    next(error);
  }
});

export { router as supportRouter };
