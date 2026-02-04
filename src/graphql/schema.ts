/**
 * GraphQL Schema Definition Language
 */

export const typeDefs = `#graphql
  enum ServiceState {
    DISABLED
    STARTING
    READY
    ERROR
    STOPPING
  }

  type Service {
    name: String!
    type: String!
    state: ServiceState!
    errorMessage: String
    startedAt: String
    requiredPermissions: [String!]
  }

  type HealthStatus {
    status: String!
    uptime: Int!
    services: Int!
    timestamp: String!
  }

  type ServiceRegistrationResult {
    success: Boolean!
    service: Service
    error: String
  }

  type ServiceOperationResult {
    success: Boolean!
    service: Service
    error: String
  }

  input RegisterServiceInput {
    name: String!
    type: String!
    requiredPermissions: [String!]
    config: String
  }

  type Query {
    services: [Service!]!
    service(name: String!): Service
    health: HealthStatus!
  }

  type Mutation {
    registerService(input: RegisterServiceInput!): ServiceRegistrationResult!
    startService(name: String!): ServiceOperationResult!
    stopService(name: String!): ServiceOperationResult!
    restartService(name: String!): ServiceOperationResult!
  }
`;
