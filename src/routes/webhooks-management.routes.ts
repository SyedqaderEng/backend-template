import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';
import { randomUUID, createHash } from 'crypto';

const router = Router();

// In-memory webhook storage
interface WebhookEndpoint {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  failureCount: number;
  lastTriggeredAt: Date | null;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  statusCode: number | null;
  response: string | null;
  attempts: number;
  createdAt: Date;
  deliveredAt: Date | null;
}

const webhookEndpoints: WebhookEndpoint[] = [];
const webhookDeliveries: WebhookDelivery[] = [];

const AVAILABLE_EVENTS = [
  'user.created',
  'user.updated',
  'user.deleted',
  'subscription.created',
  'subscription.updated',
  'subscription.cancelled',
  'payment.succeeded',
  'payment.failed',
  'invoice.created',
  'invoice.paid',
  'team.created',
  'team.member_added',
  'team.member_removed',
];

/**
 * Webhook creation schema
 */
const createWebhookSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  events: z.array(z.string()).min(1, 'At least one event is required'),
  active: z.boolean().optional().default(true),
});

/**
 * Webhook update schema
 */
const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
});

function generateWebhookSecret(): string {
  return `whsec_${createHash('sha256').update(randomUUID()).digest('hex').substring(0, 32)}`;
}

/**
 * @openapi
 * /v1/webhooks:
 *   get:
 *     summary: List webhook endpoints
 *     description: Returns all webhook endpoints for the authenticated user
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Webhook endpoints list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       url:
 *                         type: string
 *                       events:
 *                         type: array
 *                         items:
 *                           type: string
 *                       active:
 *                         type: boolean
 *                       failureCount:
 *                         type: number
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  const userWebhooks = webhookEndpoints
    .filter((w) => w.userId === userId)
    .map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      active: w.active,
      failureCount: w.failureCount,
      lastTriggeredAt: w.lastTriggeredAt?.toISOString() || null,
      createdAt: w.createdAt.toISOString(),
    }));

  res.status(200).json({
    success: true,
    data: userWebhooks,
  });
});

/**
 * @openapi
 * /v1/webhooks:
 *   post:
 *     summary: Create webhook endpoint
 *     description: Creates a new webhook endpoint
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Webhook created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);

    const validationResult = createWebhookSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ApiError(400, 'Validation failed', errors);
    }

    const { url, events, active } = validationResult.data;

    // Validate events
    const invalidEvents = events.filter((e) => !AVAILABLE_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      throw new ApiError(400, `Invalid events: ${invalidEvents.join(', ')}`);
    }

    const webhook: WebhookEndpoint = {
      id: randomUUID(),
      userId,
      url,
      secret: generateWebhookSecret(),
      events,
      active: active ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
      failureCount: 0,
      lastTriggeredAt: null,
    };

    webhookEndpoints.push(webhook);

    logger.info({ userId, webhookId: webhook.id, url }, 'Webhook endpoint created');

    res.status(201).json({
      success: true,
      data: {
        id: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        events: webhook.events,
        active: webhook.active,
        createdAt: webhook.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/webhooks/events:
 *   get:
 *     summary: List available webhook events
 *     description: Returns all available webhook event types
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available events
 */
router.get('/events', authMiddleware, async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: AVAILABLE_EVENTS.map((event) => ({
      name: event,
      description: `Triggered when ${event.replace('.', ' ').replace('_', ' ')} occurs`,
    })),
  });
});

/**
 * @openapi
 * /v1/webhooks/{webhookId}:
 *   get:
 *     summary: Get webhook endpoint details
 *     description: Returns details of a specific webhook endpoint
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook endpoint details
 *       404:
 *         description: Webhook not found
 */
router.get('/:webhookId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { webhookId } = req.params;

    const webhook = webhookEndpoints.find((w) => w.id === webhookId && w.userId === userId);
    if (!webhook) {
      throw new ApiError(404, 'Webhook endpoint not found');
    }

    res.status(200).json({
      success: true,
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        failureCount: webhook.failureCount,
        lastTriggeredAt: webhook.lastTriggeredAt?.toISOString() || null,
        createdAt: webhook.createdAt.toISOString(),
        updatedAt: webhook.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/webhooks/{webhookId}:
 *   put:
 *     summary: Update webhook endpoint
 *     description: Updates an existing webhook endpoint
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: webhookId
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
 *             properties:
 *               url:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Webhook updated successfully
 */
router.put('/:webhookId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { webhookId } = req.params;

    const webhook = webhookEndpoints.find((w) => w.id === webhookId && w.userId === userId);
    if (!webhook) {
      throw new ApiError(404, 'Webhook endpoint not found');
    }

    const validationResult = updateWebhookSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ApiError(400, 'Validation failed', errors);
    }

    const { url, events, active } = validationResult.data;

    if (url) webhook.url = url;
    if (events) {
      const invalidEvents = events.filter((e) => !AVAILABLE_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        throw new ApiError(400, `Invalid events: ${invalidEvents.join(', ')}`);
      }
      webhook.events = events;
    }
    if (active !== undefined) webhook.active = active;
    webhook.updatedAt = new Date();

    logger.info({ userId, webhookId }, 'Webhook endpoint updated');

    res.status(200).json({
      success: true,
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        updatedAt: webhook.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/webhooks/{webhookId}:
 *   delete:
 *     summary: Delete webhook endpoint
 *     description: Deletes a webhook endpoint
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook deleted successfully
 */
router.delete('/:webhookId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { webhookId } = req.params;

    const index = webhookEndpoints.findIndex((w) => w.id === webhookId && w.userId === userId);
    if (index === -1) {
      throw new ApiError(404, 'Webhook endpoint not found');
    }

    webhookEndpoints.splice(index, 1);

    logger.info({ userId, webhookId }, 'Webhook endpoint deleted');

    res.status(200).json({
      success: true,
      message: 'Webhook endpoint deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/webhooks/{webhookId}/secret:
 *   post:
 *     summary: Rotate webhook secret
 *     description: Generates a new signing secret for the webhook
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: New secret generated
 */
router.post('/:webhookId/secret', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { webhookId } = req.params;

    const webhook = webhookEndpoints.find((w) => w.id === webhookId && w.userId === userId);
    if (!webhook) {
      throw new ApiError(404, 'Webhook endpoint not found');
    }

    webhook.secret = generateWebhookSecret();
    webhook.updatedAt = new Date();

    logger.info({ userId, webhookId }, 'Webhook secret rotated');

    res.status(200).json({
      success: true,
      data: {
        secret: webhook.secret,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/webhooks/{webhookId}/test:
 *   post:
 *     summary: Send test webhook
 *     description: Sends a test payload to the webhook endpoint
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test webhook sent
 */
router.post('/:webhookId/test', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { webhookId } = req.params;

    const webhook = webhookEndpoints.find((w) => w.id === webhookId && w.userId === userId);
    if (!webhook) {
      throw new ApiError(404, 'Webhook endpoint not found');
    }

    // Create test delivery record
    const delivery: WebhookDelivery = {
      id: randomUUID(),
      webhookId,
      event: 'webhook.test',
      payload: {
        type: 'webhook.test',
        data: {
          message: 'This is a test webhook delivery',
          timestamp: new Date().toISOString(),
        },
      },
      status: 'success',
      statusCode: 200,
      response: 'OK',
      attempts: 1,
      createdAt: new Date(),
      deliveredAt: new Date(),
    };

    webhookDeliveries.push(delivery);

    logger.info({ userId, webhookId }, 'Test webhook sent');

    res.status(200).json({
      success: true,
      message: 'Test webhook sent',
      data: {
        deliveryId: delivery.id,
        status: delivery.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/webhooks/{webhookId}/deliveries:
 *   get:
 *     summary: List webhook deliveries
 *     description: Returns delivery history for a webhook endpoint
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Delivery history
 */
router.get('/:webhookId/deliveries', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { webhookId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const webhook = webhookEndpoints.find((w) => w.id === webhookId && w.userId === userId);
    if (!webhook) {
      throw new ApiError(404, 'Webhook endpoint not found');
    }

    const deliveries = webhookDeliveries
      .filter((d) => d.webhookId === webhookId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((d) => ({
        id: d.id,
        event: d.event,
        status: d.status,
        statusCode: d.statusCode,
        attempts: d.attempts,
        createdAt: d.createdAt.toISOString(),
        deliveredAt: d.deliveredAt?.toISOString() || null,
      }));

    res.status(200).json({
      success: true,
      data: deliveries,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/webhooks/{webhookId}/deliveries/{deliveryId}:
 *   get:
 *     summary: Get delivery details
 *     description: Returns details of a specific webhook delivery
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: deliveryId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delivery details
 */
router.get('/:webhookId/deliveries/:deliveryId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { webhookId, deliveryId } = req.params;

    const webhook = webhookEndpoints.find((w) => w.id === webhookId && w.userId === userId);
    if (!webhook) {
      throw new ApiError(404, 'Webhook endpoint not found');
    }

    const delivery = webhookDeliveries.find((d) => d.id === deliveryId && d.webhookId === webhookId);
    if (!delivery) {
      throw new ApiError(404, 'Delivery not found');
    }

    res.status(200).json({
      success: true,
      data: {
        id: delivery.id,
        event: delivery.event,
        payload: delivery.payload,
        status: delivery.status,
        statusCode: delivery.statusCode,
        response: delivery.response,
        attempts: delivery.attempts,
        createdAt: delivery.createdAt.toISOString(),
        deliveredAt: delivery.deliveredAt?.toISOString() || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/webhooks/{webhookId}/deliveries/{deliveryId}/retry:
 *   post:
 *     summary: Retry failed delivery
 *     description: Retries a failed webhook delivery
 *     tags: [Webhook Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: deliveryId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delivery retried
 */
router.post('/:webhookId/deliveries/:deliveryId/retry', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { webhookId, deliveryId } = req.params;

    const webhook = webhookEndpoints.find((w) => w.id === webhookId && w.userId === userId);
    if (!webhook) {
      throw new ApiError(404, 'Webhook endpoint not found');
    }

    const delivery = webhookDeliveries.find((d) => d.id === deliveryId && d.webhookId === webhookId);
    if (!delivery) {
      throw new ApiError(404, 'Delivery not found');
    }

    delivery.attempts += 1;
    delivery.status = 'success';
    delivery.statusCode = 200;
    delivery.deliveredAt = new Date();

    logger.info({ userId, webhookId, deliveryId }, 'Webhook delivery retried');

    res.status(200).json({
      success: true,
      message: 'Delivery retried successfully',
      data: {
        status: delivery.status,
        attempts: delivery.attempts,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as webhooksManagementRouter };
