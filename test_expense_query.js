const { db } = require('./server/database');

// Test date query
const testDate = '2026-02-04';
console.log('Testing expense query for date:', testDate);

// Test 1: Original query with DATE()
console.log('\n=== Test 1: Using DATE(date) ===');
try {
    const result1 = db.prepare(`
    SELECT date, description, amount 
    FROM expenses 
    WHERE DATE(date) = ?
  `).all(testDate);
    console.log('Results:', result1);
} catch (err) {
    console.error('Error:', err.message);
}

// Test 2: Corrected query with date()
console.log('\n=== Test 2: Using date(date) ===');
try {
    const result2 = db.prepare(`
    SELECT date, description, amount 
    FROM expenses 
    WHERE date(date) = ?
  `).all(testDate);
    console.log('Results:', result2);
    console.log('Total:', result2.reduce((sum, e) => sum + e.amount, 0));
} catch (err) {
    console.error('Error:', err.message);
}

// Test 3: All expenses
console.log('\n=== Test 3: All expenses (last 5) ===');
const allExpenses = db.prepare(`
  SELECT date, description, amount 
  FROM expenses 
  ORDER BY date DESC 
  LIMIT 5
`).all();
console.log('Results:', allExpenses);

// Test 4: Direct string comparison
console.log('\n=== Test 4: Using direct string comparison ===');
const result4 = db.prepare(`
  SELECT date, description, amount 
  FROM expenses 
  WHERE date = ?
`).all(testDate);
console.log('Results:', result4);
console.log('Total:', result4.reduce((sum, e) => sum + e.amount, 0));
