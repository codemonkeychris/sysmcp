/**
 * Permission Middleware — Apollo Server Plugin
 *
 * Intercepts GraphQL requests and checks permissions before resolver execution.
 * Maps resolver field names to service IDs for permission checking.
 *
 * SECURITY: This is the first layer of permission enforcement.
 * Per-resolver checks provide defense-in-depth as a second layer.
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
 * Fields that bypass permission checks (admin and meta queries/mutations)
 */
const BYPASS_FIELDS = new Set([
  'services',
  'service',
  'health',
  'serviceConfig',
  'allServiceConfigs',
  'registerService',
  'startService',
  'stopService',
  'restartService',
  'enableService',
  'disableService',
  'setPermissionLevel',
  'setPiiAnonymization',
  'resetServiceConfig',
  '__schema',
  '__type',
]);

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
    async requestDidStart() {
      return {
        async responseForOperation(requestContext: any) {
          const { document } = requestContext;
          if (!document) return null;

          const fields = getTopLevelFields(document);

          for (const field of fields) {
            // Skip fields that bypass permission checks
            if (BYPASS_FIELDS.has(field)) {
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
