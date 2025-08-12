// routes/group.routes.js
const express = require('express');
const router = express.Router();
const groupController = require('../controllers/group.controller');
const { auth } = require('../middleware/auth.middleware.js');
const { validateRequest } = require('../middleware/validation.middleware.js');
const multer = require('multer');

const storage = multer.memoryStorage(); 
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // Limit file size to 100MB may update as needed
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});


// Apply authentication middleware to all routes
router.use(auth);

/**
 * @route POST /api/groups
 * @desc Create a new group
 * Body: { name: string, description?: string, groupPicture?: string, initialMembers?: string[], franchiseId?: string }
 */
router.post('/',
  upload.single('groupPicture'),
  validateRequest({
    body: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
      description: { type: 'string', required: false, maxLength: 500 },
      initialMembers: { type: 'array', items: { type: 'ObjectId' }, required: false, default: [] },
      franchiseIds: { type: 'array', items: { type: 'ObjectId' }, required: false, default: [] }//TODO: This miight be removed
    }
  }),
  groupController.createGroup
);

/**
 * @route GET /api/groups/:groupId
 * @desc Get group details
 * @access Private (members only)
 */
router.get('/:groupId',
  validateRequest({
    params: {
      groupId: { type: 'ObjectId', required: true }
    }
  }),
  groupController.getGroupDetails
);

/**
 * @route PUT /api/groups/:groupId
 * @desc Update group details
 * @access Private (admins only)
 * Body: { name?: string, description?: string, groupPicture?: string, franchiseId?: string }
 */
router.put('/:groupId',
  upload.single('groupPicture'),
  validateRequest({
    params: {
      groupId: { type: 'ObjectId', required: true }
    },
    body: {
      name: { type: 'string', required: false, minLength: 1, maxLength: 100 },
      description: { type: 'string', required: false, maxLength: 500 },
      franchiseIds: { type: 'array', items: { type: 'ObjectId' }, required: false }
    }
  }),
  groupController.updateGroup
);

/**
 * @route POST /api/groups/:groupId/members
 * @desc Add members to a group
 * @access Private (admins only)
 * Body: { newMemberIds: string[] }
 */
router.post('/:groupId/members',
  validateRequest({
    params: {
      groupId: { type: 'ObjectId', required: true }
    },
    body: {
      newMemberIds: { type: 'array', items: { type: 'ObjectId' }, required: true, minItems: 1 }
    }
  }),
  groupController.addGroupMembers
);

/**
 * @route DELETE /api/groups/:groupId/members
 * @desc Remove members from a group
 * @access Private (admins only)
 * Body: { memberIdsToRemove: string[] }
 */
router.delete('/:groupId/members',
  validateRequest({
    params: {
      groupId: { type: 'ObjectId', required: true }
    },
    body: {
      memberIdsToRemove: { type: 'array', items: { type: 'ObjectId' }, required: true, minItems: 1 }
    }
  }),
  groupController.removeGroupMembers
);

/**
 * @route PUT /api/groups/:groupId/members/:memberId/role
 * @desc Update a member's role in a group
 * @access Private (admins only)
 * Body: { role: 'member' | 'admin' }
 */
router.put('/:groupId/members/:memberId/role',
  validateRequest({
    params: {
      groupId: { type: 'ObjectId', required: true },
      memberId: { type: 'ObjectId', required: true }
    },
    body: {
      role: { type: 'string', enum: ['member', 'admin'], required: true }
    }
  }),
  groupController.updateGroupMemberRole
);

/**
 * @route POST /api/groups/:groupId/leave
 * @desc User leaves a group
 * @access Private
 */
router.post('/:groupId/leave',
  validateRequest({
    params: {
      groupId: { type: 'ObjectId', required: true }
    }
  }),
  groupController.leaveGroup
);

/**
 * @route GET /api/groups/:groupId/users
 * @desc Get all users with selection status for group member management
 * @access Private (members only)
 */
router.get('/:groupId/users',
  validateRequest({
    params: {
      groupId: { type: 'ObjectId', required: true }
    }
  }),
  groupController.getUsersForGroupManagement
);

/**
 * @route DELETE /api/groups/:groupId
 * @desc Delete a group (soft delete)
 * @access Private (creator or super admin only)
 */
router.delete('/:groupId',
  validateRequest({
    params: {
      groupId: { type: 'ObjectId', required: true }
    }
  }),
  groupController.deleteGroup
);


module.exports = router;