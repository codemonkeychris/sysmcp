/**
 * Tests for GraphQL Schema
 */

import { typeDefs } from '../schema';
import { buildSchema, GraphQLEnumType, GraphQLObjectType } from 'graphql';

describe('GraphQL Schema', () => {
  describe('Schema validation', () => {
    it('should build valid schema without errors', () => {
      expect(() => {
        buildSchema(typeDefs);
      }).not.toThrow();
    });

    it('should define EventLevel enum', () => {
      const schema = buildSchema(typeDefs);
      const eventLevelType = schema.getType('EventLevel');

      expect(eventLevelType).toBeDefined();
      expect((eventLevelType as GraphQLEnumType).getValues().map(v => v.name)).toEqual([
        'ERROR',
        'WARNING',
        'INFO',
        'VERBOSE',
        'DEBUG'
      ]);
    });

    it('should define EventLogEntry type', () => {
      const schema = buildSchema(typeDefs);
      const entryType = schema.getType('EventLogEntry');

      expect(entryType).toBeDefined();
      const fields = (entryType as GraphQLObjectType).getFields();

      expect(Object.keys(fields)).toContain('id');
      expect(Object.keys(fields)).toContain('timestamp');
      expect(Object.keys(fields)).toContain('level');
      expect(Object.keys(fields)).toContain('source');
      expect(Object.keys(fields)).toContain('eventId');
      expect(Object.keys(fields)).toContain('username');
      expect(Object.keys(fields)).toContain('computername');
      expect(Object.keys(fields)).toContain('message');
    });

    it('should define PageInfo type', () => {
      const schema = buildSchema(typeDefs);
      const pageInfoType = schema.getType('PageInfo');

      expect(pageInfoType).toBeDefined();
      const fields = (pageInfoType as GraphQLObjectType).getFields();

      expect(Object.keys(fields)).toContain('hasNextPage');
      expect(Object.keys(fields)).toContain('hasPreviousPage');
      expect(Object.keys(fields)).toContain('startCursor');
      expect(Object.keys(fields)).toContain('endCursor');
    });

    it('should define EventLogQueryMetrics type', () => {
      const schema = buildSchema(typeDefs);
      const metricsType = schema.getType('EventLogQueryMetrics');

      expect(metricsType).toBeDefined();
      const fields = (metricsType as GraphQLObjectType).getFields();

      expect(Object.keys(fields)).toContain('queryCount');
      expect(Object.keys(fields)).toContain('responseDurationMs');
      expect(Object.keys(fields)).toContain('resultsReturned');
    });

    it('should define EventLogResult type', () => {
      const schema = buildSchema(typeDefs);
      const resultType = schema.getType('EventLogResult');

      expect(resultType).toBeDefined();
      const fields = (resultType as GraphQLObjectType).getFields();

      expect(Object.keys(fields)).toContain('entries');
      expect(Object.keys(fields)).toContain('pageInfo');
      expect(Object.keys(fields)).toContain('totalCount');
      expect(Object.keys(fields)).toContain('metrics');
    });
  });

  describe('Query type', () => {
    let schema: any;

    beforeEach(() => {
      schema = buildSchema(typeDefs);
    });

    it('should have eventLogs query', () => {
      const queryType = schema.getQueryType();
      const fields = queryType.getFields();

      expect(Object.keys(fields)).toContain('eventLogs');
    });

    it('should have eventLogs query with required parameters', () => {
      const queryType = schema.getQueryType();
      const eventLogsField = queryType.getFields().eventLogs;

      const argNames = eventLogsField.args.map((arg: any) => arg.name);

      expect(argNames).toContain('limit');
      expect(argNames).toContain('offset');
      expect(argNames).toContain('logName');
      expect(argNames).toContain('minLevel');
      expect(argNames).toContain('source');
      expect(argNames).toContain('startTime');
      expect(argNames).toContain('endTime');
      expect(argNames).toContain('messageContains');
    });

    it('should have logName as required parameter', () => {
      const queryType = schema.getQueryType();
      const eventLogsField = queryType.getFields().eventLogs;

      const logNameArg = eventLogsField.args.find((arg: any) => arg.name === 'logName');

      expect(logNameArg).toBeDefined();
      expect(logNameArg.type.toString()).toBe('String!');
    });

    it('should have optional parameters', () => {
      const queryType = schema.getQueryType();
      const eventLogsField = queryType.getFields().eventLogs;

      const minLevelArg = eventLogsField.args.find((arg: any) => arg.name === 'minLevel');
      const sourceArg = eventLogsField.args.find((arg: any) => arg.name === 'source');
      const startTimeArg = eventLogsField.args.find((arg: any) => arg.name === 'startTime');

      expect(minLevelArg).toBeDefined();
      expect(sourceArg).toBeDefined();
      expect(startTimeArg).toBeDefined();

      // Optional args should not have ! at the end
      expect(minLevelArg.type.toString()).not.toContain('!');
      expect(sourceArg.type.toString()).not.toContain('!');
      expect(startTimeArg.type.toString()).not.toContain('!');
    });

    it('should have limit with default value of 1000', () => {
      const queryType = schema.getQueryType();
      const eventLogsField = queryType.getFields().eventLogs;

      const limitArg = eventLogsField.args.find((arg: any) => arg.name === 'limit');

      expect(limitArg).toBeDefined();
      expect(limitArg.defaultValue).toBe(1000);
    });

    it('should have offset with default value of 0', () => {
      const queryType = schema.getQueryType();
      const eventLogsField = queryType.getFields().eventLogs;

      const offsetArg = eventLogsField.args.find((arg: any) => arg.name === 'offset');

      expect(offsetArg).toBeDefined();
      expect(offsetArg.defaultValue).toBe(0);
    });

    it('should return EventLogResult type', () => {
      const queryType = schema.getQueryType();
      const eventLogsField = queryType.getFields().eventLogs;

      expect(eventLogsField.type.toString()).toBe('EventLogResult!');
    });

    it('should preserve existing Query fields', () => {
      const queryType = schema.getQueryType();
      const fields = queryType.getFields();

      expect(Object.keys(fields)).toContain('services');
      expect(Object.keys(fields)).toContain('service');
      expect(Object.keys(fields)).toContain('health');
    });
  });

  describe('Type field compatibility', () => {
    let schema: any;

    beforeEach(() => {
      schema = buildSchema(typeDefs);
    });

    it('EventLogEntry.level should be EventLevel enum', () => {
      const entryType = schema.getType('EventLogEntry');
      const levelField = entryType.getFields().level;

      expect(levelField.type.toString()).toBe('EventLevel!');
    });

    it('EventLogResult.entries should be array of EventLogEntry', () => {
      const resultType = schema.getType('EventLogResult');
      const entriesField = resultType.getFields().entries;

      expect(entriesField.type.toString()).toBe('[EventLogEntry!]!');
    });

    it('EventLogResult.pageInfo should be PageInfo', () => {
      const resultType = schema.getType('EventLogResult');
      const pageInfoField = resultType.getFields().pageInfo;

      expect(pageInfoField.type.toString()).toBe('PageInfo!');
    });

    it('EventLogResult.metrics should be EventLogQueryMetrics', () => {
      const resultType = schema.getType('EventLogResult');
      const metricsField = resultType.getFields().metrics;

      expect(metricsField.type.toString()).toBe('EventLogQueryMetrics!');
    });
  });

  describe('All types are defined', () => {
    let schema: any;

    beforeEach(() => {
      schema = buildSchema(typeDefs);
    });

    it('should have all required types', () => {
      const typeNames = Object.keys(schema.getTypeMap()).filter(
        (name: string) => !name.startsWith('__')
      );

      expect(typeNames).toContain('EventLevel');
      expect(typeNames).toContain('EventLogEntry');
      expect(typeNames).toContain('PageInfo');
      expect(typeNames).toContain('EventLogQueryMetrics');
      expect(typeNames).toContain('EventLogResult');
    });
  });
});
