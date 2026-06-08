const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'moonlight-secret-key-change-in-production';

// Middleware to verify admin role
const requireAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Get audit logs (admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const { action, start_date, end_date, limit = 100 } = req.query;

        let query = supabase.from('audit_logs').select('*');

        if (action) {
            query = query.eq('action', action);
        }

        if (start_date && end_date) {
            query = query.gte('created_at', `${start_date}T00:00:00.000Z`).lte('created_at', `${end_date}T23:59:59.999Z`);
        }

        const { data: logs, error } = await query
            .order('created_at', { ascending: false })
            .limit(parseInt(limit, 10) || 100);

        if (error) throw error;

        // Parse details JSON for each log
        const parsedLogs = (logs || []).map(log => {
            let parsedDetails = null;
            if (log.details) {
                try {
                    parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                } catch (e) {
                    parsedDetails = log.details;
                }
            }
            return {
                ...log,
                details: parsedDetails
            };
        });

        res.json(parsedLogs);
    } catch (error) {
        console.error('❌ Get audit logs error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create audit log entry
router.post('/', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        const { action, entity_type, entity_id, details } = req.body;

        if (!action) {
            return res.status(400).json({ error: 'Action is required' });
        }

        const id = uuidv4();

        const { data: log, error } = await supabase
            .from('audit_logs')
            .insert({
                id,
                user_id: decoded.id,
                username: decoded.username,
                action,
                entity_type: entity_type || null,
                entity_id: entity_id || null,
                details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
                ip_address: req.ip || null
            })
            .select()
            .single();

        if (error) throw error;

        let parsedDetails = null;
        if (log.details) {
            try {
                parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
            } catch (e) {
                parsedDetails = log.details;
            }
        }

        res.status(201).json({
            ...log,
            details: parsedDetails
        });
    } catch (error) {
        console.error('❌ Create audit log error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export audit logs to Excel (admin only)
router.get('/export', requireAdmin, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        let query = supabase.from('audit_logs').select('*');

        if (start_date && end_date) {
            query = query.gte('created_at', `${start_date}T00:00:00.000Z`).lte('created_at', `${end_date}T23:59:59.999Z`);
        }

        const { data: logs, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // Parse details for export
        const exportData = (logs || []).map(log => ({
            Date: log.created_at,
            User: log.username,
            Action: log.action,
            Entity: log.entity_type || '',
            Details: log.details || ''
        }));

        res.json(exportData);
    } catch (error) {
        console.error('❌ Export audit logs error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
