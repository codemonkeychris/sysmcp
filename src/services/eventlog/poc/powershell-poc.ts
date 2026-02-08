/**
 * Windows EventLog POC - PowerShell Approach
 *
 * This is a proof-of-concept demonstrating querying Windows EventLog
 * using PowerShell Get-WinEvent with JSON serialization.
 *
 * Usage:
 *   npx ts-node powershell-poc.ts [options]
 *
 * Options:
 *   --log-name System        Event log to query (System, Application, Security, etc.)
 *   --max-events 10         Maximum events to retrieve
 *   --admin                 Indicate running with admin privileges
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

interface WindowsEvent {
  Id: number;
  ProviderName: string;
  LevelDisplayName: string;
  TimeCreated: string;
  Computer: string;
  Message: string;
  RecordId: number;
}

interface QueryOptions {
  logName: string;
  maxEvents?: number;
  filterHashtable?: Record<string, unknown>;
}

interface QueryResult {
  success: boolean;
  events: WindowsEvent[];
  error?: string;
  message?: string;
  warning?: string;
}

/**
 * Execute a PowerShell query to retrieve EventLog entries
 *
 * @param options Query options
 * @returns Promise<QueryResult>
 */
async function queryEventLog(options: QueryOptions): Promise<QueryResult> {
  const { logName, maxEvents = 10, filterHashtable = {} } = options;

  // Build PowerShell command
  // Using ConvertTo-Json for easy parsing
  let psCommand = `
    try {
      $maxEvents = ${maxEvents}
      $logName = '${logName}'
      
      # Build filter if specified
      $filter = @{
        LogName = $logName
      }
      
      # Merge additional filter criteria
      $additionalFilter = @{
        ${Object.entries(filterHashtable)
          .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
          .join('\n        ')}
      }
      
      foreach ($key in $additionalFilter.Keys) {
        $filter[$key] = $additionalFilter[$key]
      }
      
      # Query the event log
      $events = @(Get-WinEvent -FilterHashtable $filter -MaxEvents $maxEvents -ErrorAction SilentlyContinue)
      
      # Select only needed properties and convert to JSON
      $result = $events | Select-Object -Property @(
        'Id',
        'ProviderName',
        @{Name='LevelDisplayName';Expression={$_.LevelDisplayName}},
        @{Name='TimeCreated';Expression={$_.TimeCreated.ToString('o')}},
        'Computer',
        'Message',
        'RecordId'
      ) | ConvertTo-Json -AsArray
      
      Write-Output "SUCCESS:$result"
    }
    catch {
      $errorMsg = $_.Exception.Message
      if ($errorMsg -like '*Access is denied*' -or $errorMsg -like '*Requested registry access is not allowed*') {
        Write-Output "PERMISSION_DENIED:Log '$logName' requires administrator privileges"
      }
      elseif ($errorMsg -like '*No matching results*' -or $errorMsg -like '*No events were found*') {
        Write-Output "SUCCESS:[]"
      }
      else {
        Write-Output "ERROR:$errorMsg"
      }
    }
  `.trim();

  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    ps.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ps.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ps.on('close', (code) => {
      if (code !== 0 && !stdout) {
        resolve({
          success: false,
          events: [],
          error: 'PowerShell execution failed',
          message: stderr || 'Unknown error',
        });
        return;
      }

      const output = stdout.trim();

      // Parse response format: STATUS:DATA
      const [status, ...dataParts] = output.split(':');
      const data = dataParts.join(':'); // In case data contains colons

      if (status === 'SUCCESS') {
        try {
          // Parse JSON response
          const events: WindowsEvent[] = data === '[]' ? [] : JSON.parse(data);

          resolve({
            success: true,
            events: Array.isArray(events) ? events : [events],
            message: `Retrieved ${events.length} events`,
          });
        } catch (err) {
          resolve({
            success: false,
            events: [],
            error: 'Failed to parse response',
            message: (err as Error).message,
          });
        }
      } else if (status === 'PERMISSION_DENIED') {
        resolve({
          success: false,
          events: [],
          error: 'Permission Denied',
          message: data,
          warning: 'Try running with administrator privileges',
        });
      } else if (status === 'ERROR') {
        resolve({
          success: false,
          events: [],
          error: 'Query failed',
          message: data,
        });
      } else {
        resolve({
          success: false,
          events: [],
          error: 'Unexpected response format',
          message: output,
        });
      }
    });

    ps.on('error', (err) => {
      resolve({
        success: false,
        events: [],
        error: 'Failed to spawn PowerShell',
        message: (err as Error).message,
      });
    });
  });
}

/**
 * Format a single event for display
 */
function formatEvent(event: WindowsEvent): string {
  return `
  [${event.Id}] ${event.TimeCreated}
  Level: ${event.LevelDisplayName}
  Source: ${event.ProviderName}
  Computer: ${event.Computer}
  Message: ${event.Message ? event.Message.substring(0, 100) + (event.Message.length > 100 ? '...' : '') : '(empty)'}
  `;
}

/**
 * Main: Run POC demonstrations
 */
async function main() {
  console.log('=== Windows EventLog POC - PowerShell Approach ===\n');

  // Test 1: Query System log
  console.log('Test 1: Querying System event log (10 events)...');
  let result = await queryEventLog({
    logName: 'System',
    maxEvents: 10,
  });

  if (result.success) {
    console.log(`✓ Success: Retrieved ${result.events.length} events\n`);
    result.events.forEach((event, idx) => {
      console.log(`Event ${idx + 1}:${formatEvent(event)}`);
    });
  } else {
    console.log(`✗ Failed: ${result.error}`);
    console.log(`  Message: ${result.message}`);
    if (result.warning) {
      console.log(`  Warning: ${result.warning}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 2: Query Application log
  console.log('Test 2: Querying Application event log (5 events)...');
  result = await queryEventLog({
    logName: 'Application',
    maxEvents: 5,
  });

  if (result.success) {
    console.log(`✓ Success: Retrieved ${result.events.length} events\n`);
    result.events.forEach((event, idx) => {
      console.log(`Event ${idx + 1}:${formatEvent(event)}`);
    });
  } else {
    console.log(`✗ Failed: ${result.error}`);
    console.log(`  Message: ${result.message}`);
    if (result.warning) {
      console.log(`  Warning: ${result.warning}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 3: Attempt Security log (may fail without admin)
  console.log(
    'Test 3: Querying Security event log (10 events - may require admin)...'
  );
  result = await queryEventLog({
    logName: 'Security',
    maxEvents: 10,
  });

  if (result.success) {
    console.log(`✓ Success: Retrieved ${result.events.length} events\n`);
    result.events.slice(0, 3).forEach((event, idx) => {
      console.log(`Event ${idx + 1}:${formatEvent(event)}`);
    });
    if (result.events.length > 3) {
      console.log(`... and ${result.events.length - 3} more events`);
    }
  } else {
    console.log(`✗ Failed: ${result.error}`);
    console.log(`  Message: ${result.message}`);
    if (result.warning) {
      console.log(`  Warning: ${result.warning}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 4: Query with filter (last 1 hour)
  console.log('Test 4: Querying System log with time filter (last 1 hour)...');
  result = await queryEventLog({
    logName: 'System',
    maxEvents: 5,
    filterHashtable: {
      StartTime: new Date(Date.now() - 3600000).toISOString(),
    },
  });

  if (result.success) {
    console.log(`✓ Success: Retrieved ${result.events.length} events\n`);
    result.events.forEach((event, idx) => {
      console.log(`Event ${idx + 1}:${formatEvent(event)}`);
    });
  } else {
    console.log(`✗ Failed: ${result.error}`);
    console.log(`  Message: ${result.message}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');
  console.log('POC Tests Complete\n');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { queryEventLog, QueryOptions, QueryResult, WindowsEvent };
