import { Router, Request, Response } from 'express';

const router = Router();

/**
 * @openapi
 * /test/echo:
 *   post:
 *     summary: Echo endpoint for testing
 *     description: Returns the exact JSON payload received. Useful for automated testing.
 *     tags: [Test]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *           example:
 *             message: "Hello, World!"
 *             data: { "key": "value" }
 *     responses:
 *       200:
 *         description: Echoed payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 echo:
 *                   type: object
 *                   description: The exact payload that was sent
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     method:
 *                       type: string
 *                     contentType:
 *                       type: string
 */
router.post('/echo', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    echo: req.body,
    metadata: {
      timestamp: new Date().toISOString(),
      method: req.method,
      contentType: req.headers['content-type'],
    },
  });
});

/**
 * @openapi
 * /test/headers:
 *   get:
 *     summary: Echo headers for testing
 *     description: Returns all request headers. Useful for debugging.
 *     tags: [Test]
 *     responses:
 *       200:
 *         description: Request headers
 */
router.get('/headers', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    headers: req.headers,
  });
});

/**
 * @openapi
 * /test/delay/{ms}:
 *   get:
 *     summary: Delayed response for testing
 *     description: Returns a response after the specified delay in milliseconds (max 5000ms).
 *     tags: [Test]
 *     parameters:
 *       - name: ms
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 5000
 *     responses:
 *       200:
 *         description: Delayed response
 */
router.get('/delay/:ms', async (req: Request, res: Response) => {
  const delay = Math.min(parseInt(req.params.ms) || 0, 5000);
  await new Promise((resolve) => setTimeout(resolve, delay));

  res.status(200).json({
    success: true,
    delayed: delay,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @openapi
 * /test/status/{code}:
 *   get:
 *     summary: Return specific status code
 *     description: Returns the specified HTTP status code. Useful for testing error handling.
 *     tags: [Test]
 *     parameters:
 *       - name: code
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 100
 *           maximum: 599
 *     responses:
 *       default:
 *         description: Response with specified status code
 */
router.get('/status/:code', (req: Request, res: Response) => {
  const code = parseInt(req.params.code);
  if (code < 100 || code > 599) {
    res.status(400).json({ success: false, message: 'Invalid status code' });
    return;
  }

  res.status(code).json({
    success: code < 400,
    statusCode: code,
    timestamp: new Date().toISOString(),
  });
});

export { router as testRouter };
