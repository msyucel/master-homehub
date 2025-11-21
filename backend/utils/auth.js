const bcrypt = require('bcryptjs');

// Hash password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Generate random username
const generateUsername = (firstName, lastName) => {
  const randomNum = Math.floor(Math.random() * 10000);
  const firstPart = firstName.toLowerCase().substring(0, 3);
  const lastPart = lastName.toLowerCase().substring(0, 3);
  return `${firstPart}${lastPart}${randomNum}`;
};

module.exports = {
  hashPassword,
  comparePassword,
  generateUsername,
};

