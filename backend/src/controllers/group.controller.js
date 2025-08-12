const GroupService = require('../services/group.service');
const asyncHandler = require('../middleware/asyncHandler.middleware.js');
const ResponseHandler = require('../utils/responseHandler.util.js');

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];


class GroupController {
  /**
   * Create a new group
   */
  createGroup = asyncHandler(async (req, res) => {
    const { name, description, initialMembers, franchiseIds } = req.body;
    // TODO:franchiseId might be removed
    const creatorId = req.user._id;

    if (!name || name.trim().length === 0) {
      return ResponseHandler.error(res, 'Group name is required', 400);
    }

    if (franchiseIds !== undefined && !Array.isArray(franchiseIds)) {
      return ResponseHandler.error(res, 'Franchise IDs must be an array.', 400);
    }

    let groupPictureBase64 = null;
    if (req.file) {
      // Server-side file validation (redundant with multer.fileFilter but good practice)
      if (!ALLOWED_IMAGE_MIMETYPES.includes(req.file.mimetype)) {
        return ResponseHandler.error(res, 'Invalid image type. Only JPEG, PNG, GIF, WEBP are allowed.', 400);
      }
      if (req.file.size > MAX_FILE_SIZE_BYTES) {
        return ResponseHandler.error(res, `Image size exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`, 400);
      }

      // Convert buffer to Base64 and prepend data URL prefix
      groupPictureBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const group = await GroupService.createGroup(creatorId, name, description, groupPictureBase64, initialMembers, franchiseIds);//TODO: Franchise might be removed later
    return ResponseHandler.success(res, 'Group created successfully', group, 201);
  });

  /**
   * Get group details
   */
  getGroupDetails = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await GroupService.getGroupDetails(groupId, userId);
    return ResponseHandler.success(res, 'Group details retrieved successfully', group);
  });

  /**
   * Update group details
   */
  updateGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const updaterId = req.user._id;
    console.log('Updating group:', groupId, 'by user:', updaterId);
    const updates = req.body; 

    if (updates.franchiseIds !== undefined && !Array.isArray(updates.franchiseIds)) {
      return ResponseHandler.error(res, 'Franchise IDs must be an array.', 400);
    }

    // Handle groupPicture update if a file was uploaded
    if (req.file) {
      // Server-side file validation
      if (!ALLOWED_IMAGE_MIMETYPES.includes(req.file.mimetype)) {
        return ResponseHandler.error(res, 'Invalid image type. Only JPEG, PNG, GIF, WEBP are allowed.', 400);
      }
      if (req.file.size > MAX_FILE_SIZE_BYTES) {
        return ResponseHandler.error(res, `Image size exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`, 400);
      }
      updates.groupPicture = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (updates.groupPicture === 'null' || updates.groupPicture === '') {
        // Allow explicit null/empty string to remove the picture if needed
        updates.groupPicture = null;
    }

    const updatedGroup = await GroupService.updateGroup(groupId, updaterId, updates);
    return ResponseHandler.success(res, 'Group updated successfully', updatedGroup);
  });

  /**
   * Add members to a group
   */
  addGroupMembers = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const adderId = req.user._id;
    const { newMemberIds } = req.body;

    if (!Array.isArray(newMemberIds) || newMemberIds.length === 0) {
      return ResponseHandler.error(res, 'New member IDs array is required and cannot be empty.', 400);
    }

    const addedMembers = await GroupService.addGroupMembers(groupId, adderId, newMemberIds);
    return ResponseHandler.success(res, 'Members added successfully', addedMembers, 201);
  });

  /**
   * Remove members from a group
   */
  removeGroupMembers = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const removerId = req.user._id;
    const { memberIdsToRemove } = req.body;

    if (!Array.isArray(memberIdsToRemove) || memberIdsToRemove.length === 0) {
      return ResponseHandler.error(res, 'Member IDs to remove array is required and cannot be empty.', 400);
    }

    const result = await GroupService.removeGroupMembers(groupId, removerId, memberIdsToRemove);
    return ResponseHandler.success(res, 'Members removed successfully', result);
  });

  /**
   * Update a member's role in a group
   */
  updateGroupMemberRole = asyncHandler(async (req, res) => {
    const { groupId, memberId } = req.params;
    const updaterId = req.user._id;
    const { role } = req.body;

    if (!role || !['member', 'admin'].includes(role)) {
      return ResponseHandler.error(res, 'Invalid role. Must be "member" or "admin".', 400);
    }

    const updatedMember = await GroupService.updateGroupMemberRole(groupId, updaterId, memberId, role);
    return ResponseHandler.success(res, 'Member role updated successfully', updatedMember);
  });

  /**
   * User leaves a group
   */
  leaveGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user._id;

    const result = await GroupService.leaveGroup(groupId, userId);
    return ResponseHandler.success(res, result.message, null);
  });

  /**
   * Get all users with selection status for group member management
   */
  getUsersForGroupManagement = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user._id;

    const usersWithSelection = await GroupService.getUsersForGroupManagement(groupId, userId);
    return ResponseHandler.success(res, 'Users retrieved successfully', usersWithSelection);
  });

  /**
   * Delete a group
   */
  deleteGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const deleterId = req.user._id;

    const result = await GroupService.deleteGroup(groupId, deleterId);
    return ResponseHandler.success(res, result.message, null);
  });
}

module.exports = new GroupController();