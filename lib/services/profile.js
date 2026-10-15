import 'server-only';

import * as usersRepo from '../repositories/users.js';

export async function getProfile(userId) {
  return await usersRepo.getUserProfile(userId);
}

export async function updateProfile(userId, fields) {
  return await usersRepo.updateUserProfile(userId, fields);
}
