/**
 * Windows Search SQL Query Builder
 *
 * Translates FileSearchQueryParams into Windows Search SQL queries.
 * SECURITY: This is the most security-critical component. Windows Search SQL
 * via OLE DB does NOT support parameterized queries, so all user input must
 * be manually sanitized to prevent SQL injection.
 */

import { FileSearchQueryParams, SearchMode } from './types';

/**
 * Built query result containing main query, count query, and pagination info
 */
export interface BuiltQuery {
  /** Main SQL query to execute */
  sql: string;
  /** Count query to get total results */
  countSql: string;
  /** Client-side offset to apply to results */
  offset: number;
  /** Number of results to return */
  limit: number;
}

/**
 * Columns selected from the Windows Search index
 */
const SELECT_COLUMNS = [
  'System.ItemPathDisplay',
  'System.FileName',
  'System.FileExtension',
  'System.Size',
  'System.DateModified',
  'System.DateCreated',
  'System.Author',
  'System.Title',
  'System.Keywords'
].join(', ');

/**
 * SECURITY: Sanitize a string value for use in SQL by escaping single quotes
 */
export function sanitizeStringValue(value: string): string {
  if (typeof value !== 'string') return '';
  return value.replace(/'/g, "''");
}

/**
 * SECURITY: Sanitize search text for CONTAINS/FREETEXT expressions.
 * Escapes double quotes and strips dangerous SQL keywords.
 */
export function sanitizeSearchText(text: string): string {
  if (typeof text !== 'string') return '';
  // Limit length to prevent abuse
  let sanitized = text.substring(0, 500);
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  // Escape double quotes (used in CONTAINS phrase matching)
  sanitized = sanitized.replace(/"/g, '');
  // Strip dangerous SQL keywords (case-insensitive)
  const dangerousKeywords = /\b(DROP|DELETE|INSERT|UPDATE|EXEC|EXECUTE|ALTER|CREATE|UNION|TRUNCATE|GRANT|REVOKE)\b/gi;
  sanitized = sanitized.replace(dangerousKeywords, '');
  // Escape single quotes
  sanitized = sanitized.replace(/'/g, "''");
  // Remove semicolons (statement separation)
  sanitized = sanitized.replace(/;/g, '');
  // Remove SQL comments
  sanitized = sanitized.replace(/--/g, '');
  sanitized = sanitized.replace(/\/\*/g, '');
  sanitized = sanitized.replace(/\*\//g, '');
  return sanitized.trim();
}

/**
 * SECURITY: Sanitize filename pattern. Only allows * and ? wildcards.
 */
export function sanitizeFileName(pattern: string): string {
  if (typeof pattern !== 'string') return '';
  let sanitized = pattern.substring(0, 260);
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  // Translate wildcards: * → %, ? → _
  sanitized = sanitized.replace(/\*/g, '%');
  sanitized = sanitized.replace(/\?/g, '_');
  // Escape SQL special chars (except our translated wildcards)
  sanitized = sanitized.replace(/'/g, "''");
  // Remove brackets which have special meaning in LIKE
  sanitized = sanitized.replace(/\[/g, '');
  sanitized = sanitized.replace(/]/g, '');
  return sanitized;
}

/**
 * SECURITY: Sanitize file type extension. Must be .ext format, alphanumeric only.
 */
export function sanitizeFileType(ext: string): string {
  if (typeof ext !== 'string') return '';
  let sanitized = ext.trim().toLowerCase();
  // Ensure it starts with a dot
  if (!sanitized.startsWith('.')) {
    sanitized = '.' + sanitized;
  }
  // Allow only alphanumeric characters after the dot
  if (!/^\.[a-z0-9]+$/.test(sanitized)) {
    throw new Error(`Invalid file type: ${ext}. Must be alphanumeric (e.g., .pdf, .docx)`);
  }
  return sanitized;
}

/**
 * Validate a numeric value
 */
export function validateNumeric(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    throw new Error('Invalid numeric value');
  }
  return value;
}

/**
 * Format a Date for use in Windows Search SQL
 */
export function formatDateForSql(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date value');
  }
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Build the SCOPE clause from a path parameter
 */
export function buildScopeClause(filePath: string): string {
  // Normalize path: replace backslashes with forward slashes for SCOPE URL
  const normalized = filePath.replace(/\\/g, '/');
  const sanitized = sanitizeStringValue(normalized);
  return `SCOPE='file:${sanitized}'`;
}

/**
 * Build all WHERE predicates from query parameters
 */
export function buildFilterPredicates(params: FileSearchQueryParams): string[] {
  const predicates: string[] = [];

  // Full-text search (CONTAINS or FREETEXT)
  if (params.searchText) {
    const sanitized = sanitizeSearchText(params.searchText);
    if (sanitized.length > 0) {
      const mode = params.searchMode === SearchMode.FREETEXT ? 'FREETEXT' : 'CONTAINS';
      if (mode === 'CONTAINS') {
        predicates.push(`CONTAINS(*, '"${sanitized}"')`);
      } else {
        predicates.push(`FREETEXT(*, '${sanitized}')`);
      }
    }
  }

  // File name pattern
  if (params.fileName) {
    const sanitized = sanitizeFileName(params.fileName);
    predicates.push(`System.FileName LIKE '${sanitized}'`);
  }

  // File type
  if (params.fileType) {
    const sanitized = sanitizeFileType(params.fileType);
    predicates.push(`System.FileExtension = '${sanitized}'`);
  }

  // Size range
  if (params.minSize !== undefined && params.minSize !== null) {
    const val = validateNumeric(params.minSize);
    predicates.push(`System.Size >= ${val}`);
  }
  if (params.maxSize !== undefined && params.maxSize !== null) {
    const val = validateNumeric(params.maxSize);
    predicates.push(`System.Size <= ${val}`);
  }

  // Date modified range
  if (params.modifiedAfter) {
    const formatted = formatDateForSql(params.modifiedAfter);
    predicates.push(`System.DateModified >= '${formatted}'`);
  }
  if (params.modifiedBefore) {
    const formatted = formatDateForSql(params.modifiedBefore);
    predicates.push(`System.DateModified <= '${formatted}'`);
  }

  // Date created range
  if (params.createdAfter) {
    const formatted = formatDateForSql(params.createdAfter);
    predicates.push(`System.DateCreated >= '${formatted}'`);
  }
  if (params.createdBefore) {
    const formatted = formatDateForSql(params.createdBefore);
    predicates.push(`System.DateCreated <= '${formatted}'`);
  }

  // Author
  if (params.author) {
    const sanitized = sanitizeStringValue(params.author);
    predicates.push(`System.Author = '${sanitized}'`);
  }

  return predicates;
}

/**
 * Build a complete Windows Search SQL query from parameters
 *
 * @param params - Search query parameters
 * @returns Built query with main SQL, count SQL, offset, and limit
 */
export function buildSearchQuery(params: FileSearchQueryParams): BuiltQuery {
  const limit = params.limit;
  const offset = params.offset;

  // Build WHERE clause components
  const scopeClause = params.path ? buildScopeClause(params.path) : '';
  const predicates = buildFilterPredicates(params);

  // Combine WHERE clauses
  const allConditions: string[] = [];
  if (scopeClause) {
    allConditions.push(scopeClause);
  }
  allConditions.push(...predicates);

  const whereClause = allConditions.length > 0
    ? `WHERE ${allConditions.join(' AND ')}`
    : '';

  // TOP clause: fetch offset + limit + 1 (to detect hasNextPage)
  const topCount = offset + limit + 1;

  // Main query
  const sql = `SELECT TOP ${topCount} ${SELECT_COLUMNS} FROM SystemIndex ${whereClause} ORDER BY System.DateModified DESC`;

  // Count query
  const countSql = `SELECT COUNT(*) FROM SystemIndex ${whereClause}`;

  return { sql, countSql, offset, limit };
}
