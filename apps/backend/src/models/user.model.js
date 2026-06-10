import db from "../config/db.js";

const selectUser = `
  SELECT
    u.id,
    u.username,
    u.username AS email,
    u.name,
    u.role_id,
    r.name AS role_name,
    u.is_active,
    u.created_at
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
`;

export const getUsersModel = async () => {
  const result = await db.query(`${selectUser} WHERE u.deleted_at IS NULL ORDER BY u.id ASC`);
  return result.rows;
};

export const getUserByIdModel = async (id) => {
  const result = await db.query(`${selectUser} WHERE u.id = ? AND u.deleted_at IS NULL`, [id]);
  return result.rows[0];
};

export const findUserByUsername = async (username) => {
  const result = await db.query(
    `SELECT u.*, u.username AS email, r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE LOWER(u.username) = LOWER(?) AND u.deleted_at IS NULL`,
    [username]
  );
  return result.rows[0];
};

export const createUserModel = async (data) => {
  const result = await db.query(
    `INSERT INTO users (username, name, password, role_id, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [data.username, data.name ?? null, data.password, data.role_id, data.is_active ?? 1]
  );
  return getUserByIdModel(result.lastID);
};

export const updateUserModel = async (id, data) => {
  await db.query(
    `UPDATE users
     SET username  = ?,
         name      = ?,
         password  = ?,
         role_id   = ?,
         is_active = ?
     WHERE id = ?`,
    [data.username, data.name ?? null, data.password, data.role_id, data.is_active, id]
  );
  return getUserByIdModel(id);
};
