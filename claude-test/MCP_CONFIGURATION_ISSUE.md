# MCP Configuration Issue & Solution

## Problem

The `.mcp.json` configuration doesn't work because:

1. **The server we built is a GraphQL HTTP API** - it listens on port 4000 and expects HTTP requests
2. **Claude's MCP protocol requires a different communication method** - it uses stdio (standard input/output) or a different protocol
3. **The configuration mismatch** - `.mcp.json` can't just point to a URL, it needs a proper MCP server

---

## What Claude Expects

Claude's Model Context Protocol (MCP) expects servers that:
- Communicate via **stdio** (stdin/stdout for input/output)
- Implement the **MCP protocol** (a JSON-RPC based protocol)
- Have a specific **capability negotiation handshake**
- Support **resource listing and reading** or **tool definitions**

Our current server doesn't implement this - it's just a plain HTTP GraphQL API.

---

## Options to Fix

### Option 1: Use the Server as a Local API (Recommended for Testing)

**Don't use `.mcp.json`** - instead, just run the server normally and access it via HTTP:

```bash
cd C:\Users\chris\Code\SysMCP
npm run dev
# Server runs at http://localhost:4000/graphql
```

Then you can:
- Query it directly via HTTP from Claude (if Claude supports HTTP tools)
- Test it with curl/Postman
- Integrate it into applications that support GraphQL

**Advantages:**
- ✅ Works now
- ✅ GraphQL is powerful and flexible
- ✅ Can be used by any HTTP client

**Disadvantages:**
- ❌ Not an MCP-compliant server
- ❌ Can't be used via `.mcp.json`

---

### Option 2: Build a Proper MCP Server Wrapper (Next Phase)

Create an MCP-compliant server that wraps the GraphQL API:

**What needs to happen:**
1. Create a new `src/mcp-server.ts` that implements the MCP protocol
2. Have it handle MCP requests and forward them to the GraphQL server
3. Export MCP resources/tools based on the EventLog query capabilities
4. Update `.mcp.json` to point to this MCP server

**Example `.mcp.json` (would look like):**
```json
{
  "mcpServers": {
    "sysmcp": {
      "command": "node",
      "args": ["C:\\Users\\chris\\Code\\SysMCP\\dist\\mcp-server.js"]
    }
  }
}
```

**Effort:** ~1-2 days to implement full MCP protocol compliance

---

### Option 3: Use Claude's HTTP Tool Integration

If Claude supports HTTP tools, you could:
1. Keep the GraphQL server running
2. Ask Claude to make HTTP requests directly to `http://localhost:4000/graphql`
3. Claude can use its built-in HTTP capabilities to test the API

**Example conversation:**
> "I have a GraphQL API running at http://localhost:4000/graphql. Can you POST this query to it and tell me the results?"

---

## Recommended Immediate Solution

**For now, use Option 1:**

1. **Delete or ignore `.mcp.json`** - it won't work with the current HTTP-based server

2. **Run the server normally:**
   ```bash
   npm run dev
   ```

3. **Test it with Claude using HTTP:**
   ```
   "My EventLog API is running at http://localhost:4000/graphql
   
   Please execute this GraphQL query:
   {
     eventLogs(logName: "System", limit: 10) {
       entries { id timestamp level message }
       totalCount
     }
   }"
   ```

---

## What's Actually Needed for MCP Compliance

To make this a proper MCP server, it would need to:

1. **Implement MCP Protocol Handshake:**
   - Receive initialization request from Claude
   - Respond with server capabilities
   - Negotiate protocol version

2. **Define MCP Resources or Tools:**
   - As a **resource**: Expose event logs as queryable resources
   - As a **tool**: Expose event log querying as callable tools
   - Implement proper request/response format

3. **Communicate via stdio:**
   - Read JSON-RPC messages from stdin
   - Write JSON-RPC responses to stdout
   - Handle errors and timeouts properly

4. **Example resource definition (MCP format):**
   ```
   {
     "type": "resource",
     "uri": "eventlog://system/events",
     "name": "System Event Log",
     "description": "Query Windows System event log"
   }
   ```

---

## Long-term Solution

Create a proper MCP server that:
- Wraps the GraphQL API internally
- Exposes EventLog querying as MCP tools/resources
- Handles the MCP protocol properly
- Can be configured in Claude's `.mcp.json`

This would be **Feature 003** - MCP Protocol Server Wrapper.

---

## For Now

**Just use the GraphQL API directly:**

```bash
npm run dev
# Then ask Claude to query: http://localhost:4000/graphql
```

The MCP configuration issue can be addressed in a future phase when building Feature 003.

---

## Summary

| Aspect | Current Status |
|--------|-----------------|
| **GraphQL API** | ✅ Working |
| **HTTP Server** | ✅ Working |
| **EventLog Queries** | ✅ Working |
| **MCP Compliance** | ❌ Not yet implemented |
| **`.mcp.json` Support** | ❌ Requires MCP server wrapper |

**Recommendation:** Use the GraphQL API directly via HTTP rather than trying to make it MCP-compliant in this phase. Feature 003 can add MCP protocol support.
