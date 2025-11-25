const crypto = require('crypto');

// Encryption key - should be stored in environment variable in production
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypts a numeric value (amount) to a secure string
 * @param {number} amount - The amount to encrypt
 * @returns {string} - Encrypted string
 */
function encryptAmount(amount) {
  try {
    // Convert amount to string for encryption
    const text = amount.toString();
    
    // Generate a random IV (Initialization Vector)
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from ENCRYPTION_KEY
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine IV + tag + encrypted data
    const result = iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
    
    return result;
  } catch (error) {
    console.error('Error encrypting amount:', error);
    throw new Error('Failed to encrypt amount');
  }
}

/**
 * Decrypts an encrypted amount string back to a number
 * @param {string} encryptedAmount - The encrypted string
 * @returns {number} - Decrypted amount
 */
function decryptAmount(encryptedAmount) {
  try {
    if (!encryptedAmount || typeof encryptedAmount !== 'string') {
      // If it's not encrypted (old data or invalid), try to parse as number
      const parsed = parseFloat(encryptedAmount);
      if (!isNaN(parsed)) {
        return parsed;
      }
      throw new Error('Invalid encrypted amount format');
    }
    
    // Split the encrypted string
    const parts = encryptedAmount.split(':');
    if (parts.length !== 3) {
      // Try to parse as plain number (for backward compatibility)
      const parsed = parseFloat(encryptedAmount);
      if (!isNaN(parsed)) {
        return parsed;
      }
      throw new Error('Invalid encrypted amount format');
    }
    
    const [ivHex, tagHex, encrypted] = parts;
    
    // Convert hex strings back to buffers
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    // Derive key from ENCRYPTION_KEY
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Convert back to number
    return parseFloat(decrypted);
  } catch (error) {
    console.error('Error decrypting amount:', error);
    // Try to parse as plain number for backward compatibility
    const parsed = parseFloat(encryptedAmount);
    if (!isNaN(parsed)) {
      return parsed;
    }
    throw new Error('Failed to decrypt amount');
  }
}

module.exports = {
  encryptAmount,
  decryptAmount
};

