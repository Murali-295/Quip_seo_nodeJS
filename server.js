const express = require('express');
require('dotenv').config();
const domainRoutes = require('./routes/domainRoutes');
const app = express();

// Middleware to parse form data
app.use(express.json()); // For parsing JSON data

// Routes
app.use('/domain', domainRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
