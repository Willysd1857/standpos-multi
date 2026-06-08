const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const supabaseAdmin = require('../services/supabaseAdmin');
const { createAuditLog } = require('../middleware/auditLogger');

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'moonlight-secret-key-change-in-production';

// Middleware to verify admin role using local JWT
const requireAdmin = async (req, res, next) => {
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

// Get all active users (public - for login screen)
router.get('/public/list', async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('username, full_name')
            .eq('is_active', true)
            .neq('id', 'system')
            .order('username', { ascending: true });

        if (error) throw error;
        res.json(users || []);
    } catch (error) {
        console.error('❌ Get public users list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, full_name, role, is_active, email, created_at, updated_at')
            .neq('id', 'system')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(users || []);
    } catch (error) {
        console.error('❌ Get users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { username, pin_code, full_name, role = 'user', location_id } = req.body;
        const bcrypt = require('bcryptjs');
        const { v4: uuidv4 } = require('uuid');

        if (!username || !pin_code || !full_name) {
            return res.status(400).json({ error: 'Username, PIN, and full name are required' });
        }

        // Check if username already exists
        const { data: existing, error: checkErr } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();

        if (checkErr) throw checkErr;
        if (existing) {
            return res.status(400).json({ error: 'Nom d\'utilisateur déjà utilisé' });
        }

        const id = uuidv4();
        const pinHash = bcrypt.hashSync(pin_code, 10);

        const { data: newUser, error: insertErr } = await supabase
            .from('users')
            .insert({
                id,
                username,
                pin_code_hash: pinHash,
                full_name,
                role,
                location_id: location_id || null,
                is_active: true
            })
            .select('id, username, full_name, role, location_id, is_active, created_at')
            .single();

        if (insertErr) throw insertErr;

        // Log the action
        createAuditLog(
            req.user.id,
            req.user.username,
            'CREATE_USER',
            'user',
            id,
            { username, full_name, role, location_id },
            null,
            req.user.location_id
        );

        res.status(201).json(newUser);
    } catch (error) {
        console.error('❌ Create user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, role, is_active, location_id, pin_code } = req.body;
        const bcrypt = require('bcryptjs');

        const { data: user, error: getErr } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (getErr) throw getErr;
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (id === 'system') return res.status(403).json({ error: 'Cannot modify system service account' });
        if (id === req.user.id && is_active === false) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        const updates = {};
        if (full_name !== undefined) updates.full_name = full_name;
        if (role !== undefined) updates.role = role;
        if (is_active !== undefined) updates.is_active = !!is_active;
        if (location_id !== undefined) updates.location_id = location_id || null;
        if (pin_code) {
            updates.pin_code_hash = bcrypt.hashSync(pin_code, 10);
        }
        updates.updated_at = new Date().toISOString();

        const { data: updatedUser, error: updateErr } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select('id, username, full_name, role, location_id, is_active, created_at, updated_at')
            .single();

        if (updateErr) throw updateErr;

        createAuditLog(req.user.id, req.user.username, 'UPDATE_USER', 'user', id, { full_name, role, is_active, location_id }, null, req.user.location_id);

        res.json(updatedUser);
    } catch (error) {
        console.error('❌ Update user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (id === 'system') return res.status(403).json({ error: 'Cannot delete system service account' });
        if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });

        // Delete from public.users
        const { error: deleteErr } = await supabase.from('users').delete().eq('id', id);
        if (deleteErr) throw deleteErr;

        createAuditLog(req.user.id, req.user.username, 'DELETE_USER', 'user', id, { id });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('❌ Delete user error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
