import { RowDataPacket } from 'mysql2';
import { query, queryOne } from '../utils/db';

export interface LearningPreferenceData {
  direction: string;
  stage: string;
  goal: string;
  keywords: string[];
}

interface LearningPreferenceRow extends RowDataPacket {
  learning_direction: string;
  learning_stage: string;
  learning_goal: string;
  recommendation_keywords: string;
}

const EMPTY_PREFERENCES: LearningPreferenceData = {
  direction: '',
  stage: '',
  goal: '',
  keywords: []
};

export class LearningPreferenceModel {
  private static tableReady = false;

  private static async ensureTable(): Promise<void> {
    if (LearningPreferenceModel.tableReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS user_learning_preferences (
        user_id INT PRIMARY KEY,
        learning_direction VARCHAR(80) NOT NULL DEFAULT '',
        learning_stage VARCHAR(30) NOT NULL DEFAULT '',
        learning_goal VARCHAR(120) NOT NULL DEFAULT '',
        recommendation_keywords TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_learning_preferences_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    LearningPreferenceModel.tableReady = true;
  }

  static async findByUserId(userId: number): Promise<LearningPreferenceData> {
    await LearningPreferenceModel.ensureTable();

    const row = await queryOne<LearningPreferenceRow>(
      `SELECT learning_direction, learning_stage, learning_goal, recommendation_keywords
       FROM user_learning_preferences
       WHERE user_id = ?`,
      [userId]
    );

    if (!row) return { ...EMPTY_PREFERENCES };

    let keywords: string[] = [];
    try {
      const parsed = JSON.parse(row.recommendation_keywords || '[]');
      if (Array.isArray(parsed)) {
        keywords = parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      keywords = [];
    }

    return {
      direction: row.learning_direction || '',
      stage: row.learning_stage || '',
      goal: row.learning_goal || '',
      keywords
    };
  }

  static async upsert(userId: number, data: LearningPreferenceData): Promise<void> {
    await LearningPreferenceModel.ensureTable();

    await query(
      `INSERT INTO user_learning_preferences
        (user_id, learning_direction, learning_stage, learning_goal, recommendation_keywords)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        learning_direction = VALUES(learning_direction),
        learning_stage = VALUES(learning_stage),
        learning_goal = VALUES(learning_goal),
        recommendation_keywords = VALUES(recommendation_keywords)`,
      [userId, data.direction, data.stage, data.goal, JSON.stringify(data.keywords)]
    );
  }
}
