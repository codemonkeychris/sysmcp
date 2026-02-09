# SysMCP - Quick Start Guide

## What You Have

✅ **Feature 002**: EventLog GraphQL API (93% complete)  
✅ **Feature 002.1**: MCP Protocol Wrapper (100% complete)  

You can now connect Claude to query Windows Event Logs!

---

## Step 1: Build the Project

```bash
cd C:\Users\chris\Code\SysMCP
npm install
npm run build
```

---

## Step 2: Start the EventLog API (in Terminal 1)

```bash
npm run dev
```

You'll see:
```
Initializing MCP Host Bootstrap...
Loading environment configuration...
Starting Express server on port 4000
Loading MCP services...
EventLog service registered
```

---

## Step 3: Configure Claude (`.mcp.json`)

In your Claude Desktop config folder:
- **macOS/Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "sysmcp": {
      "command": "node",
      "args": ["C:\\Users\\chris\\Code\\SysMCP\\dist\\mcp\\index.js"],
      "env": {
        "LOG_LEVEL": "info",
        "EVENTLOG_API_URL": "http://localhost:4000/graphql"
      }
    }
  }
}
```

---

## Step 4: Restart Claude and Use Tools

Claude will automatically discover two tools:

### `eventlog_query`
Query Windows Event Logs with filters and pagination

**Example queries to Claude:**
- "Show me the last 10 System event log entries"
- "Query the Security log for any errors from the last hour"
- "What events are in the Application log? Include user names"
- "Show me all critical events from today"

### `eventlog_list_logs`
Get available event logs on the system

**Example queries to Claude:**
- "What event logs are available on this system?"
- "List all the event logs"

---

## What Claude Can Do

✅ Query event logs by name (System, Application, Security, etc.)  
✅ Filter by event level (Error, Warning, Information, etc.)  
✅ Filter by time range  
✅ Search for specific keywords  
✅ Get pagination through large result sets  
✅ See event details with automatic PII filtering  

---

## How It Works

```
Claude asks question
    ↓
MCP Protocol (stdio)
    ↓
Feature 2.1: MCP Wrapper
    ↓
Translates to GraphQL query
    ↓
Feature 002: EventLog API (port 4000)
    ↓
Queries Windows Event Log
    ↓
Returns results with PII filtering
    ↓
MCP returns to Claude
    ↓
Claude answers your question
```

---

## Troubleshooting

**Claude doesn't see the tools?**
- Make sure `npm run dev` is running (port 4000 must be accessible)
- Restart Claude Desktop
- Check that `.mcp.json` path is correct for your OS

**"Connection refused" error?**
- Verify `npm run dev` is running
- Check that port 4000 is not in use: `netstat -ano | findstr :4000`
- Ensure no firewall is blocking localhost:4000

**Queries return no results?**
- Windows Event Logs require admin access on some systems
- Try querying "System" or "Application" log first
- Check Event Viewer to see what events exist

**Getting generic errors?**
- Check browser console in `.mcp.json` - look for MCP error details
- Start with simpler queries (just log name, no filters)
- See `docs/TROUBLESHOOTING.md` for more detailed debugging

---

## Example Queries to Try

### Query System Log
```
Claude: "Show me the last 5 System log entries"
```

### Query with Filters
```
Claude: "Show me any errors from the Application log in the last 24 hours"
```

### List Available Logs
```
Claude: "What event logs do I have available?"
```

### Advanced Query
```
Claude: "Show me security-related events from the last 7 days, 
ordered by most recent first, with pagination showing 10 at a time"
```

---

## What's Next?

### Coming Soon (Feature 003+)
- **FileSearch**: Search files on disk from Claude
- **Registry**: Query Windows Registry from Claude
- **Performance**: Get system performance metrics from Claude
- **Services**: Query running services from Claude

All will work the same way through the MCP wrapper!

---

## Files to Know

**Main Implementation**:
- `src/mcp/` - MCP protocol wrapper code
- `src/services/eventlog/` - EventLog service implementation
- `docs/` - Comprehensive documentation

**Documentation**:
- `docs/MCP-PROTOCOL.md` - How MCP protocol works
- `docs/TOOLS.md` - EventLog tool definitions
- `docs/TROUBLESHOOTING.md` - Debugging guide
- `docs/EXTENSION-GUIDE.md` - How to add new services

**Features Status**:
- `features/002-eventlog-mcp.tasks.md` - EventLog status
- `features/002.1-mcp-protocol-wrapper.tasks.md` - MCP Wrapper status
- `FEATURE_002.1_FINAL_STATUS.md` - Complete feature report

---

## Questions?

Check these docs in order:
1. `docs/TROUBLESHOOTING.md` - Common issues
2. `docs/MCP-PROTOCOL.md` - How it works
3. `docs/EXTENSION-GUIDE.md` - Implementation details
4. `RUNNING_AND_TESTING.md` - Testing and verification

---

**Status**: ✅ Ready to use with Claude  
**Last Updated**: 2026-02-10  
**Tests**: 313+ passing  
**Performance**: Exceeds targets  
