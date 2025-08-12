// routes/test.routes.js
const express = require('express');
const router = express.Router();
const testController = require('../controllers/test.controller'); // Adjust path
const { auth } = require('../middleware/auth.middleware'); // Assuming your auth middleware
const { USER_ROLES } = require('../constants'); // Assuming your constants for roles


// Define the test API endpoint
router.post(
    '/simulate-notification',
    auth,     // Authenticate the request
    testController.simulateTransactionNotification
);

module.exports = router;