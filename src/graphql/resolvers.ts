import { GraphQLError } from 'graphql';
import { profileRepository } from '../database';
import { getCurrentSubscription, getPlanLimits, getAllPlans } from '../services';
import { logger } from '../utils/logger';

/**
 * GraphQL Context type containing the authenticated user
 */
export interface GraphQLContext {
  user: {
    userId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
}

/**
 * Helper to ensure user is authenticated
 */
function requireAuth(context: GraphQLContext): string {
  if (!context.user?.userId) {
    throw new GraphQLError('Authentication required', {
      extensions: {
        code: 'UNAUTHENTICATED',
        http: { status: 401 },
      },
    });
  }
  return context.user.userId;
}

/**
 * GraphQL Resolvers
 */
export const resolvers = {
  Query: {
    /**
     * Get the authenticated user's profile
     */
    me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const clerkUserId = requireAuth(context);

      logger.debug({ clerkUserId }, 'GraphQL: Fetching user profile');

      // Fetch profile from database
      let profile = await profileRepository.findByClerkUserId(clerkUserId);

      // If profile doesn't exist, create it with data from context
      if (!profile) {
        logger.info({ clerkUserId }, 'GraphQL: Profile not found, creating from context');

        profile = await profileRepository.create({
          clerk_user_id: clerkUserId,
          email: context.user?.email || '',
          first_name: context.user?.firstName || null,
          last_name: context.user?.lastName || null,
        });
      }

      return {
        id: profile.id,
        clerkUserId: profile.clerk_user_id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        avatarUrl: profile.avatar_url,
        plan: profile.plan,
        subscriptionStatus: profile.subscription_status,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      };
    },

    /**
     * Get the authenticated user's current subscription
     */
    currentSubscription: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const clerkUserId = requireAuth(context);

      logger.debug({ clerkUserId }, 'GraphQL: Fetching current subscription');

      const subscription = await getCurrentSubscription(clerkUserId);
      const limits = getPlanLimits(subscription.plan.id as 'free' | 'basic' | 'pro' | 'enterprise');

      return {
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          description: subscription.plan.description,
          price: subscription.plan.price,
          currency: subscription.plan.currency,
          interval: subscription.plan.interval,
          features: subscription.plan.features,
        },
        status: subscription.status,
        isActive: subscription.isActive,
        isPastDue: subscription.isPastDue,
        isCancelled: subscription.isCancelled,
        isTrialing: subscription.isTrialing,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
        limits: {
          requestsPerDay: limits.requestsPerDay,
          apiAccessEnabled: limits.apiAccessEnabled,
          prioritySupport: limits.prioritySupport,
          customIntegrations: limits.customIntegrations,
        },
      };
    },

    /**
     * Get all available subscription plans
     */
    plans: () => {
      logger.debug('GraphQL: Fetching all plans');

      const plans = getAllPlans();
      return plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        features: plan.features,
      }));
    },
  },
};
