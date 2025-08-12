// controllers/test.controller.js
const asyncHandler = require('../middleware/asyncHandler.middleware'); // Assuming you have this
const ResponseHandler = require('../utils/responseHandler.util');   // Assuming you have this
const NotificationService = require('../services/notification.service'); // Adjust path as needed

class TestController {
    /**
     * API to simulate transaction notifications.
     * This endpoint should only be used for testing and development.
     */
    simulateTransactionNotification = asyncHandler(async (req, res) => {
        const { franchiseName, timeDifferenceMinutes, transactionDetails } = req.body;

        if (!franchiseName || timeDifferenceMinutes === undefined || !transactionDetails) {
            return ResponseHandler.error(res, 'Missing required fields: franchiseName, timeDifferenceMinutes, and transactionDetails', 400);
        }

        // Basic validation for transactionDetails structure
        if (!transactionDetails.orderId || transactionDetails.amount === undefined || !transactionDetails.transactionType) {
            return ResponseHandler.error(res, 'transactionDetails must contain orderId, amount, and transactionType', 400);
        }
        if (!['deposit', 'withdraw'].includes(transactionDetails.transactionType)) {
            return ResponseHandler.error(res, 'transactionType must be either "deposit" or "withdraw"', 400);
        }

        const success = await NotificationService.sendTransactionNotification(
            franchiseName,
            timeDifferenceMinutes,
            transactionDetails
        );
        if (success) {
            return ResponseHandler.success(res, 'Transaction notification simulation successful.');
        } else {
            return ResponseHandler.error(res, 500, 'Transaction notification simulation failed.');
        }
    });
}

module.exports = new TestController();