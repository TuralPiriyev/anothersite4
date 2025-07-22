export interface ParsedStatement {
  type: 'CREATE_TABLE' | 'ALTER_TABLE' | 'DROP_TABLE' | 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';
  tableName?: string;
  columns?: ParsedColumn[];
  operation?: string;
  conditions?: any;
  values?: any;
}

export interface ParsedColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
  references?: {
    table: string;
    column: string;
  };
}

export class SQLParser {
  static parseStatement(sql: string): ParsedStatement {
    const trimmed = sql.trim().replace(/;$/, '');
    const upperSQL = trimmed.toUpperCase();

    if (upperSQL.startsWith('CREATE TABLE')) {
      return this.parseCreateTable(trimmed);
    } else if (upperSQL.startsWith('ALTER TABLE')) {
      return this.parseAlterTable(trimmed);
    } else if (upperSQL.startsWith('DROP TABLE')) {
      return this.parseDropTable(trimmed);
    } else if (upperSQL.startsWith('INSERT')) {
      return this.parseInsert(trimmed);
    } else if (upperSQL.startsWith('UPDATE')) {
      return this.parseUpdate(trimmed);
    } else if (upperSQL.startsWith('DELETE')) {
      return this.parseDelete(trimmed);
    } else if (upperSQL.startsWith('SELECT')) {
      return this.parseSelect(trimmed);
    }

    throw new Error(`Unsupported SQL statement: ${sql}`);
  }

  private static parseCreateTable(sql: string): ParsedStatement {
    // Extract table name
    const tableNameMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i);
    if (!tableNameMatch) {
      throw new Error('Invalid CREATE TABLE statement: table name not found');
    }

    const tableName = tableNameMatch[1];

    // Extract column definitions
    const columnMatch = sql.match(/\((.*)\)/s);
    if (!columnMatch) {
      throw new Error('Invalid CREATE TABLE statement: column definitions not found');
    }

    const columns = this.parseColumnDefinitions(columnMatch[1]);

    return {
      type: 'CREATE_TABLE',
      tableName,
      columns
    };
  }

  private static parseColumnDefinitions(columnDefs: string): ParsedColumn[] {
    const columns: ParsedColumn[] = [];
    
    // Split by commas, but be careful of commas inside parentheses
    const parts = this.splitByComma(columnDefs);
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Skip constraint definitions for now
      if (trimmed.toUpperCase().startsWith('CONSTRAINT') || 
          trimmed.toUpperCase().startsWith('PRIMARY KEY') ||
          trimmed.toUpperCase().startsWith('FOREIGN KEY') ||
          trimmed.toUpperCase().startsWith('UNIQUE') ||
          trimmed.toUpperCase().startsWith('INDEX')) {
        continue;
      }

      const column = this.parseColumnDefinition(trimmed);
      if (column) {
        columns.push(column);
      }
    }

    return columns;
  }

  private static parseColumnDefinition(def: string): ParsedColumn | null {
    const parts = def.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const name = parts[0].replace(/[`'"]/g, '');
    const type = parts[1];
    
    const upperDef = def.toUpperCase();
    
    const column: ParsedColumn = {
      name,
      type,
      nullable: !upperDef.includes('NOT NULL'),
      primaryKey: upperDef.includes('PRIMARY KEY'),
      unique: upperDef.includes('UNIQUE')
    };

    // Extract default value
    const defaultMatch = def.match(/DEFAULT\s+([^,\s]+)/i);
    if (defaultMatch) {
      column.defaultValue = defaultMatch[1].replace(/['"]/g, '');
    }

    // Extract foreign key reference
    const referencesMatch = def.match(/REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/i);
    if (referencesMatch) {
      column.references = {
        table: referencesMatch[1],
        column: referencesMatch[2]
      };
    }

    return column;
  }

  private static parseAlterTable(sql: string): ParsedStatement {
    const tableNameMatch = sql.match(/ALTER\s+TABLE\s+`?(\w+)`?/i);
    if (!tableNameMatch) {
      throw new Error('Invalid ALTER TABLE statement: table name not found');
    }

    const tableName = tableNameMatch[1];
    
    // Determine the operation
    let operation = '';
    if (sql.toUpperCase().includes('ADD COLUMN')) {
      operation = 'ADD_COLUMN';
    } else if (sql.toUpperCase().includes('DROP COLUMN')) {
      operation = 'DROP_COLUMN';
    } else if (sql.toUpperCase().includes('MODIFY COLUMN')) {
      operation = 'MODIFY_COLUMN';
    } else if (sql.toUpperCase().includes('ADD CONSTRAINT')) {
      operation = 'ADD_CONSTRAINT';
    }

    return {
      type: 'ALTER_TABLE',
      tableName,
      operation
    };
  }

  private static parseDropTable(sql: string): ParsedStatement {
    const tableNameMatch = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?/i);
    if (!tableNameMatch) {
      throw new Error('Invalid DROP TABLE statement: table name not found');
    }

    return {
      type: 'DROP_TABLE',
      tableName: tableNameMatch[1]
    };
  }

  private static parseInsert(sql: string): ParsedStatement {
    const tableNameMatch = sql.match(/INSERT\s+INTO\s+`?(\w+)`?/i);
    if (!tableNameMatch) {
      throw new Error('Invalid INSERT statement: table name not found');
    }

    return {
      type: 'INSERT',
      tableName: tableNameMatch[1]
    };
  }

  private static parseUpdate(sql: string): ParsedStatement {
    const tableNameMatch = sql.match(/UPDATE\s+`?(\w+)`?/i);
    if (!tableNameMatch) {
      throw new Error('Invalid UPDATE statement: table name not found');
    }

    return {
      type: 'UPDATE',
      tableName: tableNameMatch[1]
    };
  }

  private static parseDelete(sql: string): ParsedStatement {
    const tableNameMatch = sql.match(/DELETE\s+FROM\s+`?(\w+)`?/i);
    if (!tableNameMatch) {
      throw new Error('Invalid DELETE statement: table name not found');
    }

    return {
      type: 'DELETE',
      tableName: tableNameMatch[1]
    };
  }

  private static parseSelect(sql: string): ParsedStatement {
    const fromMatch = sql.match(/FROM\s+`?(\w+)`?/i);
    
    return {
      type: 'SELECT',
      tableName: fromMatch ? fromMatch[1] : undefined
    };
  }

  private static splitByComma(str: string): string[] {
    const parts: string[] = [];
    let current = '';
    let parenDepth = 0;
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      
      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else if (!inQuotes && char === '(') {
        parenDepth++;
      } else if (!inQuotes && char === ')') {
        parenDepth--;
      } else if (!inQuotes && char === ',' && parenDepth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
      
      current += char;
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    return parts;
  }

  static validateSQL(sql: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      const statements = sql.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (!trimmed || trimmed.startsWith('--')) continue;
        
        try {
          this.parseStatement(trimmed);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : 'Unknown parsing error');
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown validation error');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default SQLParser;