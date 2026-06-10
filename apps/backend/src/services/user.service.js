import bcrypt from "bcryptjs";
import db from "../config/db.js";
import {
  getUsersModel,
  getUserByIdModel,
  createUserModel,
  updateUserModel,
  findUserByUsername,
} from "../models/user.model.js";

export const getUsersService = async () => getUsersModel();

const resolveRoleId = async (role, fallback = null) => {
  if (role === undefined || role === null || role === "") {
    return fallback;
  }

  if (Number.isFinite(Number(role))) {
    return Number(role);
  }

  const roleResult = await db.query(`SELECT id FROM roles WHERE name = ?`, [role]);

  if (!roleResult.rows.length) {
    throw new Error("Rol inválido");
  }

  return roleResult.rows[0].id;
};

export const createUserService = async (data) => {
  const name = String(data?.name ?? "").trim();
  const username = String(data?.username ?? data?.email ?? name).trim();
  const password = String(data?.password ?? "");
  const role = data?.role ?? data?.role_id;

  if (!name || !password || role === undefined || role === null || role === "") {
    throw new Error("Datos incompletos");
  }

  const existingUser = await findUserByUsername(username);

  if (existingUser) {
    throw new Error("El usuario ya existe");
  }

  const role_id = await resolveRoleId(role);
  const hashedPassword = await bcrypt.hash(password, 12);

  return createUserModel({
    username,
    name: name || null,
    password: hashedPassword,
    role_id,
    is_active: data?.is_active === undefined ? 1 : data.is_active ? 1 : 0,
  });
};

export const updateUserService = async (id, data) => {
  const numericId = Number(id);
  const existingUser = await getUserByIdModel(numericId);

  if (!existingUser) {
    throw new Error("Usuario no encontrado");
  }

  const username = data?.username !== undefined
    ? String(data.username).trim()
    : data?.email !== undefined
      ? String(data.email).trim()
      : existingUser.username;

  if (username !== existingUser.username) {
    const userWithSameUsername = await findUserByUsername(username);
    if (userWithSameUsername && Number(userWithSameUsername.id) !== numericId) {
      throw new Error("El usuario ya existe");
    }
  }

  const role_id = await resolveRoleId(data?.role ?? data?.role_id, existingUser.role_id);

  let password = null;

  if (data?.password) {
    password = await bcrypt.hash(String(data.password), 10);
  } else {
    const fullUser = await db.query(`SELECT password FROM users WHERE id = ?`, [numericId]);
    password = fullUser.rows[0]?.password;
  }

  return updateUserModel(numericId, {
    username,
    name: data?.name !== undefined ? String(data.name).trim() || null : existingUser.name,
    password,
    role_id,
    is_active: data?.is_active === undefined ? existingUser.is_active : data.is_active ? 1 : 0,
  });
};

export const deleteUserService = async (id) => {
  const existing = await getUserByIdModel(Number(id));
  if (!existing) throw new Error("Usuario no encontrado");
  await db.query(
    `UPDATE users SET deleted_at = datetime('now'), is_active = 0 WHERE id = ?`,
    [id]
  );
  return { success: true };
};
