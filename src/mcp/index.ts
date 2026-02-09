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
import { StubTestService } from './stub-service';

const logger = {
  info: (msg: string) => console.error(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

async function main() {
  try {
    logger.info('Starting MCP Server');

    // Initialize service manager
    const serviceManager = new ServiceManager();
    logger.info('Service manager initialized');

    // Register test service for now
    const testService = new StubTestService();
    serviceManager.registerService(testService);
    logger.info('Test service registered');

    // Initialize tool executor
    const toolExecutor = new ToolExecutor(serviceManager);
    logger.info('Tool executor initialized');

    // Initialize protocol handler
    const protocolHandler = new ProtocolHandler();
    logger.info('Protocol handler initialized');

    // Register tool handlers
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

    logger.info('Tool handlers registered');

    // Start the protocol handler (listens on stdin, writes to stdout)
    await protocolHandler.start();
    
  } catch (error) {
    logger.error(`Failed to start MCP server: ${error}`);
    process.exit(1);
  }
}

main();
