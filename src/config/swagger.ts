import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

/**
 * OpenAPI/Swagger configuration
 */
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Backend API',
    version: '1.0.0',
    description: `
A comprehensive backend API built with Express.js and TypeScript.

## Features
- **Authentication**: JWT-based authentication via Clerk
- **User Management**: User profile CRUD operations
- **Subscriptions**: Stripe-powered subscription management
- **Billing**: Customer billing portal access
- **File Uploads**: Secure file upload via UploadThing
- **Email**: Transactional emails via Resend

## Authentication
Most endpoints require authentication. Include a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`
    `,
    contact: {
      name: 'API Support',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}/api`,
      description: 'Development server',
    },
    {
      url: '{baseUrl}/api',
      description: 'Custom server',
      variables: {
        baseUrl: {
          default: 'http://localhost:3000',
          description: 'Base URL of the API server',
        },
      },
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from Clerk authentication',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          message: {
            type: 'string',
            example: 'An error occurred',
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            example: 'ok',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          uptime: {
            type: 'number',
            description: 'Server uptime in seconds',
          },
          version: {
            type: 'string',
            example: '1.0.0',
          },
          environment: {
            type: 'string',
            enum: ['development', 'staging', 'production', 'test'],
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          clerk_user_id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          first_name: { type: 'string', nullable: true },
          last_name: { type: 'string', nullable: true },
          avatar_url: { type: 'string', format: 'uri', nullable: true },
          plan: {
            type: 'string',
            enum: ['free', 'basic', 'pro', 'enterprise'],
          },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Plan: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            enum: ['free', 'basic', 'pro', 'enterprise'],
          },
          name: { type: 'string' },
          description: { type: 'string' },
          price: {
            type: 'number',
            description: 'Price in cents',
          },
          currency: { type: 'string', example: 'usd' },
          interval: { type: 'string', example: 'month' },
          features: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      Subscription: {
        type: 'object',
        properties: {
          plan: { $ref: '#/components/schemas/Plan' },
          status: {
            type: 'string',
            enum: ['active', 'cancelled', 'past_due', 'trialing', 'incomplete'],
            nullable: true,
          },
          isActive: { type: 'boolean' },
          isPastDue: { type: 'boolean' },
          isCancelled: { type: 'boolean' },
          isTrialing: { type: 'boolean' },
          currentPeriodEnd: { type: 'string', format: 'date-time', nullable: true },
          cancelAtPeriodEnd: { type: 'boolean' },
          limits: {
            type: 'object',
            properties: {
              requestsPerDay: { type: 'number' },
              apiAccessEnabled: { type: 'boolean' },
              prioritySupport: { type: 'boolean' },
              customIntegrations: { type: 'boolean' },
            },
          },
        },
      },
      UploadConfig: {
        type: 'object',
        properties: {
          allowedFileTypes: {
            type: 'array',
            items: { type: 'string' },
          },
          maxFileSize: { type: 'number' },
          maxFileSizeMB: { type: 'number' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'Authorization token required',
            },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'Insufficient permissions',
            },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'Resource not found',
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation failed',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'Validation failed',
              errors: [{ field: 'email', message: 'Invalid email format' }],
            },
          },
        },
      },
      ServiceUnavailable: {
        description: 'Service unavailable',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'Service is not configured',
            },
          },
        },
      },
    },
  },
  tags: [
    {
      name: 'Health',
      description: 'Health check endpoints',
    },
    {
      name: 'Users',
      description: 'User profile management',
    },
    {
      name: 'Subscriptions',
      description: 'Subscription and plan management',
    },
    {
      name: 'Billing',
      description: 'Billing portal and payment management',
    },
    {
      name: 'Upload',
      description: 'File upload operations',
    },
    {
      name: 'Webhooks',
      description: 'Webhook endpoints for external services',
    },
  ],
};

/**
 * Swagger JSDoc options
 */
const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  // Path to the API docs files
  apis: [
    './src/routes/*.ts',
    './src/routes/*.js',
  ],
};

/**
 * Generate OpenAPI specification
 */
export const swaggerSpec = swaggerJsdoc(options);

/**
 * Swagger UI options
 */
export const swaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Backend API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
  },
};
