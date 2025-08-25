import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../config/database';
import { UserExpectations, UserExpectationsRow } from '../../types/models';

/**
 * Manages user expectations for email importance filtering
 * Handles storage, retrieval, and validation of user-defined filtering criteria
 */
export class UserExpectationsManager {
  /**
   * Create new user expectations
   */
  async createExpectations(
    userId: string,
    title: string,
    description: string,
    examples?: { important: string[]; notImportant: string[] }
  ): Promise<UserExpectations> {
    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    // Validate inputs
    this.validateExpectationInputs(title, description, examples);

    // Deactivate existing expectations for this user
    await db.run(
      'UPDATE user_expectations SET is_active = 0, updated_at = ? WHERE user_id = ? AND is_active = 1',
      [now, userId]
    );

    // Insert new expectations
    await db.run(`
      INSERT INTO user_expectations (
        id, user_id, title, description, is_active, created_at, updated_at,
        important_examples, not_important_examples
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
    `, [
      id,
      userId,
      title,
      description,
      now,
      now,
      examples?.important ? JSON.stringify(examples.important) : '[]',
      examples?.notImportant ? JSON.stringify(examples.notImportant) : '[]'
    ]);

    return this.getExpectationsById(id);
  }

  /**
   * Get active expectations for a user
   */
  async getActiveExpectations(userId: string): Promise<UserExpectations | null> {
    const db = await getDatabase();
    const row = await db.get<UserExpectationsRow>(
      'SELECT * FROM user_expectations WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    return row ? this.transformRowToModel(row) : null;
  }

  /**
   * Get expectations by ID
   */
  async getExpectationsById(id: string): Promise<UserExpectations> {
    const db = await getDatabase();
    const row = await db.get<UserExpectationsRow>(
      'SELECT * FROM user_expectations WHERE id = ?',
      [id]
    );

    if (!row) {
      throw new Error(`User expectations not found with id: ${id}`);
    }

    return this.transformRowToModel(row);
  }

  /**
   * Get all expectations for a user (including inactive ones)
   */
  async getAllExpectationsForUser(userId: string): Promise<UserExpectations[]> {
    const db = await getDatabase();
    const rows = await db.all<UserExpectationsRow[]>(
      'SELECT * FROM user_expectations WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    return rows.map(row => this.transformRowToModel(row));
  }

  /**
   * Update existing expectations
   */
  async updateExpectations(
    id: string,
    updates: {
      title?: string;
      description?: string;
      examples?: { important: string[]; notImportant: string[] };
    }
  ): Promise<UserExpectations> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    // Get existing expectations
    const existing = await this.getExpectationsById(id);

    // Validate inputs if provided
    if (updates.title !== undefined || updates.description !== undefined || updates.examples !== undefined) {
      this.validateExpectationInputs(
        updates.title !== undefined ? updates.title : existing.title,
        updates.description !== undefined ? updates.description : existing.description,
        updates.examples !== undefined ? updates.examples : existing.examples
      );
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (updates.title) {
      updateFields.push('title = ?');
      updateValues.push(updates.title);
    }

    if (updates.description) {
      updateFields.push('description = ?');
      updateValues.push(updates.description);
    }

    if (updates.examples) {
      updateFields.push('important_examples = ?', 'not_important_examples = ?');
      updateValues.push(
        JSON.stringify(updates.examples.important || []),
        JSON.stringify(updates.examples.notImportant || [])
      );
    }

    updateFields.push('updated_at = ?');
    updateValues.push(now, id);

    await db.run(
      `UPDATE user_expectations SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    return this.getExpectationsById(id);
  }

  /**
   * Activate specific expectations (deactivates others for the user)
   */
  async activateExpectations(id: string): Promise<UserExpectations> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    // Get the expectations to activate
    const expectations = await this.getExpectationsById(id);

    // Deactivate all other expectations for this user
    await db.run(
      'UPDATE user_expectations SET is_active = 0, updated_at = ? WHERE user_id = ? AND id != ?',
      [now, expectations.userId, id]
    );

    // Activate the specified expectations
    await db.run(
      'UPDATE user_expectations SET is_active = 1, updated_at = ? WHERE id = ?',
      [now, id]
    );

    return this.getExpectationsById(id);
  }

  /**
   * Deactivate expectations
   */
  async deactivateExpectations(id: string): Promise<UserExpectations> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.run(
      'UPDATE user_expectations SET is_active = 0, updated_at = ? WHERE id = ?',
      [now, id]
    );

    return this.getExpectationsById(id);
  }

  /**
   * Delete expectations
   */
  async deleteExpectations(id: string): Promise<void> {
    const db = await getDatabase();
    const result = await db.run(
      'DELETE FROM user_expectations WHERE id = ?',
      [id]
    );

    if (result.changes === 0) {
      throw new Error(`User expectations not found with id: ${id}`);
    }
  }

  /**
   * Check if user has any expectations defined
   */
  async hasExpectations(userId: string): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_expectations WHERE user_id = ?',
      [userId]
    );

    return (result?.count || 0) > 0;
  }

  /**
   * Validate expectation inputs
   */
  private validateExpectationInputs(
    title: string,
    description: string,
    examples?: { important: string[]; notImportant: string[] }
  ): void {
    // Validate title
    if (!title || title.trim().length === 0) {
      throw new Error('Title is required and cannot be empty');
    }

    if (title.length > 200) {
      throw new Error('Title cannot exceed 200 characters');
    }

    // Validate description
    if (!description || description.trim().length === 0) {
      throw new Error('Description is required and cannot be empty');
    }

    if (description.length > 2000) {
      throw new Error('Description cannot exceed 2000 characters');
    }

    // Validate examples if provided
    if (examples) {
      if (examples.important) {
        if (!Array.isArray(examples.important)) {
          throw new Error('Important examples must be an array');
        }

        if (examples.important.length > 10) {
          throw new Error('Cannot have more than 10 important examples');
        }

        for (const example of examples.important) {
          if (typeof example !== 'string' || example.length > 500) {
            throw new Error('Each important example must be a string with max 500 characters');
          }
        }
      }

      if (examples.notImportant) {
        if (!Array.isArray(examples.notImportant)) {
          throw new Error('Not important examples must be an array');
        }

        if (examples.notImportant.length > 10) {
          throw new Error('Cannot have more than 10 not important examples');
        }

        for (const example of examples.notImportant) {
          if (typeof example !== 'string' || example.length > 500) {
            throw new Error('Each not important example must be a string with max 500 characters');
          }
        }
      }
    }
  }

  /**
   * Transform database row to model
   */
  private transformRowToModel(row: UserExpectationsRow): UserExpectations {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      examples: {
        important: row.important_examples ? JSON.parse(row.important_examples) : [],
        notImportant: row.not_important_examples ? JSON.parse(row.not_important_examples) : []
      }
    };
  }
}