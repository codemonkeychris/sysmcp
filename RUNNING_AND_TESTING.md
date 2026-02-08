# Running the SysMCP EventLog Service & Testing with Claude

This guide explains how to run the EventLog MCP and provide Claude with the necessary information to test it.

---

## Part 1: Building and Running the MCP

### Prerequisites
- Node.js 18+ installed
- Windows system (for EventLog access)
- Git (for cloning/updating)

### Step 1: Build the Project

```bash
cd C:\Users\chris\Code\SysMCP
npm run build
```

This compiles TypeScript to JavaScript in the `/dist` directory.

### Step 2: Start the MCP Server

**Development Mode** (with hot-reload):
```bash
npm run dev
```

**Production Mode** (faster):
```bash
npm run build
npm start
```

### Expected Output

```
Initializing MCP Host Bootstrap...
Loading environment configuration...
Configuration loaded: NODE_ENV=development, PORT=4000
Logger initialized
Creating Express server...
Service registry initialized
Service lifecycle manager initialized
Starting file watcher for development mode
File watcher started
Starting HTTP server...
HTTP server started
Server started successfully
MCP Host Bootstrap is ready
```

The server is now running on **http://localhost:4000**

### Step 3: Verify the Server is Running

```bash
# Check health endpoint
curl http://localhost:4000/health

# Expected response:
# {"status":"ok","uptime":5,"services":0,"timestamp":"2026-02-10T20:48:10.123Z"}
```

---

## Part 2: GraphQL API Endpoints

### GraphQL Endpoint
- **URL**: `http://localhost:4000/graphql`
- **Method**: POST
- **Content-Type**: application/json

### Available GraphQL Query

The EventLog MCP exposes one main query:

```graphql
query eventLogs(
  logName: String
  limit: Int
  offset: Int
  minLevel: String
  source: String
  startTime: String
  endTime: String
  messageContains: String
) {
  entries {
    id
    timestamp
    level
    source
    eventId
    username
    computername
    message
  }
  pageInfo {
    hasNextPage
    hasPreviousPage
    startCursor
    endCursor
    nextPageCursor
    previousPageCursor
  }
  totalCount
  metrics {
    queryCount
    responseDurationMs
    resultsReturned
  }
}
```

---

## Part 3: Information to Provide to Claude for Testing

When you ask Claude to test the MCP, provide the following information:

### **Minimal Information (Quick Test)**

```
The MCP is running at: http://localhost:4000/graphql

Test Query (to retrieve 10 System event log entries):

query {
  eventLogs(logName: "System", limit: 10) {
    entries {
      id
      timestamp
      level
      source
      eventId
      message
    }
    pageInfo {
      hasNextPage
    }
    totalCount
  }
}

Please execute this query against the GraphQL endpoint and report:
1. Whether the query succeeds
2. Number of results returned
3. Any error messages
4. Sample of one event entry
```

### **Full Information (Comprehensive Testing)**

```
The EventLog MCP is running at: http://localhost:4000/graphql

GraphQL Endpoint Details:
- URL: http://localhost:4000/graphql
- Method: POST
- Content-Type: application/json
- Server Status Endpoint: http://localhost:4000/health (GET)

Available Query: eventLogs

Parameters (all optional):
- logName (String): Event log to query. Common values: "System", "Application", "Security"
  - Default: "System"
- limit (Int): Max results to return
  - Default: 1000
  - Range: 1-10000
- offset (Int): Start position for pagination
  - Default: 0
- minLevel (String): Filter by severity. Values: ERROR, WARNING, INFO, VERBOSE, DEBUG
- source (String): Filter by event source/provider
- startTime (String): Filter events after this timestamp (ISO 8601 format)
- endTime (String): Filter events before this timestamp (ISO 8601 format)
- messageContains (String): Filter events with matching message text

Response Fields:
- entries: Array of event log entries with fields:
  - id: Event record ID
  - timestamp: ISO 8601 timestamp
  - level: Severity (ERROR/WARNING/INFO/VERBOSE/DEBUG)
  - source: Event provider
  - eventId: Windows event ID
  - username: (may be anonymized)
  - computername: (may be anonymized)
  - message: Event message
  
- pageInfo: Pagination metadata
  - hasNextPage: Boolean
  - hasPreviousPage: Boolean
  - startCursor: Cursor for previous page
  - endCursor: Cursor for next page
  - nextPageCursor: Cursor to use for next query
  - previousPageCursor: Cursor to use for previous query
  
- totalCount: Total matching events in the log
- metrics: Query performance metrics
  - queryCount: Total queries executed so far
  - responseDurationMs: Time to execute this query
  - resultsReturned: Number of results in this response

Test Scenarios:

1. Basic Query (System log, first 10 entries):
{
  eventLogs(logName: "System", limit: 10) {
    entries {
      id
      timestamp
      level
      source
      eventId
      message
    }
    totalCount
  }
}

2. Filtered Query (Errors in last 24 hours):
{
  eventLogs(
    logName: "System"
    minLevel: "ERROR"
    startTime: "2026-02-09T20:48:00Z"
    endTime: "2026-02-10T20:48:00Z"
  ) {
    entries {
      timestamp
      level
      source
      message
    }
    totalCount
  }
}

3. Pagination Test:
{
  eventLogs(logName: "Application", limit: 5, offset: 0) {
    entries { id timestamp source }
    pageInfo { hasNextPage nextPageCursor }
    totalCount
  }
}

4. With Metrics:
{
  eventLogs(logName: "System", limit: 100) {
    totalCount
    pageInfo { hasNextPage }
    metrics {
      queryCount
      responseDurationMs
      resultsReturned
    }
  }
}

Please execute one or more of these queries and report:
1. Success/failure of each query
2. Response time (from metrics.responseDurationMs)
3. Number of results returned
4. Sample of returned data
5. Any errors encountered
```

### **Advanced Testing (With Tools)**

If you want Claude to use HTTP tools to test:

```
The EventLog MCP is running at http://localhost:4000

Please use the HTTP client to test the following:

1. Health Check:
   GET http://localhost:4000/health
   
2. GraphQL Query:
   POST http://localhost:4000/graphql
   Content-Type: application/json
   
   Body:
   {
     "query": "{
       eventLogs(logName: \"System\", limit: 10) {
         entries { id timestamp level source message }
         totalCount
         metrics { responseDurationMs resultsReturned }
       }
     }"
   }

Please execute both requests and report:
- HTTP status codes
- Response times
- Data returned
- Any errors

Additional test queries to try:
- Query with messageContains filter
- Query with limit: 1000 (large result set)
- Query with offset for pagination
- Query on Application log
- Query with date range filters
```

---

## Part 4: Troubleshooting

### Server Won't Start
```
Error: EADDRINUSE: address already in use :::4000

Solution: 
- Another process is using port 4000
- Kill the process or use a different port:
  PORT=5000 npm run dev
```

### GraphQL Endpoint Returns 404
```
Make sure you're posting to: http://localhost:4000/graphql
Check that the server is running (npm run dev)
```

### No Event Log Entries Returned
```
- User may not have permission to access the event log
- The event log may be empty (try "Application" instead of "System")
- Try a different log name: System, Application, Security
```

### Anonymization Issues
```
- PII in usernames/computernames will be masked as [user], [computer], etc.
- This is intentional security behavior
- To disable, modify /src/services/eventlog/provider.ts configuration
```

---

## Part 5: Sample Conversation with Claude

Here's what you might tell Claude:

> "I have an EventLog MCP running at http://localhost:4000/graphql. 
> 
> Could you please test the following query:
> 
> ```graphql
> query {
>   eventLogs(logName: "System", limit: 10) {
>     entries {
>       id
>       timestamp
>       level
>       source
>       eventId
>       message
>     }
>     totalCount
>     metrics {
>       responseDurationMs
>       resultsReturned
>     }
>   }
> }
> ```
> 
> Please execute this against the GraphQL endpoint and let me know:
> 1. If it succeeds
> 2. How many results you got
> 3. What the response time was
> 4. A sample of one event entry"

Claude will then:
- Understand the GraphQL endpoint location
- Know what query to execute
- Know what to expect in the response
- Be able to interpret results and any errors

---

## Part 6: Testing Different Event Logs

### System Log (Default)
- Contains OS-level events
- Usually has the most entries
- Good for general testing

### Application Log
- Contains application-specific events
- May have fewer entries
- Good for testing filtered queries

### Security Log
- Contains security-related events
- May require elevated permissions
- Good for testing permission handling

**Example queries:**

```graphql
# Get System log events
query {
  eventLogs(logName: "System", limit: 5) {
    entries { timestamp source level }
    totalCount
  }
}

# Get Application log events
query {
  eventLogs(logName: "Application", limit: 5) {
    entries { timestamp source level }
    totalCount
  }
}

# Get errors from Security log
query {
  eventLogs(logName: "Security", minLevel: "ERROR") {
    entries { timestamp source level message }
    totalCount
  }
}
```

---

## Part 7: What Claude Needs to Know (Quick Reference)

When asking Claude to test, mention:

1. **Server URL**: `http://localhost:4000/graphql`
2. **API Type**: GraphQL (POST requests)
3. **Example Query**: Provide the GraphQL query to execute
4. **Expected Response**: Brief description of what should be returned
5. **Key Parameters**: Which parameters are most important to test

**Minimum viable prompt for Claude:**

> "Test this GraphQL query at http://localhost:4000/graphql:
> 
> ```
> { eventLogs(logName: "System", limit: 10) { entries { timestamp message } totalCount } }
> ```
> 
> Tell me if it works and how many events were returned."

---

## Part 8: Performance Testing with Claude

You can also ask Claude to performance test:

> "Run 10 concurrent queries to http://localhost:4000/graphql, each querying for 100 events from the System log. 
> 
> Measure the response time for each query and report:
> 1. Min/max/average response time
> 2. Any failures
> 3. Whether all queries completed successfully"

---

## Summary

- **Start MCP**: `npm run dev` (development) or `npm start` (production)
- **GraphQL URL**: `http://localhost:4000/graphql`
- **Main Query**: `eventLogs(logName, limit, offset, filters...)`
- **Tell Claude**: The endpoint URL and what query to run
- **Let Claude**: Use HTTP tools to test the API

The MCP is fully functional and ready for testing once started!
