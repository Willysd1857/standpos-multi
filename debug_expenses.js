// Debug script to check expense data and queries
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database.db');
const db = new Database(dbPath);

console.log('=== EXPENSE DEBUG REPORT ===\n');

// 1. Check all expenses
console.log('1. All expenses in database:');
const allExpenses = db.prepare(`
  SELECT id, date, description, amount, category 
  FROM expenses 
  ORDER BY date DESC 
  LIMIT 10
`).all();
console.log(allExpenses);
console.log(`Total count: ${allExpenses.length}\n`);

// 2. Check today's date
const today = new Date().toISOString().split('T')[0];
console.log(`2. Today's date: ${today}\n`);

// 3. Test different query methods
console.log('3. Testing different query methods:\n');

// Method 1: LIKE with ||
console.log('Method 1: LIKE ? || "%"');
const method1 = db.prepare(`
  SELECT date, description, amount 
  FROM expenses 
  WHERE date LIKE ? || '%'
`).all(today);
console.log(`Results: ${method1.length} expenses`);
console.log(method1);
console.log(`Total: ${method1.reduce((sum, e) => sum + e.amount, 0)} Ar\n`);

// Method 2: LIKE with concatenation
console.log('Method 2: LIKE "' + today + '%"');
const method2 = db.prepare(`
  SELECT date, description, amount 
  FROM expenses 
  WHERE date LIKE ?
`).all(today + '%');
console.log(`Results: ${method2.length} expenses`);
console.log(method2);
console.log(`Total: ${method2.reduce((sum, e) => sum + e.amount, 0)} Ar\n`);

// Method 3: Direct comparison
console.log('Method 3: date = ?');
const method3 = db.prepare(`
  SELECT date, description, amount 
  FROM expenses 
  WHERE date = ?
`).all(today);
console.log(`Results: ${method3.length} expenses`);
console.log(method3);
console.log(`Total: ${method3.reduce((sum, e) => sum + e.amount, 0)} Ar\n`);

// Method 4: substr comparison
console.log('Method 4: substr(date, 1, 10) = ?');
const method4 = db.prepare(`
  SELECT date, description, amount 
  FROM expenses 
  WHERE substr(date, 1, 10) = ?
`).all(today);
console.log(`Results: ${method4.length} expenses`);
console.log(method4);
console.log(`Total: ${method4.reduce((sum, e) => sum + e.amount, 0)} Ar\n`);

// 4. Check date formats
console.log('4. Date format analysis:');
if (allExpenses.length > 0) {
    allExpenses.forEach((exp, i) => {
        console.log(`  [${i}] date="${exp.date}" (length: ${exp.date ? exp.date.length : 0})`);
    });
}

db.close();
console.log('\n=== END DEBUG REPORT ===');
