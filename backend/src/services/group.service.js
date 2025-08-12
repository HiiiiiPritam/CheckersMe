const mongoose = require('mongoose');
const Group = require('../models/group.model');
const GroupMember = require('../models/groupMember.model');
const Conversation = require('../models/conversation.model');
const User = require('../models/user.model'); 
const webSocketManager = require('../utils/websocket.util');
const Constants = require('../constants/index.js');

class GroupService {
  /**
   * Create a new group
   * @param {string} creatorId - ID of the user creating the group
   * @param {string} name - Group name
   * @param {string} [description] - Group description
   * @param {string} [groupPicture] - URL for group picture (or base64 if handled here)
   * @param {Array<string>} [initialMembers=[]] - Array of user IDs to add as initial members
   * @param {string} [franchiseId] - Optional franchise ID to link the group
   * @returns {Object} - Created group
   */
  async createGroup(creatorId, name, description, groupPicture, initialMembers = [], franchiseIds = []) {  
    try {
      // 1. Create Conversation
      const conversation = new Conversation({
        conversationType: Constants.CONVERSATION_TYPES.GROUP,
      });
      await conversation.save();

      // 2. Create Group
      const group = new Group({
        name,
        description,
        groupPicture,
        creator: creatorId,
        conversationId: conversation._id,
        franchiseIds: franchiseIds, // TODO: Maybe have to remove it,
        admin: creatorId
      });
      await group.save();

      conversation.groupId = group._id;
      await conversation.save();

      // 3. Add Creator as Admin
      await Group.addMember(group._id, creatorId, Constants.USER_ROLES.ADMIN);

      // 4. Add initial members
      for (const memberId of initialMembers) {
        if (memberId.toString() !== creatorId.toString()) {
          await Group.addMember(group._id, memberId, Constants.USER_ROLES.MEMBER);
        }
      }

      await group.populate('conversationId', 'name');
      return group;
    } catch (error) {
      console.error('Error creating group:', error);
      throw new Error(`Failed to create group: ${error.message}`);
    } 
  }

  /**
   * Get group details
   * @param {string} groupId - ID of the group
   * @param {string} userId - User requesting details (for authorization)
   * @returns {Object} - Group details with members
   */
  async getGroupDetails(groupId, userId) {
    try {
      const group = await Group.findById(groupId)
        .populate('conversationId')
        .populate('admin', 'name email');

      if (!group) {
        throw new Error('Group not found');
      }

      // Check if user is a member of the group
      const isMember = await GroupMember.exists({ groupId: group._id, userId: userId });
      if (!isMember) {
        throw new Error('Access denied. You are not a member of this group.');
      }

      const members = await GroupMember.find({ groupId: group._id })
        .populate('userId', 'name email')
        .lean();

      // Get all users and mark existing members as selected
      const allUsers = await User.find({ deleted: { $ne: true } }, 'name email role').lean();
      const memberUserIds = members.map(member => member.userId._id.toString());
      
      const usersWithSelection = allUsers.map(user => ({
        ...user,
        isSelected: memberUserIds.includes(user._id.toString())
      }));

      return { 
        ...group.toObject(), 
        members,
        allUsersWithSelection: usersWithSelection
      };
    } catch (error) {
      throw new Error(`Failed to get group details: ${error.message}`);
    }
  }

  /**
   * Update group details
   * @param {string} groupId - ID of the group
   * @param {string} updaterId - ID of the user updating (must be admin)
   * @param {Object} updates - Fields to update (name, description, groupPicture)
   * @returns {Object} - Updated group
   */
  async updateGroup(groupId, updaterId, updates) {
    try {
      const groupMember = await GroupMember.findOne({ groupId, userId: updaterId });
      const user = await User.findById(updaterId);

      if ((!groupMember || groupMember.role !== Constants.USER_ROLES.ADMIN) && (!user || user.role !== Constants.USER_ROLES.CHECKER)) {
        throw new Error('Access denied. Only group admins ans checkers can update group details.');
      }

      const group = await Group.findById(groupId);
      if (!group || group.deleted) {
        throw new Error('Group not found');
      }

      // Apply updates
      if (updates.name) group.name = updates.name;
      if (updates.description !== undefined) group.description = updates.description; 
      if (updates.groupPicture !== undefined) group.groupPicture = updates.groupPicture; 
      // Handle franchiseIds update
      if (updates.franchiseIds !== undefined) {
        if (!Array.isArray(updates.franchiseIds)) {
          throw new Error('franchiseIds must be an array.');
        }
        // Optional: Validate new franchiseIds
        if (updates.franchiseIds.length > 0) {
          const franchiseUsers = await User.find({ _id: { $in: updates.franchiseIds }, role: Constants.USER_ROLES.AGENT });
          if (franchiseUsers.length !== updates.franchiseIds.length) {
            throw new Error('One or more provided franchise IDs do not correspond to valid franchise users.');
          }
        }
        group.franchiseIds = updates.franchiseIds;
      }

      await group.save();
      return group;
    } catch (error) {
      throw new Error(`Failed to update group: ${error.message}`);
    }
  }

  /**
   * Add members to a group
   * @param {string} groupId - ID of the group
   * @param {string} adderId - ID of the user adding members (must be admin)
   * @param {Array<string>} newMemberIds - Array of user IDs to add
   * @returns {Array<Object>} - Newly added group members
   */
  async addGroupMembers(groupId, adderId, newMemberIds) {
    try {
      const groupMember = await GroupMember.findOne({ groupId, userId: adderId });
      const user = await User.findById(adderId);
      if ((!groupMember || groupMember.role !== 'admin') && ( !user || user.role !== 'checker') ){
        throw new Error('Access denied. Only group admins and checkers can add members.');
      }

      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found.');
      }

      const newFranchiseIds = [];
      for (const userId of newMemberIds) {
        const user = await User.findById(userId);
        if (!user) {
          console.warn(`User with ID ${userId} not found. Skipping.`);
          continue;
        }

        try {
          await Group.addMember(groupId, userId, 'member');

          // If the added user is a franchise, add them to group.franchiseIds if not already present
          if (user.role === Constants.USER_ROLES.AGENT && !group.franchiseIds.includes(user._id.toString())) {
             newFranchiseIds.push(user._id);
          }
        } catch (error) {
          console.warn(`Could not add user ${userId} to group ${groupId}: ${error.message}`);
        }
      }

      if (newFranchiseIds.length > 0) {
        group.franchiseIds = [...new Set([...group.franchiseIds, ...newFranchiseIds])]; // Add unique new IDs
        await group.save();
      }
       const updatedGroup = await Group.findById(groupId)
                                      .populate({
                                        path: 'franchiseIds',
                                        select: 'name email',
                                      });
      return updatedGroup;
    } catch (error) {
      throw new Error(`Failed to add group members: ${error.message}`);
    }
  }

  /**
   * Remove members from a group
   * @param {string} groupId - ID of the group
   * @param {string} removerId - ID of the user removing members (must be admin)
   * @param {Array<string>} memberIdsToRemove - Array of user IDs to remove
   * @returns {Object} - Result of removal operation
   */
  async removeGroupMembers(groupId, removerId, memberIdsToRemove) {
    try {
      const groupMember = await GroupMember.findOne({ groupId, userId: removerId });
      const user = await User.findById(removerId);
      
      if ((!groupMember || groupMember.role !== 'admin')  && (!user || user.role !== 'checker')) {
        throw new Error('Access denied. Only group admins and checkers can remove members.');
      }

      const group = await Group.findById(groupId);
      if (!group || group.deleted) {
        throw new Error('Group not found.');
      }

      const removalResults = { removedCount: 0, failedCount: 0 };
      let removedFranchise = false;
      for (const userId of memberIdsToRemove) {
        // Prevent admin from removing themselves if they are the last admin
        // Or prevent creator from being removed if no other admin exists
        const targetMember = await GroupMember.findOne({ groupId, userId });        
        if (targetMember) {
          if (targetMember.role === 'admin' && await GroupMember.countDocuments({ groupId, role: 'admin' }) === 1 && targetMember.userId.toString() === removerId.toString()) {
            // If the remover is the last admin, they cannot remove themselves via this endpoint
            removalResults.failedCount++;
            continue;
          }
          if (group.franchiseIds.includes(userId.toString())) {
            group.franchiseIds = group.franchiseIds.filter(id => id.toString() !== userId.toString());
            removedFranchise = true;
          }
          const result = await Group.removeMember(groupId, userId);
          if (result.deletedCount > 0) {
            removalResults.removedCount++;
            webSocketManager.broadcastToConversation(group.conversationId, {
              type: 'group_member_removed',
              data: { groupId: group._id, userId: userId }
            }, removerId);
          } else {
            removalResults.failedCount++;
          }
        } else {
          removalResults.failedCount++;
        }
      }

      if (removedFranchise) {
        await group.save();
      }
      return removalResults;
    } catch (error) {
      throw new Error(`Failed to remove group members: ${error.message}`);
    }
  }

  /**
   * Update a member's role in a group
   * @param {string} groupId - ID of the group
   * @param {string} updaterId - ID of the user updating the role (must be admin)
   * @param {string} targetUserId - ID of the member whose role is being updated
   * @param {string} newRole - The new role ('member' or 'admin')
   * @returns {Object} - Updated group member
   */
  async updateGroupMemberRole(groupId, updaterId, targetUserId, newRole) {
    try {
      if (!['member', 'admin'].includes(newRole)) {
        throw new Error('Invalid role specified. Role must be "member" or "admin".');
      }

      const updaterMember = await GroupMember.findOne({ groupId, userId: updaterId });
      const user = await User.findById(updaterId);
      if ((!updaterMember || updaterMember.role !== 'admin') && (!user || user.role !== 'checker')) {
        throw new Error('Access denied. Only group admins ans checkers can update group details.');
      }

      // Prevent an admin from demoting themselves if they are the last admin
      if (updaterId.toString() === targetUserId.toString() && newRole === 'member') {
        const adminCount = await GroupMember.countDocuments({ groupId, role: 'admin' });
        if (adminCount === 1) {
          throw new Error('Cannot demote yourself. Group must have at least one admin.');
        }
      }

      const updatedMember = await Group.updateMemberRole(groupId, targetUserId, newRole);
      if (!updatedMember) {
        throw new Error('Target user is not a member of this group.');
      }

      webSocketManager.broadcastToConversation(updatedMember.groupId.conversationId, { 
        type: 'group_member_role_updated',
        data: { groupId: groupId, userId: targetUserId, newRole: newRole }
      }, updaterId);

      return updatedMember;
    } catch (error) {
      throw new Error(`Failed to update member role: ${error.message}`);
    }
  }

  /**
   * User leaves a group
   * @param {string} groupId - ID of the group
   * @param {string} userId - ID of the user leaving
   * @returns {Object} - Result of leave operation
   */
  async leaveGroup(groupId, userId) {
    try {
      const groupMember = await GroupMember.findOne({ groupId, userId });
      if (!groupMember) {
        throw new Error('You are not a member of this group.');
      }

      // If the user is the last admin and there are other members, they cannot leave without assigning new admin
      if (groupMember.role === 'admin') {
        const adminCount = await GroupMember.countDocuments({ groupId, role: 'admin' });
        const memberCount = await GroupMember.countDocuments({ groupId });
        if (adminCount === 1 && memberCount > 1) {
          throw new Error('You are the last admin. Please assign another admin before leaving.');
        }
      }

      const group = await Group.findById(groupId);
      if (group.franchiseIds.includes(userId.toString())) {
        group.franchiseIds = group.franchiseIds.filter(id => id.toString() !== userId.toString());
        await group.save();
      }


      const result = await Group.removeMember(groupId, userId);
      if (result.deletedCount === 0) {
        throw new Error('Failed to remove you from the group.');
      }

      const remainingMembersCount = await GroupMember.countDocuments({ groupId });
      if (remainingMembersCount === 0) {
        if (group) {
          await group.delete(userId); 
          if (group.conversationId) {
            await Conversation.delete({ _id: group.conversationId }, userId); 
          }
        }
      }

      webSocketManager.broadcastToConversation(group.conversationId, {
        type: 'group_member_left',
        data: { groupId: groupId, userId: userId }
      }, userId);

      return { success: true, message: 'Successfully left the group.' };
    } catch (error) {
      throw new Error(`Failed to leave group: ${error.message}`);
    }
  }

  /**
   * Get all users with selection status for group member management
   * @param {string} groupId - ID of the group
   * @param {string} userId - User requesting the data (for authorization)
   * @returns {Array<Object>} - All users with isSelected flag
   */
  async getUsersForGroupManagement(groupId, userId) {
    try {
      // Check if user is a member of the group
      const isMember = await GroupMember.exists({ groupId: groupId, userId: userId });
      if (!isMember) {
        throw new Error('Access denied. You are not a member of this group.');
      }

      // Get all users
      const allUsers = await User.find({ deleted: { $ne: true } }, 'name email role').lean();
      
      // Get current group members
      const members = await GroupMember.find({ groupId: groupId }).lean();
      const memberUserIds = members.map(member => member.userId.toString());
      
      // Mark existing members as selected
      const usersWithSelection = allUsers.map(user => ({
        ...user,
        isSelected: memberUserIds.includes(user._id.toString())
      }));

      return usersWithSelection;
    } catch (error) {
      throw new Error(`Failed to get users for group management: ${error.message}`);
    }
  }

  /**
   * Delete a group (soft delete) - Only for group creator or super admin
   * @param {string} groupId - ID of the group
   * @param {string} deleterId - ID of the user deleting the group
   * @returns {Object} - Deleted group
   */
  async deleteGroup(groupId, deleterId) {
    try {
      const group = await Group.findById(groupId);
      if (!group || group.deleted) {
        throw new Error('Group not found.');
      }

      // Only creator or a admin (if we have one) can delete the group
      if (group.creator.toString() !== deleterId.toString() || (group.admin && group.admin.toString() !== deleterId.toString())) {
        throw new Error('Access denied. Only the group creator or an admin can delete the group.');
      }

      await GroupMember.deleteMany({ groupId: groupId });

      await group.delete(deleterId);

      if (group.conversationId) {
        const conversation = await Conversation.findById(group.conversationId);
        if (conversation) {
          await conversation.delete(deleterId);
        }
      }
      
      return { success: true, message: 'Group and associated data soft deleted successfully.' };
    } catch (error) {
      throw new Error(`Failed to delete group: ${error.message}`);
    }
  }

}

module.exports = new GroupService();