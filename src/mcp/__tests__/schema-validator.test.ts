/**
 * Schema Validator Tests
 *
 * Tests for JSON Schema validation
 */

import { SchemaValidator } from '../schema-validator';
import { JsonSchema } from '../message-types';

describe('SchemaValidator', () => {
  describe('Type Validation', () => {
    it('validates required properties', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const valid = SchemaValidator.validate({ name: 'John', age: 30 }, schema);
      expect(valid.valid).toBe(true);

      const invalid = SchemaValidator.validate({ age: 30 }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.some((e) => e.message.includes('required'))).toBe(true);
    });

    it('validates property types', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const valid = SchemaValidator.validate({ name: 'John', age: 30 }, schema);
      expect(valid.valid).toBe(true);

      const invalid = SchemaValidator.validate(
        { name: 'John', age: 'not a number' },
        schema
      );
      expect(invalid.valid).toBe(false);
    });

    it('validates string type', () => {
      const schema: JsonSchema = { type: 'string' };

      expect(SchemaValidator.validate('hello', schema).valid).toBe(true);
      expect(SchemaValidator.validate(123, schema).valid).toBe(false);
    });

    it('validates number type', () => {
      const schema: JsonSchema = { type: 'number' };

      expect(SchemaValidator.validate(123, schema).valid).toBe(true);
      expect(SchemaValidator.validate('123', schema).valid).toBe(false);
    });

    it('validates boolean type', () => {
      const schema: JsonSchema = { type: 'boolean' };

      expect(SchemaValidator.validate(true, schema).valid).toBe(true);
      expect(SchemaValidator.validate(1, schema).valid).toBe(false);
    });

    it('validates array type', () => {
      const schema: JsonSchema = { type: 'array' };

      expect(SchemaValidator.validate([], schema).valid).toBe(true);
      expect(SchemaValidator.validate('not array', schema).valid).toBe(false);
    });

    it('validates object type', () => {
      const schema: JsonSchema = { type: 'object' };

      expect(SchemaValidator.validate({}, schema).valid).toBe(true);
      expect(SchemaValidator.validate([], schema).valid).toBe(false);
    });

    it('validates multiple types', () => {
      const schema: JsonSchema = { type: ['string', 'number'] };

      expect(SchemaValidator.validate('hello', schema).valid).toBe(true);
      expect(SchemaValidator.validate(123, schema).valid).toBe(true);
      expect(SchemaValidator.validate(true, schema).valid).toBe(false);
    });

    it('validates null type', () => {
      const schema: JsonSchema = { type: 'null' };

      expect(SchemaValidator.validate(null, schema).valid).toBe(true);
      expect(SchemaValidator.validate(undefined, schema).valid).toBe(false);
    });
  });

  describe('Numeric Range Validation', () => {
    it('validates numeric ranges', () => {
      const schema: JsonSchema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
      };

      expect(SchemaValidator.validate(50, schema).valid).toBe(true);
      expect(SchemaValidator.validate(0, schema).valid).toBe(true);
      expect(SchemaValidator.validate(100, schema).valid).toBe(true);
      expect(SchemaValidator.validate(-1, schema).valid).toBe(false);
      expect(SchemaValidator.validate(101, schema).valid).toBe(false);
    });

    it('validates minimum only', () => {
      const schema: JsonSchema = { type: 'number', minimum: 10 };

      expect(SchemaValidator.validate(10, schema).valid).toBe(true);
      expect(SchemaValidator.validate(100, schema).valid).toBe(true);
      expect(SchemaValidator.validate(9, schema).valid).toBe(false);
    });

    it('validates maximum only', () => {
      const schema: JsonSchema = { type: 'number', maximum: 50 };

      expect(SchemaValidator.validate(50, schema).valid).toBe(true);
      expect(SchemaValidator.validate(10, schema).valid).toBe(true);
      expect(SchemaValidator.validate(51, schema).valid).toBe(false);
    });
  });

  describe('String Pattern Validation', () => {
    it('validates regex patterns', () => {
      const schema: JsonSchema = {
        type: 'string',
        pattern: '^[a-z]+$',
      };

      expect(SchemaValidator.validate('hello', schema).valid).toBe(true);
      expect(SchemaValidator.validate('Hello', schema).valid).toBe(false);
      expect(SchemaValidator.validate('hello123', schema).valid).toBe(false);
    });

    it('validates email-like pattern', () => {
      const schema: JsonSchema = {
        type: 'string',
        pattern: '^[^@]+@[^@]+\\.[^@]+$',
      };

      expect(SchemaValidator.validate('test@example.com', schema).valid).toBe(true);
      expect(SchemaValidator.validate('invalid.email', schema).valid).toBe(false);
    });

    it('reports invalid regex', () => {
      const schema: JsonSchema = {
        type: 'string',
        pattern: '[invalid(regex',
      };

      const result = SchemaValidator.validate('test', schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Invalid regex'))).toBe(true);
    });
  });

  describe('Enum Validation', () => {
    it('validates enum values', () => {
      const schema: JsonSchema = {
        enum: ['red', 'green', 'blue'],
      };

      expect(SchemaValidator.validate('red', schema).valid).toBe(true);
      expect(SchemaValidator.validate('green', schema).valid).toBe(true);
      expect(SchemaValidator.validate('yellow', schema).valid).toBe(false);
    });

    it('validates mixed type enums', () => {
      const schema: JsonSchema = {
        enum: [1, 'two', null],
      };

      expect(SchemaValidator.validate(1, schema).valid).toBe(true);
      expect(SchemaValidator.validate('two', schema).valid).toBe(true);
      expect(SchemaValidator.validate(null, schema).valid).toBe(true);
      expect(SchemaValidator.validate(2, schema).valid).toBe(false);
    });
  });

  describe('Array Validation', () => {
    it('validates array items', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: { type: 'string' },
      };

      expect(SchemaValidator.validate(['a', 'b', 'c'], schema).valid).toBe(true);
      expect(SchemaValidator.validate(['a', 123, 'c'], schema).valid).toBe(false);
    });

    it('validates nested array items', () => {
      const schema: JsonSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
          },
          required: ['id'],
        },
      };

      expect(
        SchemaValidator.validate(
          [{ id: 1 }, { id: 2 }],
          schema
        ).valid
      ).toBe(true);

      expect(
        SchemaValidator.validate(
          [{ id: 1 }, { name: 'test' }],
          schema
        ).valid
      ).toBe(false);
    });
  });

  describe('Nested Objects', () => {
    it('validates nested objects', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };

      const valid = SchemaValidator.validate(
        {
          user: {
            name: 'John',
            email: 'john@example.com',
          },
        },
        schema
      );
      expect(valid.valid).toBe(true);

      const invalid = SchemaValidator.validate(
        {
          user: {
            email: 'john@example.com',
          },
        },
        schema
      );
      expect(invalid.valid).toBe(false);
    });

    it('validates deeply nested objects', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: { type: 'string' },
                },
                required: ['level3'],
              },
            },
            required: ['level2'],
          },
        },
      };

      const valid = SchemaValidator.validate(
        {
          level1: {
            level2: {
              level3: 'value',
            },
          },
        },
        schema
      );
      expect(valid.valid).toBe(true);
    });
  });

  describe('Error Reporting', () => {
    it('returns validation errors with details', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0 },
        },
        required: ['name', 'age'],
      };

      const result = SchemaValidator.validate(
        { name: 'John', age: -5 },
        schema
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('>= 0'))).toBe(true);
    });

    it('includes path in error messages', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              age: { type: 'number', minimum: 0 },
            },
          },
        },
      };

      const result = SchemaValidator.validate(
        { user: { age: -5 } },
        schema
      );

      expect(result.errors.some((e) => e.path === '$.user.age')).toBe(true);
    });

    it('provides clear error messages', () => {
      const schema: JsonSchema = {
        type: 'string',
      };

      const result = SchemaValidator.validate(123, schema);

      expect(result.errors[0].message).toContain('must be of type');
      expect(result.errors[0].message).toContain('string');
    });
  });

  describe('Complex Scenarios', () => {
    it('validates eventlog_query-like schema', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          logName: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 1000 },
          offset: { type: 'number', minimum: 0 },
          level: { enum: ['Information', 'Warning', 'Error'] },
        },
        required: ['logName'],
      };

      const valid = SchemaValidator.validate(
        {
          logName: 'System',
          limit: 100,
          offset: 0,
          level: 'Error',
        },
        schema
      );
      expect(valid.valid).toBe(true);

      const invalid1 = SchemaValidator.validate(
        {
          logName: 'System',
          limit: 2000,
        },
        schema
      );
      expect(invalid1.valid).toBe(false);

      const invalid2 = SchemaValidator.validate(
        {
          limit: 100,
        },
        schema
      );
      expect(invalid2.valid).toBe(false);
    });

    it('handles empty objects', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          optional: { type: 'string' },
        },
      };

      expect(SchemaValidator.validate({}, schema).valid).toBe(true);
    });

    it('handles null and undefined', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          field: { type: 'string' },
        },
      };

      expect(SchemaValidator.validate(null, schema).valid).toBe(false);
      expect(SchemaValidator.validate(undefined, schema).valid).toBe(false);
    });
  });

  describe('Performance', () => {
    it('validates typical schemas quickly', () => {
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
          age: { type: 'number', minimum: 0, maximum: 150 },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['name', 'email'],
      };

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        SchemaValidator.validate(
          {
            name: 'User',
            email: 'user@example.com',
            age: 25,
            tags: ['tag1', 'tag2'],
          },
          schema
        );
      }

      const duration = Date.now() - start;

      // Should complete 1000 validations in less than 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});
