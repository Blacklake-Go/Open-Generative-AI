import 'server-only';

import * as communityRepo from '../repositories/community.js';
import { submitCommunityWork, moderateCommunityWork } from '../community/submissions.js';

// Community application facade keeps route handlers free of repository imports.
export async function listCommunityPosts(options) { return communityRepo.listCommunityPosts(options); }
export async function listAdminCommunityPosts(options) { return communityRepo.listAdminCommunityPosts(options); }
export async function getPostCoinStatus(postId, userId = null) { return communityRepo.getPostCoinStatus(postId, userId); }
export async function getCommunityPostById(id, viewerId = null) { return communityRepo.getCommunityPostById(id, viewerId); }
export async function createCommunityPost(input) { return submitCommunityWork(input); }
export async function updateCommunityPostForAdmin(id, input, { actor, expectedVersion } = {}) { return moderateCommunityWork(id, input, actor, expectedVersion); }
export async function deleteCommunityPost(id, userId, isAdmin = false) { return communityRepo.deleteCommunityPost(id, userId, isAdmin); }
export async function toggleCommunityLike(postId, userId) { return communityRepo.toggleCommunityLike(postId, userId); }
export async function addCommunityComment(input) { return communityRepo.addCommunityComment(input); }
export async function listCommunityComments(postId, limit = 50) { return communityRepo.listCommunityComments(postId, limit); }
export async function recordRemixCount(postId) { return communityRepo.recordRemixCount(postId); }
