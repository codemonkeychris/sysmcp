/**
 * Tests for Result Mapper
 *
 * Verifies mapping from raw OLE DB recordset rows to typed FileSearchEntry objects.
 */

import { mapOleDbRow, mapOleDbRows } from '../result-mapper';

describe('mapOleDbRow', () => {
  it('should map a complete row correctly', () => {
    const row = {
      'System.ItemPathDisplay': 'C:\\Users\\test\\Documents\\report.pdf',
      'System.FileName': 'report.pdf',
      'System.FileExtension': '.pdf',
      'System.Size': 2048,
      'System.DateModified': '2024-01-15T10:30:00Z',
      'System.DateCreated': '2024-01-01T08:00:00Z',
      'System.Author': 'John Doe',
      'System.Title': 'Annual Report',
      'System.Keywords': 'finance;quarterly;2024'
    };

    const entry = mapOleDbRow(row);

    expect(entry.path).toBe('C:\\Users\\test\\Documents\\report.pdf');
    expect(entry.fileName).toBe('report.pdf');
    expect(entry.fileType).toBe('.pdf');
    expect(entry.size).toBe(2048);
    expect(entry.dateModified).toEqual(new Date('2024-01-15T10:30:00Z'));
    expect(entry.dateCreated).toEqual(new Date('2024-01-01T08:00:00Z'));
    expect(entry.author).toBe('John Doe');
    expect(entry.title).toBe('Annual Report');
    expect(entry.tags).toEqual(['finance', 'quarterly', '2024']);
  });

  it('should handle missing optional fields', () => {
    const row = {
      'System.ItemPathDisplay': 'C:\\test.txt',
      'System.FileName': 'test.txt',
      'System.FileExtension': '.txt',
      'System.Size': 100,
      'System.DateModified': '2024-01-15T10:30:00Z',
      'System.DateCreated': '2024-01-01T08:00:00Z'
    };

    const entry = mapOleDbRow(row);

    expect(entry.author).toBeUndefined();
    expect(entry.title).toBeUndefined();
    expect(entry.tags).toEqual([]);
  });

  it('should handle null fields', () => {
    const row = {
      'System.ItemPathDisplay': null,
      'System.FileName': null,
      'System.FileExtension': null,
      'System.Size': null,
      'System.DateModified': null,
      'System.DateCreated': null,
      'System.Author': null,
      'System.Title': null,
      'System.Keywords': null
    };

    const entry = mapOleDbRow(row);

    expect(entry.path).toBe('');
    expect(entry.fileName).toBe('');
    expect(entry.fileType).toBe('');
    expect(entry.size).toBe(0);
    expect(entry.dateModified).toEqual(new Date(0));
    expect(entry.dateCreated).toEqual(new Date(0));
    expect(entry.author).toBeUndefined();
    expect(entry.title).toBeUndefined();
    expect(entry.tags).toEqual([]);
  });

  it('should handle undefined fields', () => {
    const row: Record<string, unknown> = {};
    const entry = mapOleDbRow(row);

    expect(entry.path).toBe('');
    expect(entry.fileName).toBe('');
    expect(entry.size).toBe(0);
  });

  it('should normalize file extension', () => {
    // Without dot
    let entry = mapOleDbRow({ 'System.FileExtension': 'PDF' } as any);
    expect(entry.fileType).toBe('.pdf');

    // With dot, uppercase
    entry = mapOleDbRow({ 'System.FileExtension': '.PDF' } as any);
    expect(entry.fileType).toBe('.pdf');

    // Already lowercase with dot
    entry = mapOleDbRow({ 'System.FileExtension': '.txt' } as any);
    expect(entry.fileType).toBe('.txt');
  });

  it('should parse Date objects', () => {
    const date = new Date('2024-06-15T12:00:00Z');
    const row = {
      'System.DateModified': date,
      'System.DateCreated': date
    };

    const entry = mapOleDbRow(row as any);
    expect(entry.dateModified).toEqual(date);
    expect(entry.dateCreated).toEqual(date);
  });

  it('should parse numeric strings for size', () => {
    const row = { 'System.Size': '4096' } as any;
    const entry = mapOleDbRow(row);
    expect(entry.size).toBe(4096);
  });

  it('should handle array-valued keywords', () => {
    const row = { 'System.Keywords': ['tag1', 'tag2', 'tag3'] } as any;
    const entry = mapOleDbRow(row);
    expect(entry.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should handle array-valued author (take first)', () => {
    const row = { 'System.Author': ['Primary Author', 'Secondary Author'] } as any;
    const entry = mapOleDbRow(row);
    expect(entry.author).toBe('Primary Author');
  });

  it('should handle single string keywords', () => {
    const row = { 'System.Keywords': 'single-tag' } as any;
    const entry = mapOleDbRow(row);
    expect(entry.tags).toEqual(['single-tag']);
  });

  it('should handle empty string keywords', () => {
    const row = { 'System.Keywords': '' } as any;
    const entry = mapOleDbRow(row);
    expect(entry.tags).toEqual([]);
  });

  it('should filter empty values from semicolon-delimited tags', () => {
    const row = { 'System.Keywords': 'tag1;;tag2;' } as any;
    const entry = mapOleDbRow(row);
    expect(entry.tags).toEqual(['tag1', 'tag2']);
  });

  it('should trim semicolon-delimited values', () => {
    const row = { 'System.Keywords': ' tag1 ; tag2 ; tag3 ' } as any;
    const entry = mapOleDbRow(row);
    expect(entry.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });
});

describe('mapOleDbRows', () => {
  it('should map an array of rows', () => {
    const rows = [
      {
        'System.ItemPathDisplay': 'C:\\a.txt',
        'System.FileName': 'a.txt',
        'System.FileExtension': '.txt',
        'System.Size': 100,
        'System.DateModified': '2024-01-01',
        'System.DateCreated': '2024-01-01'
      },
      {
        'System.ItemPathDisplay': 'C:\\b.pdf',
        'System.FileName': 'b.pdf',
        'System.FileExtension': '.pdf',
        'System.Size': 200,
        'System.DateModified': '2024-02-01',
        'System.DateCreated': '2024-02-01'
      }
    ];

    const entries = mapOleDbRows(rows);

    expect(entries).toHaveLength(2);
    expect(entries[0].fileName).toBe('a.txt');
    expect(entries[1].fileName).toBe('b.pdf');
  });

  it('should handle OLE DB uppercase property names', () => {
    const row = {
      'SYSTEM.ITEMPATHDISPLAY': 'C:\\Users\\test\\report.pdf',
      'SYSTEM.FILENAME': 'report.pdf',
      'SYSTEM.FILEEXTENSION': '.pdf',
      'SYSTEM.SIZE': 2048,
      'SYSTEM.DATEMODIFIED': '2024-01-15T10:30:00Z',
      'SYSTEM.DATECREATED': '2024-01-01T08:00:00Z',
      'SYSTEM.AUTHOR': 'Jane Smith',
      'SYSTEM.TITLE': 'Report',
      'SYSTEM.KEYWORDS': 'finance;2024'
    };

    const entry = mapOleDbRow(row);

    expect(entry.path).toBe('C:\\Users\\test\\report.pdf');
    expect(entry.fileName).toBe('report.pdf');
    expect(entry.fileType).toBe('.pdf');
    expect(entry.size).toBe(2048);
    expect(entry.author).toBe('Jane Smith');
    expect(entry.title).toBe('Report');
    expect(entry.tags).toEqual(['finance', '2024']);
  });

  it('should handle empty array', () => {
    expect(mapOleDbRows([])).toEqual([]);
  });
});
