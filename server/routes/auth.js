const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuditLog } = require('../middleware/auditLogger');

const JWT_SECRET = process.env.JWT_SECRET || 'moonlight-secret-key-change-in-production';
const TOKEN_EXPIRY = '12h'; // Déconnexion automatique (inactivité gérée en front)

// Login via Username + PIN
router.post('/login', async (req, res) => {
    try {
        const { username, pin_code } = req.body;

        if (!username || !pin_code) {
            return res.status(400).json({ error: 'Nom d\'utilisateur et code PIN requis' });
        }

        // Fetch user from database
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Ce compte est désactivé' });
        }

        // Compare PIN
        // Note: For backwards compatibility, if they login with a password, we might check password_hash.
        // But here we enforce PIN for the new POS system.
        let isValid = false;
        
        if (user.pin_code_hash) {
            isValid = await bcrypt.compare(pin_code, user.pin_code_hash);
        } else if (user.password_hash) {
            // Fallback for admin if pin_code_hash is missing but password_hash exists
            isValid = await bcrypt.compare(pin_code, user.password_hash);
        }

        if (!isValid) {
            // Update failed attempts (future improvement for blocking)
            return res.status(401).json({ error: 'Code PIN incorrect' });
        }

        // Generate JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                location_id: user.location_id 
            },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        // Remove sensitive data before sending
        delete user.password_hash;
        delete user.pin_code_hash;

        createAuditLog(user.id, user.username, 'LOGIN', 'auth', user.id, { message: 'Connexion réussie' }, null, user.location_id);

        res.json({ token, user });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// Get current user (me)
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log("Session Verify - Decoded token:", decoded);

        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, full_name, role, location_id, is_active')
            .eq('id', decoded.id)
            .single();

        console.log("Session Verify - User fetched:", user, "Error:", error);

        if (error || !user) {
            console.error("Session Verify - User not found or DB error");
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        if (!user.is_active) {
            console.error("Session Verify - User inactive");
            return res.status(403).json({ error: 'Ce compte est désactivé' });
        }

        res.json(user);
    } catch (error) {
        console.error("❌ Session verification error:", error);
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
});

module.exports = router;
