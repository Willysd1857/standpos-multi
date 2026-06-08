const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');

/**
 * Create an audit log entry
 * @param {string} userId - ID of the user performing the action (use 'system' if no user)
 * @param {string} username - Username of the user (use 'system' if no user)
 * @param {string} action - Action type (e.g., 'CREATE_TRANSACTION', 'UPDATE_PRODUCT')
 * @param {string} entityType - Type of entity (e.g., 'transaction', 'product', 'category')
 * @param {string} entityId - ID of the entity being acted upon
 * @param {object|string} details - Additional details about the action (will be JSON stringified if object)
 * @param {string} ipAddress - Optional IP address of the user
 * @returns {string|null} - Audit log ID if successful, null if failed
 */
function createAuditLog(userId, username, action, entityType, entityId, details, ipAddress = null, locationId = null) {
    try {
        const auditId = uuidv4();
        
        // Fire and forget insert to Supabase
        supabase.from('audit_logs').insert({
            id: auditId,
            user_id: userId || 'system',
            username: username || 'system',
            location_id: locationId || null,
            action,
            entity_type: entityType || null,
            entity_id: entityId || null,
            details: typeof details === 'string' ? details : JSON.stringify(details),
            ip_address: ipAddress || null
        }).then(({ error }) => {
            if (error) {
                console.error('❌ Failed to save audit log to Supabase:', error.message);
            }
        }).catch(err => {
            console.error('❌ Error during async audit logging:', err.message);
        });

        return auditId;
    } catch (error) {
        console.error('❌ Failed to create audit log:', error);
        return null;
    }
}

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'moonlight-secret-key-change-in-production';

function getUserFromRequest(req) {
    if (!req) {
        return { id: 'system', username: 'system', role: 'system', location_id: null };
    }

    if (req.user) {
        return {
            id: req.user.id || 'system',
            username: req.user.username || 'system',
            role: req.user.role || 'system',
            location_id: req.user.location_id || null
        };
    }

    try {
        const authHeader = req.headers && req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.id) {
                return {
                    id: decoded.id,
                    username: decoded.username || 'unknown',
                    role: decoded.role || 'user',
                    location_id: decoded.location_id || null
                };
            }
        }
    } catch (error) {
    }

    return { id: 'system', username: 'system', role: 'system', location_id: null };
}

module.exports = { createAuditLog, getUserFromRequest };
