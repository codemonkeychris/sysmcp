/**
 * Scope Restriction Validator
 *
 * Validates and normalizes file paths against configured allowed search scopes.
 * Enforces security boundaries to prevent searching outside allowed directories.
 */

import * as path from 'path';

/**
 * Validation result for a path
 */
export interface ScopeValidationResult {
  valid: boolean;
  normalizedPath: string;
  error?: string;
}

/**
 * ScopeValidator - Enforces path scope restrictions
 *
 * When allowedPaths is empty, all local paths are allowed (MVP behavior).
 * When configured, restricts searches to only allowed paths.
 */
export class ScopeValidator {
  private readonly allowedPaths: string[];

  /**
   * @param allowedPaths - List of allowed search scope paths. Empty = all paths allowed.
   */
  constructor(allowedPaths: string[] = []) {
    this.allowedPaths = allowedPaths.map(p => this.normalizePath(p));
  }

  /**
   * Check if a path is within the allowed scope
   *
   * @param inputPath - Path to validate
   * @returns true if the path is within an allowed scope
   */
  public isPathAllowed(inputPath: string): boolean {
    const result = this.validateAndNormalize(inputPath);
    return result.valid;
  }

  /**
   * Normalize a path: resolve '..' segments, normalize separators, lowercase on Windows
   *
   * @param inputPath - Path to normalize
   * @returns Normalized path string
   */
  public normalizePath(inputPath: string): string {
    // Replace forward slashes with backslashes for Windows consistency
    let normalized = inputPath.replace(/\//g, '\\');
    // Resolve the path to eliminate .. and . segments
    normalized = path.resolve(normalized);
    // Lowercase for case-insensitive comparison on Windows
    normalized = normalized.toLowerCase();
    return normalized;
  }

  /**
   * Validate a path against scope restrictions and normalize it
   *
   * @param inputPath - Path to validate
   * @returns Validation result with normalized path and optional error
   */
  public validateAndNormalize(inputPath: string): ScopeValidationResult {
    if (!inputPath || inputPath.trim().length === 0) {
      return { valid: false, normalizedPath: '', error: 'Path cannot be empty' };
    }

    // SECURITY: Reject UNC paths for MVP
    if (inputPath.startsWith('\\\\') || inputPath.startsWith('//')) {
      return {
        valid: false,
        normalizedPath: '',
        error: 'UNC paths are not supported'
      };
    }

    // SECURITY: Reject paths with raw '..' before normalization
    // (path.resolve handles it, but we want to detect traversal attempts)
    const hasTraversal = inputPath.split(/[/\\]/).some(seg => seg === '..');
    if (hasTraversal) {
      return {
        valid: false,
        normalizedPath: '',
        error: 'Path traversal (..) is not allowed'
      };
    }

    const normalized = this.normalizePath(inputPath);

    // If no allowed paths configured, all local paths are allowed
    if (this.allowedPaths.length === 0) {
      return { valid: true, normalizedPath: normalized };
    }

    // Check if normalized path is under at least one allowed path
    const isUnderAllowed = this.allowedPaths.some(
      allowed => normalized === allowed || normalized.startsWith(allowed + '\\')
    );

    if (!isUnderAllowed) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: 'Path is outside allowed search scope'
      };
    }

    return { valid: true, normalizedPath: normalized };
  }
}
