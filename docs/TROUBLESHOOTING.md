# MCP Server Troubleshooting Guide

## Common Issues and Solutions

### Connection & Startup

#### Issue: "Cannot connect to MCP server"

**Symptoms:**
- Client connection refused
- Timeout connecting to localhost:3000
- "ECONNREFUSED" error

**Solutions:**

1. Verify server is running:
   ```bash
   # Check if process is running
   ps aux | grep "node dist/mcp"
   
   # Or on Windows
   tasklist | findstr node
   ```

2. Check port is available:
   ```bash
   # Linux/Mac
   lsof -i :3000
   
   # Windows
   netstat -ano | findstr :3000
   ```

3. Review server logs:
   ```bash
   LOG_LEVEL=debug node dist/mcp/index.js
   ```

4. Restart server:
   ```bash
   npm run build
   npm start
   ```

---

#### Issue: "Address already in use"

**Symptoms:**
- Server fails to start with "EADDRINUSE"
- Port 3000 is already in use

**Solutions:**

1. Kill existing process:
   ```bash
   # Linux/Mac
   kill -9 <PID>
   
   # Windows
   taskkill /PID <PID> /F
   ```

2. Use different port:
   ```bash
   PORT=3001 npm start
   ```

3. Check what's using the port:
   ```bash
   # Linux/Mac
   lsof -i :3000
   
   # Windows
   netstat -ano | findstr :3000
   ```

---

### Protocol Issues

#### Issue: "Invalid JSON message"

**Symptoms:**
- Error code: -32700
- "Parse error" in response
- Messages fail to parse

**Solutions:**

1. Verify message format:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {}
   }
   ```

2. Ensure newline termination:
   ```
   {message}\n
   ↑ Must end with newline
   ```

3. Validate JSON syntax:
   ```bash
   # Use jq to validate
   echo '{"jsonrpc":"2.0","id":1}' | jq .
   ```

4. Check encoding:
   - Ensure UTF-8 encoding
   - No BOM characters
   - Valid escape sequences

---

#### Issue: "Method not found"

**Symptoms:**
- Error code: -32601
- "The method does not exist"
- Unknown method error

**Solutions:**

1. Verify method name:
   - `initialize` ✅
   - `tools/list` ✅
   - `tools/call` ✅
   - `toolsList` ❌ (wrong name)

2. Ensure proper initialization:
   ```json
   1. {method: "initialize", ...}
   2. {method: "tools/list", ...}
   3. {method: "tools/call", ...}
   ```

3. Check method is implemented:
   ```bash
   LOG_LEVEL=debug npm start
   # Look for "Registered handler" logs
   ```

---

### Tool Issues

#### Issue: "Tool not found"

**Symptoms:**
- Error code: "ToolNotFound"
- Tool doesn't appear in tools/list
- Tool call returns not found

**Solutions:**

1. List available tools first:
   ```json
   {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
   ```

2. Verify tool name format:
   - Should include service ID
   - Example: `eventlog_query` (not `query`)
   - Case-sensitive

3. Check service is registered:
   ```bash
   LOG_LEVEL=debug npm start
   # Look for "Registered service" messages
   ```

4. Verify service is enabled:
   ```bash
   # Tool should not appear if service is disabled
   # Check service.isEnabled() in code
   ```

---

#### Issue: "Invalid parameters"

**Symptoms:**
- Error code: -32602 (InvalidParams)
- "Validation failed"
- Parameter error details in response

**Solutions:**

1. Check required parameters:
   ```json
   // eventlog_query requires logName
   {
     "logName": "System"  // ✅ Required
   }
   ```

2. Verify parameter types:
   ```json
   {
     "logName": "System",    // ✅ String
     "limit": 100,           // ✅ Number (not "100" string)
     "offset": 0             // ✅ Number
   }
   ```

3. Review schema constraints:
   ```
   - limit: number, min=1, max=10000
   - logName: string, required
   - minLevel: string, one of (INFORMATION, WARNING, ERROR)
   ```

4. Check error details:
   ```json
   {
     "error": {
       "code": "InvalidParams",
       "details": {
         "path": "arguments.limit",
         "expected": "number",
         "received": "string"
       }
     }
   }
   ```

---

#### Issue: "Tool execution failed"

**Symptoms:**
- Error code: "ToolExecutionError"
- Tool doesn't complete
- Generic "execution failed" error

**Solutions:**

1. Check service logs:
   ```bash
   LOG_LEVEL=debug npm start
   # Look for execution errors
   ```

2. Verify service availability:
   ```bash
   # For EventLog on Windows
   wevtutil el
   # Should list System, Application, etc.
   ```

3. Check permissions:
   ```bash
   # Some logs require admin
   # Run as administrator on Windows
   ```

4. Verify parameters are sensible:
   ```json
   {
     "logName": "System",     // ✅ Real log name
     "limit": 100,            // ✅ Reasonable limit
     "minLevel": "ERROR"      // ✅ Valid level
   }
   ```

5. Check service timeout:
   ```bash
   # If query takes >30s, it times out
   # Reduce limit or add more specific filters
   ```

---

### EventLog Issues

#### Issue: "Event log not found"

**Symptoms:**
- EventLog query returns "not found"
- Log name doesn't exist
- Permission denied

**Solutions:**

1. List available logs:
   ```json
   {"method": "tools/call", "name": "eventlog_list_logs", "arguments": {}}
   ```

2. Use exact log name:
   ```
   ✅ "System"
   ✅ "Application"
   ✅ "Security" (requires admin)
   ❌ "system" (wrong case)
   ❌ "System Log" (wrong name)
   ```

3. Check log exists on system:
   ```bash
   # Windows
   wevtutil el
   
   # Linux/Mac
   # EventLog is Windows-only
   ```

4. Verify permissions:
   ```bash
   # Some logs (Security, System) require admin
   # Run as administrator
   ```

---

#### Issue: "No results returned"

**Symptoms:**
- Query returns empty entries list
- totalCount is 0
- Valid query but no data

**Solutions:**

1. Verify log has entries:
   ```json
   {"method": "tools/call", "name": "eventlog_query", "arguments": {"logName": "System", "limit": 1}}
   
   // Check response has entries
   ```

2. Check filters are correct:
   ```json
   {
     "logName": "System",
     "minLevel": "ERROR"  // Might be filtering out all entries
   }
   ```

3. Try broader query:
   ```json
   // Instead of filtering by level, source, try:
   {"logName": "System", "limit": 100}
   ```

4. Check offset isn't too high:
   ```json
   {
     "logName": "System",
     "offset": 999999  // Beyond available events
   }
   ```

---

#### Issue: "Query timeout or slow"

**Symptoms:**
- Query takes >100ms
- Request times out after 30s
- Performance degradation

**Solutions:**

1. Reduce limit:
   ```json
   // ❌ Slow
   {"logName": "System", "limit": 10000}
   
   // ✅ Fast
   {"logName": "System", "limit": 100}
   ```

2. Add filters:
   ```json
   {
     "logName": "System",
     "limit": 100,
     "minLevel": "ERROR",  // Reduces result set
     "source": "kernel"    // More specific
   }
   ```

3. Use pagination:
   ```json
   // First request
   {"logName": "System", "limit": 100, "offset": 0}
   
   // Next request using nextOffset
   {"logName": "System", "limit": 100, "offset": 100}
   ```

4. Check system load:
   ```bash
   # High disk I/O can slow EventLog queries
   # Windows Resource Monitor → Disk tab
   ```

---

### Validation Issues

#### Issue: "Schema validation failed"

**Symptoms:**
- Validation error returned
- "Invalid schema"
- Parameter doesn't match schema

**Solutions:**

1. Verify schema matches tool:
   ```bash
   # Get tool definition
   {"method": "tools/list", ...}
   
   # Check inputSchema in response
   ```

2. Check all required fields:
   ```json
   {
     "logName": "System"  // Required field
     // Other optional fields not needed
   }
   ```

3. Match types exactly:
   ```
   - String fields: use strings
   - Number fields: use numbers
   - Boolean fields: use true/false
   - Objects: use nested objects
   ```

4. Review schema details:
   ```bash
   # Schema includes:
   # - type validation
   # - minLength/maxLength
   # - minimum/maximum
   # - pattern (regex)
   # - enum (allowed values)
   ```

---

### Performance Issues

#### Issue: "Tool discovery is slow"

**Symptoms:**
- tools/list takes >50ms
- Many services registered
- Slow startup

**Solutions:**

1. Check registered services:
   ```bash
   LOG_LEVEL=debug npm start
   # Look for "Registered service" count
   ```

2. Reduce service count:
   ```typescript
   // Only register needed services
   serviceManager.registerService(eventlogService);
   // Don't register unused services
   ```

3. Cache tool list:
   ```typescript
   // If calling tools/list frequently
   // Store result and refresh periodically
   ```

---

#### Issue: "Tool execution is slow"

**Symptoms:**
- Individual tool calls take >100ms
- Performance degrades with repeated calls
- Memory growing

**Solutions:**

1. Profile the query:
   ```bash
   LOG_LEVEL=debug npm start
   # Look for execution time logs
   ```

2. Optimize parameters:
   ```json
   // Reduce data transfer
   {"logName": "System", "limit": 50}  // Instead of 1000
   ```

3. Check for memory leaks:
   ```bash
   # Monitor memory with repeated calls
   node --inspect dist/index.js
   # Open chrome://inspect
   ```

4. Restart server periodically:
   ```bash
   # Long-running servers can accumulate state
   # Restart every 24-48 hours
   ```

---

### Client-Specific Issues

#### Issue: Claude doesn't use the MCP server

**Symptoms:**
- Claude doesn't call tools
- Server is running but unused
- Tools don't appear in Claude

**Solutions:**

1. Verify server is discoverable:
   ```bash
   # MCP server must be running and listening
   npm start
   ```

2. Check Claude configuration:
   ```
   - Claude Desktop app
   - Settings → Developer → MCP Servers
   - Add server configuration
   - Restart Claude
   ```

3. Verify tools are discoverable:
   ```bash
   # Manual test
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
   nc localhost 3000
   ```

4. Check for initialization:
   ```bash
   # Log should show initialize call
   LOG_LEVEL=debug npm start
   ```

---

#### Issue: Cursor IDE doesn't recognize tools

**Symptoms:**
- Cursor autocomplete doesn't show tools
- Tool calls return unknown tool
- Tools not appearing in feature list

**Solutions:**

1. Verify MCP configuration in Cursor
2. Restart Cursor after server starts
3. Check .cursor configuration file
4. Test with manual JSON-RPC call

---

### Debug Mode

#### Enabling Debug Logging

```bash
# Show detailed logs
LOG_LEVEL=debug npm start

# Logs include:
# - Protocol parsing
# - Handler registration
# - Service registration
# - Tool calls
# - Errors with details
# - Performance metrics
```

#### Common Debug Patterns

**Check if server started:**
```bash
LOG_LEVEL=debug npm start 2>&1 | grep -i "listening\|started\|ready"
```

**Monitor all message:**
```bash
LOG_LEVEL=debug npm start 2>&1 | grep -i "message\|request\|response"
```

**Track specific tool:**
```bash
LOG_LEVEL=debug npm start 2>&1 | grep "eventlog"
```

**See all errors:**
```bash
LOG_LEVEL=debug npm start 2>&1 | grep -i "error"
```

---

### Testing

#### Manual Protocol Test

```bash
# Start server
npm start &

# Send initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"test"}}}' | nc localhost 3000

# List tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | nc localhost 3000

# Call tool
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"eventlog_list_logs","arguments":{}}}' | nc localhost 3000
```

#### Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/mcp/__tests__/protocol-handler.test.ts

# Run with coverage
npm run test:coverage
```

---

## Getting Help

### Check Logs

Always enable debug logging first:
```bash
LOG_LEVEL=debug npm start
```

### Reproduce Issue

Create minimal reproduction:
1. Single tool call
2. Specific parameter values
3. Expected vs actual output

### File Issue Report

Include:
1. Error message and code
2. Tool/method being called
3. Parameters used
4. Expected behavior
5. Debug log output

### Related Resources

- [MCP Protocol Documentation](./MCP-PROTOCOL.md)
- [Tools Documentation](./TOOLS.md)
- [Extension Guide](./EXTENSION-GUIDE.md)

---

## FAQ

**Q: Can I use MCP server on Linux/Mac?**
A: Core MCP server yes, but EventLog service is Windows-only. File search and registry services coming in future.

**Q: Can multiple clients connect simultaneously?**
A: Current implementation is single-client. Multi-client support planned.

**Q: How do I add persistence to configurations?**
A: See Extension Guide for configuration implementation patterns.

**Q: What's the maximum result set size?**
A: Currently 10,000 records. Streaming support planned.

**Q: How do I extend with custom services?**
A: See Extension Guide for complete walkthrough.

**Q: Why is tool discovery slow with many services?**
A: O(n) lookup can be optimized to O(1) with indexing. Future improvement.

**Q: Can I run multiple MCP servers?**
A: Yes, on different ports. Configure each in client.

**Q: What about security?**
A: See SysMCP security documentation. TypeScript strict mode, input validation, no shell access.
