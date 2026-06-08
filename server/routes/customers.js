const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { v4: uuidv4 } = require('uuid');
const { createAuditLog, getUserFromRequest } = require('../middleware/auditLogger');

// Generate customer ID: NOM-TELEPHONE
function generateCustomerId(name, phone) {
    const cleanName = name.toUpperCase().replace(/\s+/g, '');
    const cleanPhone = phone.replace(/\s+/g, '');
    return `${cleanName}-${cleanPhone}`;
}

// Create or get customer
router.post('/', async (req, res) => {
    try {
        const { name, phone_number } = req.body;

        if (!name || !phone_number) {
            return res.status(400).json({ error: 'Nom et téléphone requis' });
        }

        const customerId = generateCustomerId(name, phone_number);

        // Check if customer exists
        const { data: existingCustomer, error: getError } = await supabase
            .from('customers')
            .select('*')
            .eq('customer_id', customerId)
            .maybeSingle();

        if (getError) throw getError;

        let customer = existingCustomer;

        if (!customer) {
            // Create new customer
            const id = uuidv4();
            const { data: newCustomer, error: insertError } = await supabase
                .from('customers')
                .insert({
                    id,
                    customer_id: customerId,
                    name,
                    phone_number,
                    first_transaction_date: new Date().toISOString(),
                    unpaid_count: 0,
                    is_blocked: false
                })
                .select()
                .single();

            if (insertError) throw insertError;
            customer = newCustomer;

            // Audit log for new customer
            const user = getUserFromRequest(req);
            createAuditLog(
                user.id,
                user.username,
                'CREATE_CUSTOMER',
                'customer',
                customerId,
                { name, phone_number, customer_id: customerId }
            );
        }

        res.json(customer);
    } catch (error) {
        console.error('❌ Erreur POST /customers:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get customer by customer_id
router.get('/:customer_id', async (req, res) => {
    try {
        const { data: customer, error } = await supabase
            .from('customers')
            .select('*')
            .eq('customer_id', req.params.customer_id)
            .maybeSingle();

        if (error) throw error;
        if (!customer) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }

        res.json(customer);
    } catch (error) {
        console.error(`❌ Erreur GET /customers/${req.params.customer_id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Get unpaid count for a customer
router.get('/:customer_id/unpaid-count', async (req, res) => {
    try {
        const { data: customer, error } = await supabase
            .from('customers')
            .select('unpaid_count, is_blocked')
            .eq('customer_id', req.params.customer_id)
            .maybeSingle();

        if (error) throw error;
        if (!customer) {
            return res.json({ unpaid_count: 0, is_blocked: false });
        }

        res.json({
            unpaid_count: customer.unpaid_count,
            is_blocked: !!customer.is_blocked
        });
    } catch (error) {
        console.error(`❌ Erreur GET /customers/${req.params.customer_id}/unpaid-count:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Increment unpaid count
router.post('/:customer_id/increment-unpaid', async (req, res) => {
    try {
        const { data: customer, error: getError } = await supabase
            .from('customers')
            .select('*')
            .eq('customer_id', req.params.customer_id)
            .maybeSingle();

        if (getError) throw getError;
        if (!customer) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }

        const newCount = customer.unpaid_count + 1;
        const shouldBlock = newCount >= 3;

        const { data: updatedCustomer, error: updateError } = await supabase
            .from('customers')
            .update({
                unpaid_count: newCount,
                is_blocked: shouldBlock,
                updated_at: new Date().toISOString()
            })
            .eq('customer_id', req.params.customer_id)
            .select()
            .single();

        if (updateError) throw updateError;

        // Audit log if customer gets blocked
        if (shouldBlock && !customer.is_blocked) {
            const user = getUserFromRequest(req);
            createAuditLog(
                user.id,
                user.username,
                'BLOCK_CUSTOMER',
                'customer',
                req.params.customer_id,
                { name: customer.name, unpaid_count: newCount }
            );
        }

        res.json({
            unpaid_count: newCount,
            is_blocked: shouldBlock
        });
    } catch (error) {
        console.error(`❌ Erreur POST /customers/${req.params.customer_id}/increment-unpaid:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Decrement unpaid count (when payment is made)
router.post('/:customer_id/decrement-unpaid', async (req, res) => {
    try {
        const { data: customer, error: getError } = await supabase
            .from('customers')
            .select('*')
            .eq('customer_id', req.params.customer_id)
            .maybeSingle();

        if (getError) throw getError;
        if (!customer) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }

        const newCount = Math.max(0, customer.unpaid_count - 1);
        const shouldUnblock = newCount < 3;

        const { data: updatedCustomer, error: updateError } = await supabase
            .from('customers')
            .update({
                unpaid_count: newCount,
                is_blocked: shouldUnblock ? false : customer.is_blocked,
                updated_at: new Date().toISOString()
            })
            .eq('customer_id', req.params.customer_id)
            .select()
            .single();

        if (updateError) throw updateError;

        // Audit log if customer gets unblocked
        if (shouldUnblock && customer.is_blocked) {
            const user = getUserFromRequest(req);
            createAuditLog(
                user.id,
                user.username,
                'UNBLOCK_CUSTOMER',
                'customer',
                req.params.customer_id,
                { name: customer.name, unpaid_count: newCount }
            );
        }

        res.json({
            unpaid_count: newCount,
            is_blocked: !!updatedCustomer.is_blocked
        });
    } catch (error) {
        console.error(`❌ Erreur POST /customers/${req.params.customer_id}/decrement-unpaid:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Get all customers
router.get('/', async (req, res) => {
    try {
        const { data: customers, error } = await supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(customers || []);
    } catch (error) {
        console.error('❌ Erreur GET /customers:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete customer
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Delete] Tentative de suppression du client: ${id}`);

        // Get customer info before deletion
        const { data: customer, error: getError } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (getError) throw getError;
        if (!customer) {
            console.warn(`[Delete] Client non trouvé: ${id}`);
            return res.status(404).json({ error: 'Customer not found' });
        }

        const { error: deleteError } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // Audit log
        const user = getUserFromRequest(req);
        createAuditLog(
            user.id,
            user.username,
            'DELETE_CUSTOMER',
            'customer',
            customer.customer_id,
            { name: customer.name, phone_number: customer.phone_number }
        );

        console.log(`[Delete] Client ${id} supprimé avec succès`);
        res.json({ message: 'Customer deleted successfully', id });
    } catch (error) {
        console.error('❌ Erreur DELETE /customers/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
