import { SQLParser } from '../../../../utils/sqlParser';

describe('SQLParser Integration', () => {
  describe('Enhanced CREATE TABLE parsing', () => {
    it('parses CREATE TABLE with foreign keys', () => {
      const sql = `
        CREATE TABLE orders (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          product_id INT NOT NULL,
          quantity INT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `;

      const result = SQLParser.parseStatement(sql);

      expect(result.type).toBe('CREATE_TABLE');
      expect(result.tableName).toBe('orders');
      expect(result.columns).toHaveLength(5);
      
      const userIdColumn = result.columns!.find(col => col.name === 'user_id');
      expect(userIdColumn?.references).toEqual({
        table: 'users',
        column: 'id'
      });
    });

    it('validates complex schema with relationships', () => {
      const sql = `
        CREATE TABLE users (
          id INT PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL
        );
        
        CREATE TABLE orders (
          id INT PRIMARY KEY,
          user_id INT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `;

      const result = SQLParser.validateSQL(sql);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects circular foreign key dependencies', () => {
      const sql = `
        CREATE TABLE table_a (
          id INT PRIMARY KEY,
          b_id INT,
          FOREIGN KEY (b_id) REFERENCES table_b(id)
        );
        
        CREATE TABLE table_b (
          id INT PRIMARY KEY,
          a_id INT,
          FOREIGN KEY (a_id) REFERENCES table_a(id)
        );
      `;

      const result = SQLParser.validateSQL(sql);
      // This should detect the circular dependency
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('ALTER TABLE parsing', () => {
    it('parses ADD COLUMN statements', () => {
      const sql = 'ALTER TABLE users ADD COLUMN phone VARCHAR(20)';
      const result = SQLParser.parseStatement(sql);

      expect(result.type).toBe('ALTER_TABLE');
      expect(result.tableName).toBe('users');
      expect(result.operation).toBe('ADD_COLUMN');
    });

    it('parses DROP COLUMN statements', () => {
      const sql = 'ALTER TABLE users DROP COLUMN phone';
      const result = SQLParser.parseStatement(sql);

      expect(result.type).toBe('ALTER_TABLE');
      expect(result.tableName).toBe('users');
      expect(result.operation).toBe('DROP_COLUMN');
    });

    it('parses ADD CONSTRAINT statements', () => {
      const sql = 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)';
      const result = SQLParser.parseStatement(sql);

      expect(result.type).toBe('ALTER_TABLE');
      expect(result.tableName).toBe('orders');
      expect(result.operation).toBe('ADD_CONSTRAINT');
    });
  });

  describe('Import functionality', () => {
    it('handles mixed SQL statements', () => {
      const sql = `
        -- User table
        CREATE TABLE users (
          id INT PRIMARY KEY AUTO_INCREMENT,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Orders table with foreign key
        CREATE TABLE orders (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          total DECIMAL(10,2) DEFAULT 0.00,
          status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `;

      const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
      
      statements.forEach(statement => {
        const trimmed = statement.trim();
        if (trimmed) {
          const result = SQLParser.parseStatement(trimmed);
          expect(result.type).toBe('CREATE_TABLE');
          expect(result.tableName).toBeTruthy();
        }
      });
    });

    it('handles PostgreSQL syntax', () => {
      const sql = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;

      const result = SQLParser.parseStatement(sql);
      expect(result.type).toBe('CREATE_TABLE');
      expect(result.tableName).toBe('users');
      
      const idColumn = result.columns!.find(col => col.name === 'id');
      expect(idColumn?.type).toBe('SERIAL');
      expect(idColumn?.primaryKey).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('provides meaningful error messages', () => {
      const invalidSQL = 'CREATE TABLE';
      
      expect(() => {
        SQLParser.parseStatement(invalidSQL);
      }).toThrow('Invalid CREATE TABLE statement');
    });

    it('handles malformed foreign key syntax', () => {
      const sql = `
        CREATE TABLE orders (
          id INT PRIMARY KEY,
          user_id INT,
          FOREIGN KEY (user_id) REFERENCES
        )
      `;

      const result = SQLParser.validateSQL(sql);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});