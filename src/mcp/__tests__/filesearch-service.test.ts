/**
 * Tests for FileSearch MCP Service
 */

import { FileSearchMcpService } from '../filesearch-service';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('FileSearchMcpService', () => {
  let service: FileSearchMcpService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileSearchMcpService('http://localhost:3000/graphql');
  });

  describe('properties', () => {
    it('should have correct id', () => {
      expect(service.id).toBe('filesearch');
    });

    it('should have correct name', () => {
      expect(service.name).toBe('FileSearch Service');
    });

    it('should have version', () => {
      expect(service.version).toBe('1.0.0');
    });

    it('should be enabled', () => {
      expect(service.enabled).toBe(true);
    });
  });

  describe('getTools', () => {
    it('should return filesearch_query tool', () => {
      const tools = service.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('filesearch_query');
    });

    it('should have proper input schema', () => {
      const tools = service.getTools();
      const schema = tools[0].inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('searchText');
      expect(schema.properties).toHaveProperty('searchMode');
      expect(schema.properties).toHaveProperty('path');
      expect(schema.properties).toHaveProperty('fileName');
      expect(schema.properties).toHaveProperty('fileType');
      expect(schema.properties).toHaveProperty('limit');
      expect(schema.properties).toHaveProperty('offset');
    });
  });

  describe('callTool', () => {
    it('should return error for unknown tool', async () => {
      const result = await service.callTool('unknown_tool', {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown tool');
    });

    it('should call filesearch_query successfully', async () => {
      const mockResult = {
        files: [
          { path: 'C:\\test.txt', fileName: 'test.txt', fileType: '.txt', size: 100 }
        ],
        totalCount: 1,
        pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: 0, endCursor: 0 },
        metrics: { queryCount: 1, responseDurationMs: 10, resultsReturned: 1 }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { fileSearch: mockResult } })
      });

      const result = await service.callTool('filesearch_query', {
        searchText: 'test',
        fileType: '.txt',
        limit: 10
      });

      expect(result.success).toBe(true);
      expect((result.data as any).files).toHaveLength(1);
      expect((result.data as any).totalCount).toBe(1);
    });

    it('should pass search parameters to GraphQL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            fileSearch: {
              files: [],
              totalCount: 0,
              pageInfo: { hasNextPage: false },
              metrics: { queryCount: 0 }
            }
          }
        })
      });

      await service.callTool('filesearch_query', {
        searchText: 'budget report',
        searchMode: 'FREETEXT',
        path: 'C:\\Documents',
        fileType: '.pdf',
        minSize: 1024,
        limit: 50
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.searchText).toBe('budget report');
      expect(body.variables.searchMode).toBe('FREETEXT');
      expect(body.variables.path).toBe('C:\\Documents');
      expect(body.variables.fileType).toBe('.pdf');
      expect(body.variables.minSize).toBe(1024);
      expect(body.variables.limit).toBe(50);
    });

    it('should handle GraphQL errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ message: 'Search failed' }]
        })
      });

      const result = await service.callTool('filesearch_query', { searchText: 'test' });
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('GraphQL error');
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await service.callTool('filesearch_query', { searchText: 'test' });
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('500');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.callTool('filesearch_query', { searchText: 'test' });
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('ECONNREFUSED');
    });

    it('should handle no data returned', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} })
      });

      const result = await service.callTool('filesearch_query', { searchText: 'test' });
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No data returned');
    });
  });

  describe('enable/disable', () => {
    it('should have enable method', () => {
      expect(() => service.enable()).not.toThrow();
    });

    it('should have disable method', () => {
      expect(() => service.disable()).not.toThrow();
    });
  });
});
