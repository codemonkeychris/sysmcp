/**
 * Result Mapper
 *
 * Maps raw OLE DB recordset rows to typed FileSearchEntry objects.
 * Handles null/undefined/missing fields and multi-valued properties.
 */

import { FileSearchEntry } from './types';

/**
 * Parse a multi-valued property that may be an array, semicolon-delimited string, or single value
 */
function parseMultiValuedString(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(v => String(v)).filter(v => v.length > 0);
  const str = String(value).trim();
  if (str.length === 0) return [];
  if (str.includes(';')) return str.split(';').map(s => s.trim()).filter(s => s.length > 0);
  return [str];
}

/**
 * Extract the first value from a multi-valued property
 */
function parseMultiValuedFirst(value: unknown): string | undefined {
  const values = parseMultiValuedString(value);
  return values.length > 0 ? values[0] : undefined;
}

/**
 * Safely parse a date from OLE DB result
 */
function parseDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return new Date(0);
}

/**
 * Safely parse a number from OLE DB result
 */
function parseNumber(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const num = Number(value);
    if (!isNaN(num)) return num;
  }
  return defaultValue;
}

/**
 * Normalize file extension to lowercase with leading dot
 */
function normalizeFileExtension(ext: unknown): string {
  if (ext === null || ext === undefined) return '';
  let str = String(ext).trim().toLowerCase();
  if (str.length > 0 && !str.startsWith('.')) {
    str = '.' + str;
  }
  return str;
}

/**
 * Map a single OLE DB row to a FileSearchEntry.
 * 
 * SECURITY: OLE DB returns property names in UPPERCASE.
 * We normalize keys to handle both case variants.
 *
 * @param row - Raw OLE DB recordset row with Windows Search property names
 * @returns Typed FileSearchEntry
 */
export function mapOleDbRow(row: Record<string, unknown>): FileSearchEntry {
  // Normalize keys to handle OLE DB uppercase property names
  const r: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    r[key.toUpperCase()] = row[key];
  }

  return {
    path: String(r['SYSTEM.ITEMPATHDISPLAY'] ?? ''),
    fileName: String(r['SYSTEM.FILENAME'] ?? ''),
    fileType: normalizeFileExtension(r['SYSTEM.FILEEXTENSION']),
    size: parseNumber(r['SYSTEM.SIZE']),
    dateModified: parseDate(r['SYSTEM.DATEMODIFIED']),
    dateCreated: parseDate(r['SYSTEM.DATECREATED']),
    author: parseMultiValuedFirst(r['SYSTEM.AUTHOR']),
    title: r['SYSTEM.TITLE'] != null ? String(r['SYSTEM.TITLE']) : undefined,
    tags: parseMultiValuedString(r['SYSTEM.KEYWORDS'])
  };
}

/**
 * Map multiple OLE DB rows to FileSearchEntry array
 *
 * @param rows - Array of raw OLE DB recordset rows
 * @returns Array of typed FileSearchEntry objects
 */
export function mapOleDbRows(rows: Record<string, unknown>[]): FileSearchEntry[] {
  return rows.map(mapOleDbRow);
}
