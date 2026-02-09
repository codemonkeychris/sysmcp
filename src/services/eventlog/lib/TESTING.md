# Testing Guide - @sysmcp/eventlog-lib

Comprehensive guide for running, understanding, and extending tests for the EventLog library.

## Test Overview

**Total Tests**: 164 unit tests organized in 6 test suites
**Coverage**: >80% across all library components
**Framework**: Jest with TypeScript support

### Test Suite Breakdown

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| PowerShell Executor | `powershell-executor.test.ts` | 13 | 100% |
| EventLog Adapter | `eventlog-adapter.test.ts` | 31 | 95%+ |
| EventLog Library | `eventlog-library.test.ts` | 42 | 90%+ |
| PII Anonymizer | `anonymizer.test.ts` | 36 | 95%+ |
| Windows EventLog Library | `windows-eventlog-lib.test.ts` | 34 | 85%+ |
| Integration | `integration.manual.test.ts` | 8 | 80%+ |

## Running Tests

### Quick Start

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm test -- --watch

# Generate coverage report
npm test -- --coverage
```

### Running Specific Test Suite

```bash
# Run only PowerShell executor tests
npm test -- powershell-executor.test.ts

# Run only anonymizer tests
npm test -- anonymizer.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="should anonymize"
```

### Advanced Options

```bash
# Run tests with verbose output
npm test -- --verbose

# Run tests and update snapshots (if using snapshots)
npm test -- -u

# Show coverage threshold report
npm test -- --coverage --coverageReporters=text-summary

# Run single test file with extra details
npm test -- powershell-executor.test.ts --verbose --detectOpenHandles
```

## Test Configuration

### Jest Config

File: `jest.config.json`

```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "roots": ["<rootDir>/src"],
  "testMatch": ["**/__tests__/**/*.test.ts"],
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/__tests__/**",
    "!src/**/index.ts"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

**Key Points**:
- Uses ts-jest for TypeScript compilation
- Tests only in `__tests__` directories matching `*.test.ts`
- Excludes test files and index.ts from coverage calculation
- Enforces 80% coverage threshold on all metrics

## Test Suite Details

### PowerShellExecutor Tests (13 tests)

**Location**: `src/__tests__/powershell-executor.test.ts`

**What It Tests**:
- Successful command execution and JSON parsing
- Error handling (invalid JSON, command failures)
- Timeout enforcement
- Process cleanup

**Key Test Cases**:
```
✓ should execute valid PowerShell command and return parsed JSON
✓ should handle JSON array response
✓ should handle error output
✓ should timeout long-running commands
✓ should clean up processes on completion
```

**Integration**: This is the lowest-level component; mocking here affects all higher levels.

### EventLogAdapter Tests (31 tests)

**Location**: `src/__tests__/eventlog-adapter.test.ts`

**What It Tests**:
- PowerShell object → EventLogEntry transformation
- Field mapping correctness
- Data type conversions
- Handling missing/null fields
- Edge cases (undefined, empty strings, malformed data)

**Key Test Cases**:
```
✓ should transform PowerShell event object to EventLogEntry
✓ should map all event fields correctly
✓ should handle missing optional fields
✓ should handle null/undefined values
✓ should convert ISO dates to JavaScript Date objects
✓ should sanitize field values
```

**Integration**: Validates intermediate layer between PowerShell and library API.

### EventLogLibrary Tests (42 tests)

**Location**: `src/__tests__/eventlog-library.test.ts`

**What It Tests**:
- Query option validation
- PowerShell command building
- Filter application (time range, level, eventId, etc.)
- Pagination with hasMore flag
- Error handling (invalid log, permission denied, etc.)
- Real event log queries (if system has logs)

**Key Test Cases**:
```
✓ should query System event log
✓ should apply level filter
✓ should apply time range filter
✓ should apply event ID filter
✓ should handle pagination with offset
✓ should validate maxResults bounds
✓ should format dates for PowerShell correctly
✓ should handle permission denied gracefully
✓ should handle invalid log name
```

**Manual Integration Tests** (use environment variable):
```bash
ENABLE_INTEGRATION_TESTS=1 npm test -- eventlog-library.test.ts
```

This runs actual queries against System event log (requires admin privileges).

### PiiAnonymizer Tests (36 tests)

**Location**: `src/__tests__/anonymizer.test.ts`

**What It Tests**:
- All 6 PII pattern types
- Deterministic hash-based anonymization
- Mapping persistence and restoration
- Edge cases (null, empty, malformed data)
- Performance (1000 entries in <500ms)

**Key Test Cases**:
```
✓ should anonymize DOMAIN\username format
✓ should anonymize computer names in UPPERCASE
✓ should anonymize IPv4 addresses
✓ should anonymize IPv6 addresses
✓ should anonymize email addresses
✓ should anonymize Windows user profile paths
✓ should produce same token for same input (consistency)
✓ should produce different tokens for different inputs
✓ should handle multiple PII types in single message
✓ should persist mapping to file
✓ should load mapping from file
✓ should maintain consistency after reload
✓ should handle malformed data gracefully
✓ should anonymize 1000 entries in reasonable time
```

**Coverage Areas**:
- Individual pattern types
- Mixed patterns in single message
- Edge cases (nulls, empty, special characters)
- Persistence/reload scenarios
- Performance benchmarks

### WindowsEventLogLibrary Tests (34 tests)

**Location**: `src/__tests__/windows-eventlog-lib.test.ts`

**What It Tests**:
- Constructor option validation
- Query method with various filters
- Available log names retrieval
- Log metadata queries
- Anonymization integration
- Cleanup and resource management

**Key Test Cases**:
```
✓ should create library with default options
✓ should create library with custom options
✓ should reject invalid maxResults
✓ should query System log
✓ should apply filters (level, time range, message)
✓ should handle pagination
✓ should anonymize results when enabled
✓ should get available log names
✓ should filter available logs by whitelist
✓ should get log metadata
✓ should cleanup resources
```

**Integration Tests**:
```
✓ should handle complete workflow (get logs → get metadata → query)
✓ should handle multiple sequential queries
```

### Integration Tests (8 tests)

**Location**: `src/__tests__/integration.manual.test.ts`

**What It Tests**:
- End-to-end workflows combining all components
- Real event log queries (optional, requires system setup)
- Multiple query scenarios
- Anonymization with persistence

**Note**: These are marked as "manual" because they may require:
- Windows system with Event Logs
- Administrative privileges for some logs
- Test data in specific logs

**To Run Integration Tests**:
```bash
ENABLE_INTEGRATION_TESTS=1 npm test -- integration.manual.test.ts
```

## Writing Tests

### Test Structure

Use Jest's describe/test/expect pattern:

```typescript
describe('ComponentName', () => {
  describe('method name', () => {
    it('should do X given input Y', () => {
      // Arrange
      const input = { ... };
      
      // Act
      const result = component.method(input);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle error case Z', () => {
      // Arrange
      const invalidInput = { ... };
      
      // Act & Assert
      expect(() => component.method(invalidInput)).toThrow();
    });
  });
});
```

### Testing Best Practices

1. **One assertion per test** (or related assertions)
   ```typescript
   // Good
   it('should return success flag and entries', () => {
     const result = lib.query(...);
     expect(result.success).toBe(true);
     expect(result.entries).toBeDefined();
   });
   ```

2. **Descriptive test names**
   ```typescript
   // Bad: "should work"
   // Good: "should query System log and return typed entries"
   it('should query System log and return typed entries', () => { ... });
   ```

3. **Use setup/teardown**
   ```typescript
   beforeEach(() => {
     // Setup before each test
     library = new WindowsEventLogLibrary();
   });

   afterEach(async () => {
     // Cleanup after each test
     await library?.close();
   });
   ```

4. **Mock external dependencies**
   ```typescript
   jest.mock('../powershell-executor');
   const mockExecutor = PowerShellExecutor as jest.Mocked<typeof PowerShellExecutor>;
   
   mockExecutor.executeJson.mockResolvedValue([{ ... }]);
   ```

5. **Test edge cases**
   ```typescript
   // Empty input
   expect(anonymizer.anonymizeEntry({})).toBeDefined();
   
   // Null fields
   expect(anonymizer.anonymizeEntry({ userId: null })).toBeDefined();
   
   // Very large input
   const largeEntry = { message: 'x'.repeat(1000000) };
   expect(() => anonymizer.anonymizeEntry(largeEntry)).not.toThrow();
   ```

## Coverage Analysis

### Viewing Coverage

```bash
# Generate coverage report
npm test -- --coverage

# Output shows:
# File                    | % Stmts | % Branches | % Funcs | % Lines
# ──────────────────────────────────────────────────────────────────
# All files              |   95.2  |    92.1    |  96.3   |  95.2
```

### Coverage Report Details

**Statements**: Individual lines of code
**Branches**: If/else paths taken
**Functions**: All function definitions
**Lines**: Source lines (excludes comments, etc.)

### Improving Coverage

To increase coverage for a component:

1. **Find uncovered lines**:
   ```bash
   npm test -- --coverage --collectCoverageFrom="src/component.ts"
   ```

2. **Check coverage HTML report**:
   - Run tests with coverage flag
   - Open `coverage/lcov-report/index.html` in browser
   - Drill down to specific file to see highlighted uncovered lines

3. **Add test for uncovered scenario**:
   ```typescript
   it('should handle error case X', () => {
     // Test the uncovered branch
   });
   ```

## Performance Benchmarking

### Built-In Performance Tests

Some tests include performance assertions:

```typescript
it('should anonymize 1000 entries in <500ms', () => {
  const entries = Array(1000).fill({ ... });
  
  const start = Date.now();
  const results = entries.map(e => anonymizer.anonymizeEntry(e));
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(500);
});
```

### Manual Benchmarking

To benchmark a specific operation:

```typescript
const start = performance.now();

// Operation to benchmark
for (let i = 0; i < 1000; i++) {
  lib.query({ logName: 'System' });
}

const duration = performance.now() - start;
console.log(`1000 queries took ${duration}ms`);
```

## Debugging Tests

### Run Single Test

```bash
# Run one specific test
npm test -- anonymizer.test.ts -t "should anonymize email"
```

### Add Debug Output

```typescript
it('should transform event entry', () => {
  const input = { /* ... */ };
  const result = adapter.adapt(input);
  
  console.log('Input:', JSON.stringify(input, null, 2));
  console.log('Output:', JSON.stringify(result, null, 2));
  
  expect(result.eventId).toBe(input.Id);
});
```

### Use Node Debugger

```bash
# Run with Node inspector
node --inspect-brk ./node_modules/jest/bin/jest.js powershell-executor.test.ts

# Then open chrome://inspect in Chrome
```

### Watch Mode for Development

```bash
# Run tests in watch mode and automatically rerun on file changes
npm test -- --watch

# Only run tests matching a pattern
npm test -- --watch -t "should anonymize"
```

## Continuous Integration

### GitHub Actions (Example)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v2
        with:
          files: ./coverage/lcov.info
```

## Troubleshooting

### Tests Won't Run

**Problem**: `Cannot find module 'typescript'`
**Solution**: `npm install` in the library directory

### Permission Errors on Real Queries

**Problem**: Integration tests fail with "Permission denied"
**Solution**: Run tests with admin privileges or disable integration tests

### Tests Timeout

**Problem**: Tests hang and eventually timeout
**Solution**: Check for unclosed resources (PowerShell processes, file handles)
- Verify afterEach cleanup
- Check for missing `await` on async operations
- Use `--detectOpenHandles` flag

### Coverage Below Threshold

**Problem**: Coverage drops below 80%
**Solution**:
1. Run `npm test -- --coverage` to identify gaps
2. Add tests for uncovered branches
3. Check if 80% threshold should be adjusted

## Test Maintenance

### Updating Tests

When code changes:

1. Run affected tests: `npm test -- --testNamePattern="component name"`
2. Update tests if behavior changed
3. Ensure all tests still pass: `npm test`
4. Verify coverage maintained: `npm test -- --coverage`

### Adding New Tests

When adding new functionality:

1. Create test case describing expected behavior
2. Run tests (should fail: TDD approach)
3. Implement feature
4. Run tests (should pass)
5. Verify coverage >80%

### Removing Tests

Only remove tests when:

1. Feature is removed from codebase
2. Test is redundant (covered by another test)
3. Implementation approach changed significantly

## Performance Targets

- PowerShell command execution: <100ms (base)
- EventLog query: <500ms for 100 events
- Anonymization: <5ms per entry
- All tests combined: <30 seconds
- Coverage collection: <60 seconds

If tests exceed these targets, investigate:
- Slow system event log operations
- Network delays
- Disk I/O for file-based tests
- Large test datasets

## Resources

- [Jest Documentation](https://jestjs.io/)
- [TypeScript Testing Guide](https://www.typescriptlang.org/docs/handbook/testing.html)
- [Node.js Test Best Practices](https://nodejs.org/en/docs/guides/testing/)
