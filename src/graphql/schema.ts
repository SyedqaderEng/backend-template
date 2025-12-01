/**
 * GraphQL Type Definitions
 * Defines the schema for User, Plan, and Subscription types
 */
export const typeDefs = `#graphql
  """
  User profile information
  """
  type User {
    id: ID!
    clerkUserId: String!
    email: String!
    firstName: String
    lastName: String
    avatarUrl: String
    plan: PlanId!
    subscriptionStatus: String
    createdAt: String!
    updatedAt: String!
  }

  """
  Available subscription plan identifiers
  """
  enum PlanId {
    free
    basic
    pro
    enterprise
  }

  """
  Subscription plan details
  """
  type Plan {
    id: PlanId!
    name: String!
    description: String!
    price: Int!
    currency: String!
    interval: String!
    features: [String!]!
  }

  """
  Plan usage limits
  """
  type PlanLimits {
    requestsPerDay: Int!
    apiAccessEnabled: Boolean!
    prioritySupport: Boolean!
    customIntegrations: Boolean!
  }

  """
  User's current subscription status
  """
  type Subscription {
    plan: Plan!
    status: String
    isActive: Boolean!
    isPastDue: Boolean!
    isCancelled: Boolean!
    isTrialing: Boolean!
    currentPeriodEnd: String
    cancelAtPeriodEnd: Boolean!
    limits: PlanLimits!
  }

  """
  Root Query type
  """
  type Query {
    """
    Get the authenticated user's profile
    """
    me: User

    """
    Get the authenticated user's current subscription
    """
    currentSubscription: Subscription

    """
    Get all available subscription plans
    """
    plans: [Plan!]!
  }
`;
