/**
 * JSON Schema Validator
 *
 * Simple, focused JSON Schema validator for tool input validation
 */

import { JsonSchema } from './message-types';

/**
 * Validation error detail
 */
export interface ValidationErrorDetail {
  path?: string;
  message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrorDetail[];
}

/**
 * JSON Schema Validator
 *
 * Validates objects against JSON Schema with support for:
 * - Type checking
 * - Required fields
 * - Numeric ranges (minimum, maximum)
 * - String patterns (regex)
 * - Enums
 * - Arrays with item validation
 * - Nested objects
 */
export class SchemaValidator {
  /**
   * Validate data against a JSON Schema
   *
   * @param data Data to validate
   * @param schema JSON Schema to validate against
   * @param path Current path in nested object (for error reporting)
   * @returns Validation result with any errors found
   */
  static validate(
    data: unknown,
    schema: JsonSchema,
    path: string = '$'
  ): ValidationResult {
    const errors: ValidationErrorDetail[] = [];

    // Type validation
    if (schema.type) {
      const typeError = this.validateType(data, schema.type, path);
      if (typeError) {
        errors.push(typeError);
        // Early return for type mismatch to avoid further validation errors
        if (!Array.isArray(schema.type) || !schema.type.includes(typeof data)) {
          return { valid: false, errors };
        }
      }
    }

    // If data is null or undefined, only type validation applies
    if (data === null || data === undefined) {
      return { valid: errors.length === 0, errors };
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(data)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
      });
    }

    // String validations
    if (typeof data === 'string') {
      if (schema.pattern) {
        try {
          const regex = new RegExp(schema.pattern);
          if (!regex.test(data)) {
            errors.push({
              path,
              message: `String must match pattern: ${schema.pattern}`,
            });
          }
        } catch (err) {
          errors.push({
            path,
            message: `Invalid regex pattern: ${schema.pattern}`,
          });
        }
      }
    }

    // Numeric validations
    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push({
          path,
          message: `Value must be >= ${schema.minimum}`,
        });
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push({
          path,
          message: `Value must be <= ${schema.maximum}`,
        });
      }
    }

    // Object property validation
    if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
      const obj = data as Record<string, unknown>;

      // Check required fields
      if (schema.required) {
        for (const requiredField of schema.required) {
          if (!(requiredField in obj)) {
            errors.push({
              path: `${path}.${requiredField}`,
              message: 'Field is required',
            });
          }
        }
      }

      // Validate properties
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in obj) {
            const propErrors = this.validate(
              obj[key],
              propSchema,
              `${path}.${key}`
            );
            errors.push(...propErrors.errors);
          }
        }
      }
    }

    // Array validation
    if (Array.isArray(data)) {
      if (schema.items) {
        for (let i = 0; i < data.length; i++) {
          const itemErrors = this.validate(
            data[i],
            schema.items,
            `${path}[${i}]`
          );
          errors.push(...itemErrors.errors);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate type of a value
   */
  private static validateType(
    data: unknown,
    schemaType: string | string[],
    path: string
  ): ValidationErrorDetail | null {
    const types = Array.isArray(schemaType) ? schemaType : [schemaType];

    let actualType: string;
    if (data === null) {
      actualType = 'null';
    } else if (Array.isArray(data)) {
      actualType = 'array';
    } else {
      actualType = typeof data;
    }

    // null is special-cased
    if (data === null && types.includes('null')) {
      return null;
    }

    if (!types.includes(actualType)) {
      return {
        path,
        message: `Value must be of type: ${types.join(', ')}, got ${actualType}`,
      };
    }

    return null;
  }
}
