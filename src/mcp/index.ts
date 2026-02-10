#!/usr/bin/env node
/**
 * SysMCP - MCP Protocol Server Entry Point
 * 
 * This is the main entry point for the MCP server that Claude and other
 * LLM clients connect to via stdio. It sets up the MCP protocol handler,
 * registers services, and starts listening on stdin/stdout.
 */

import { ProtocolHandler } from './protocol-handler';
import { ServiceManager } from './service-manager';
import { ToolExecutor } from './tool-executor';
import { EventLogMcpService } from './eventlog-service';
import { FileSearchMcpService } from './filesearch-service';

const logger = {
  info: (msg: string) => console.error(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

function main() {
  try {
    logger.info('Starting MCP Server');

    // Initialize service manager
    const serviceManager = new ServiceManager();
    logger.info('Service manager initialized');

    // Register EventLog service
    const eventLogService = new EventLogMcpService(
      process.env.EVENTLOG_API_URL || 'http://localhost:3000/graphql'
    );
    serviceManager.registerService(eventLogService);
    logger.info('EventLog service registered');

    // Register FileSearch service
    const fileSearchService = new FileSearchMcpService(
      process.env.FILESEARCH_API_URL || 'http://localhost:3000/graphql'
    );
    serviceManager.registerService(fileSearchService);
    logger.info('FileSearch service registered');

    // Initialize tool executor
    const toolExecutor = new ToolExecutor(serviceManager);
    logger.info('Tool executor initialized');

    // Initialize protocol handler
    const protocolHandler = new ProtocolHandler();
    logger.info('Protocol handler initialized');

    // Register tool handlers BEFORE starting
    protocolHandler.registerHandler('tools/list', async () => {
      logger.info('Handling tools/list request');
      const tools = toolExecutor.getTools();
      logger.info(`Returning ${tools.length} tools`);
      return { tools };
    });

    protocolHandler.registerHandler('tools/call', async (params: any) => {
      logger.info(`Handling tools/call request: ${params?.name}`);
      return await toolExecutor.executeTool(params);
    });

    protocolHandler.registerHandler('resources/list', async () => {
      return { resources: [] };
    });

    logger.info('Tool handlers registered');

    // Start the protocol handler (listens on stdin, writes to stdout)
    protocolHandler.start();
    logger.info('MCP Server ready, listening on stdin');
    
  } catch (error) {
    logger.error(`Failed to start MCP server: ${error}`);
    process.exit(1);
  }
}

main();
