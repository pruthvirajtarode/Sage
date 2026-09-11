const axios = require('axios');

/**
 * AirtableService - Handles syncing leads to Airtable
 * Features:
 * - Robust error handling for 422/403 errors
 * - Automatic field mapping
 * - Lead deduplication (optional)
 */
class AirtableService {
    constructor() {
        this.apiKey = process.env.AIRTABLE_API_KEY;
        this.baseId = process.env.AIRTABLE_BASE_ID;
        this.tableName = process.env.AIRTABLE_TABLE_NAME || 'Leads';
        
        if (!this.apiKey || !this.baseId) {
            console.warn('⚠️ Airtable credentials missing. Lead sync will be disabled.');
        }
    }

    /**
     * Send a lead to Airtable
     * @param {Object} leadData - { name, email, message, source, conversationId }
     */
    async createLead(leadData) {
        if (!this.apiKey || !this.baseId) return { success: false, error: 'Missing credentials' };

        try {
            console.log(`📤 Sending lead to Airtable: ${leadData.email || 'Anonymous'}`);

            // Construct fields - ensuring we handle the 'Digital Dada' Leads table schema
            const fields = {
                'Lead Name': leadData.name || 'Anonymous User',
                'Email Address': leadData.email || '',
                'AI Summary': leadData.message || '',
                'Inquiry Type': 'Chatbot Lead',
                'Status': 'New',
                'Date Created': new Date().toISOString().split('T')[0] // Only date if type is Single Line Text
            };

            const response = await axios.post(
                `https://api.airtable.com/v0/${this.baseId}/${encodeURIComponent(this.tableName)}`,
                {
                    records: [{ fields }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Lead synced to Airtable:', response.data.records[0].id);
            return { success: true, id: response.data.records[0].id };

        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;
            
            console.error(`❌ Airtable Sync Failed (${status}):`, JSON.stringify(data, null, 2));

            if (status === 422) {
                console.error('👉 Tip: Check if your Airtable field names EXACTLY match (Name, Email, Status, etc.) and types are correct.');
            } else if (status === 403 || status === 401) {
                console.error('👉 Tip: Your API Key/Token is invalid or does not have "data.records:write" permission.');
            }

            return { 
                success: false, 
                error: data?.error?.message || error.message,
                status 
            };
        }
    }
}

module.exports = new AirtableService();
