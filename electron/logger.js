const fs = require('fs');
const path = require('path');

class Logger {
    constructor(logDir) {
        this.logDir = logDir;
        this.logFile = path.join(logDir, 'app.log');

        // Create log directory if it doesn't exist
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    _formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    _writeToFile(message) {
        try {
            fs.appendFileSync(this.logFile, message + '\n', 'utf8');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    info(message) {
        const formatted = this._formatMessage('INFO', message);
        console.log(formatted);
        this._writeToFile(formatted);
    }

    error(message, error) {
        const errorDetails = error ? `\n${error.stack || error.message || error}` : '';
        const formatted = this._formatMessage('ERROR', message + errorDetails);
        console.error(formatted);
        this._writeToFile(formatted);
    }

    warn(message) {
        const formatted = this._formatMessage('WARN', message);
        console.warn(formatted);
        this._writeToFile(formatted);
    }

    debug(message) {
        const formatted = this._formatMessage('DEBUG', message);
        console.log(formatted);
        this._writeToFile(formatted);
    }

    // Clear old logs (keep last 7 days)
    cleanOldLogs() {
        try {
            if (fs.existsSync(this.logFile)) {
                const stats = fs.statSync(this.logFile);
                const fileAge = Date.now() - stats.mtimeMs;
                const sevenDays = 7 * 24 * 60 * 60 * 1000;

                if (fileAge > sevenDays) {
                    fs.unlinkSync(this.logFile);
                    this.info('Old log file cleaned');
                }
            }
        } catch (error) {
            console.error('Failed to clean old logs:', error);
        }
    }
}

module.exports = Logger;
