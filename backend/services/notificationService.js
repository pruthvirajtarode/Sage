/**
 * Notification Service
 * Mock service to handle sending booking alerts to company representatives.
 * Once API keys are provided by the client, this will be integrated with WhatsApp/LINE.
 */

const sendPurchaseAlert = async (bookingData) => {
    console.log(`\n======================================================`);
    console.log(`🛎️ [MOCK NOTIFICATION] NEW SERVICE BOOKING ALERT`);
    console.log(`======================================================`);
    console.log(`Customer Name : ${bookingData.customerName || 'Guest User'}`);
    console.log(`Customer Email: ${bookingData.customerEmail || 'No email provided'}`);
    console.log(`Service ID    : ${bookingData.productId}`);
    console.log(`Pairs of Shoes: ${bookingData.quantity}`);
    console.log(`Total Paid    : ${bookingData.amountPaid} ${bookingData.currency}`);
    console.log(`Status        : BOOKING PAYMENT SUCCESSFUL`);
    console.log(`\nAction Required: Please follow up with the customer to arrange pickup/drop-off!`);
    console.log(`======================================================\n`);

    // In the future:
    // 1. Await twilioClient.messages.create(...) OR
    // 2. Await lineClient.pushMessage(...)
    
    return { success: true, message: 'Notification sent successfully (mocked).' };
};

module.exports = {
    sendPurchaseAlert
};
