/**
 * Permission Middleware — Apollo Server Plugin
 *
 * Intercepts GraphQL requests and checks permissions before resolver execution.
 * Maps resolver field names to service IDs for permission checking.
 *
 * SECURITY: This is the first layer of permission enforcement.
 * Per-resolver checks provide defense-in-depth as a second layer.
 * Admin mutations require localhost origin.
 */

import { ApolloServerPlugin } from 'apollo-server-plugin-base';
import { GraphQLError } from 'graphql';
import { PermissionChecker } from '../security/permission-checker';
import { OperationType } from '../security/types';

/**
 * Mapping of GraphQL field names to service IDs and operation types.
 * Fields not listed here bypass permission checks (admin/meta queries).
 */
const FIELD_TO_SERVICE: Record<string, { serviceId: string; operation: OperationType }> = {
  eventLogs: { serviceId: 'eventlog', operation: 'read' },
  fileSearch: { serviceId: 'filesearch', operation: 'read' },
};

/**
 * Fields that bypass all permission checks (read-only meta queries)
 */
const BYPASS_FIELDS = new Set([
  'services',
  'service',
  'health',
  'serviceConfig',
  'allServiceConfigs',
  '__schema',
  '__type',
]);

/**
 * SECURITY: Admin mutations that require localhost origin.
 * These bypass service-level permission checks but require the request
 * to originate from localhost (127.0.0.1, ::1, or ::ffff:127.0.0.1).
 */
const ADMIN_FIELDS = new Set([
  'registerService',
  'startService',
  'stopService',
  'restartService',
  'enableService',
  'disableService',
  'setPermissionLevel',
  'setPiiAnonymization',
  'resetServiceConfig',
]);

/**
 * SECURITY: Check if a remote address is localhost.
 * Accepts IPv4 127.0.0.1, IPv6 ::1, and IPv4-mapped IPv6 ::ffff:127.0.0.1.
 */
export function isLocalhostAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  const normalized = remoteAddress.trim();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  );
}

/**
 * Extract top-level field names from a GraphQL operation.
 * SECURITY: Throws on parse failure to ensure fail-closed behavior.
 */
function getTopLevelFields(document: any): string[] {
  const fields: string[] = [];
  try {
    for (const definition of document.definitions) {
      if (definition.kind === 'OperationDefinition') {
        for (const selection of definition.selectionSet.selections) {
          if (selection.kind === 'Field') {
            fields.push(selection.name.value);
          }
        }
      }
    }
  } catch {
    // SECURITY: Fail-closed — if we can't parse the document, deny the request
    throw new GraphQLError('Permission denied: unable to parse request', {
      extensions: { code: 'PERMISSION_DENIED' },
    });
  }
  return fields;
}

/**
 * Create the permission middleware Apollo plugin
 */
export function createPermissionPlugin(
  permissionChecker: PermissionChecker
): ApolloServerPlugin {
  return {
    async requestDidStart(requestContext: any) {
      // Extract remote address from the HTTP request
      const req = requestContext?.context?.req || requestContext?.req;
      const remoteAddress = req?.connection?.remoteAddress || req?.socket?.remoteAddress || req?.ip;

      return {
        async responseForOperation(opContext: any) {
          const { document } = opContext;
          if (!document) return null;

          const fields = getTopLevelFields(document);

          for (const field of fields) {
            // Skip read-only meta queries
            if (BYPASS_FIELDS.has(field)) {
              continue;
            }

            // SECURITY: Admin mutations require localhost origin
            if (ADMIN_FIELDS.has(field)) {
              if (!isLocalhostAddress(remoteAddress)) {
                throw new GraphQLError('Permission denied', {
                  extensions: { code: 'PERMISSION_DENIED' },
                });
              }
              continue;
            }

            const mapping = FIELD_TO_SERVICE[field];
            if (!mapping) {
              // Unknown field — let Apollo handle it (may be valid or error)
              continue;
            }

            const result = permissionChecker.check(
              mapping.serviceId,
              mapping.operation
            );

            if (!result.allowed) {
              throw new GraphQLError('Permission denied', {
                extensions: {
                  code: 'PERMISSION_DENIED',
                },
              });
            }
          }

          return null; // Continue with normal execution
        },
      };
    },
  };
}
