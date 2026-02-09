/**
 * PowerShell Executor Module
 * 
 * Safely executes PowerShell commands and returns parsed output.
 * Handles timeouts, errors, and JSON parsing with proper security considerations.
 */

import { spawn } from 'child_process';

export interface ExecuteOptions {
  timeout?: number;
  shell?: string;
}

export class PowerShellExecutor {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  /**
   * Execute a PowerShell command and return raw output
   * 
   * @param command The PowerShell command to execute
   * @param options Execution options (timeout, shell)
   * @returns Promise resolving to command output string
   * @throws Error if command fails, times out, or returns non-zero exit code
   * 
   * @example
   * ```typescript
   * const executor = new PowerShellExecutor();
   * const output = await executor.execute('Get-Process');
   * ```
   */
  static async execute(command: string, options?: ExecuteOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = options?.timeout ?? PowerShellExecutor.DEFAULT_TIMEOUT;
      const shell = options?.shell ?? 'powershell.exe';

      let stdout = '';
      let stderr = '';

      const process = spawn(shell, ['-NoProfile', '-Command', command], {
        windowsHide: true,
        timeout
      });

      const timeoutHandle = setTimeout(() => {
        process.kill();
        reject(new Error(`PowerShell command timed out after ${timeout}ms`));
      }, timeout);

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(new Error(`Failed to execute PowerShell: ${error.message}`));
      });

      process.on('close', (code) => {
        clearTimeout(timeoutHandle);

        if (code !== 0) {
          reject(new Error(`PowerShell exited with code ${code}: ${stderr || stdout}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Execute a PowerShell command and parse JSON output
   * 
   * @template T The expected type of the JSON output
   * @param command The PowerShell command to execute
   * @param options Execution options (timeout, shell)
   * @returns Promise resolving to parsed JSON object
   * @throws Error if command fails, output is not valid JSON, or timeout occurs
   * 
   * @example
   * ```typescript
   * interface ProcessInfo {
   *   Name: string;
   *   Id: number;
   * }
   * const executor = new PowerShellExecutor();
   * const processes = await executor.executeJson<ProcessInfo[]>(
   *   'Get-Process | ConvertTo-Json'
   * );
   * ```
   */
  static async executeJson<T>(command: string, options?: ExecuteOptions): Promise<T> {
    const output = await PowerShellExecutor.execute(command, options);
    
    try {
      const trimmed = output.trim();
      if (!trimmed) {
        return [] as unknown as T;
      }
      return JSON.parse(trimmed) as T;
    } catch (error) {
      throw new Error(`Failed to parse PowerShell JSON output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
