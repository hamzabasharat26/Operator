import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from project root
// In ES modules, we need to specify the path explicitly
const envPath = path.resolve(__dirname, '..', '.env')
dotenv.config({ path: envPath })

// Database configuration interface
interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  waitForConnections: boolean
  connectionLimit: number
  queueLimit: number
}

// Get database configuration from environment variables
const getDatabaseConfig = (): DatabaseConfig => {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  }
}

// Create connection pool
let pool: mysql.Pool | null = null

/**
 * Initialize database connection pool
 */
export const initializeDatabase = async (): Promise<void> => {
  try {
    const config = getDatabaseConfig()

    if (!config.database) {
      throw new Error('Database name (DB_NAME) is required in environment variables')
    }

    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: config.waitForConnections,
      connectionLimit: config.connectionLimit,
      queueLimit: config.queueLimit,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })

    // Test the connection
    const connection = await pool.getConnection()
    await connection.ping()
    connection.release()

    console.log('✅ Database connection pool initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize database:', error)
    throw error
  }
}

/**
 * Get the database connection pool
 */
export const getPool = (): mysql.Pool => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.')
  }
  return pool
}

/**
 * Execute a query with parameters (using prepared statements)
 */
export const query = async <T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> => {
  try {
    const pool = getPool()
    const [rows] = await pool.execute<any>(sql, params || [])
    return rows as T[]
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

/**
 * Execute a query and return the first row
 */
export const queryOne = async <T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> => {
  const rows = await query<T>(sql, params)
  return rows.length > 0 ? rows[0] : null
}

/**
 * Execute an INSERT, UPDATE, or DELETE query
 * Returns the affected rows count and insertId (if applicable)
 */
export const execute = async (
  sql: string,
  params?: any[]
): Promise<{ affectedRows: number; insertId?: number }> => {
  try {
    const pool = getPool()
    const [result] = await pool.execute<mysql.ResultSetHeader>(sql, params || [])
    return {
      affectedRows: result.affectedRows,
      insertId: result.insertId,
    }
  } catch (error) {
    console.error('Database execute error:', error)
    throw error
  }
}

/**
 * Begin a transaction
 */
export const beginTransaction = async (): Promise<mysql.PoolConnection> => {
  const pool = getPool()
  const connection = await pool.getConnection()
  await connection.beginTransaction()
  return connection
}

/**
 * Commit a transaction
 */
export const commitTransaction = async (connection: mysql.PoolConnection): Promise<void> => {
  await connection.commit()
  connection.release()
}

/**
 * Rollback a transaction
 */
export const rollbackTransaction = async (connection: mysql.PoolConnection): Promise<void> => {
  await connection.rollback()
  connection.release()
}

/**
 * Close the database connection pool
 */
export const closeDatabase = async (): Promise<void> => {
  if (pool) {
    await pool.end()
    pool = null
    console.log('✅ Database connection pool closed')
  }
}

