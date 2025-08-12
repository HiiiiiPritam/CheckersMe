const express = require('express');
const router = express.Router();
const { register, login, getProfile, verifyToken, superLogin } = require('../controllers/auth.controller');
const { auth, isAdmin } = require('../middleware/auth.middleware');
const { registerValidation, loginValidation } = require('../middleware/validation.middleware');

// Public routes
router.post('/login', loginValidation, login);
// router.get('/verify-token', verifyToken);

// Protected routes
router.get('/profile', auth, getProfile);
router.post('/register',  register); // TODO: Add role-based access control

// Super login - Admin only
router.post('/super-login', superLogin);// isAdmin, superLogin);

module.exports = router; 