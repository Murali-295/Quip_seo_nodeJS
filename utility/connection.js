const { MongoClient ,ObjectId } = require('mongodb');
require('dotenv').config();

let db;
let client;

const connectDB = async () => {
  if (client) return client; // Return the existing client if already connected

  try {
    client = new MongoClient(process.env.MONGO_URI);
    await client.connect(); // Establish connection
    db = client.db(); // Set the database instance
    console.log("Connected to MongoDB");
    return client; // Return client to be used by other parts of the app
  } catch (err) {
    console.error("Database connection failed", err);
    throw err; // Throw error if connection fails
  }
};

const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized yet.');
  }
  return db;
};

const getObjectId = (req) => {
  return new ObjectId(req);
};

// Initialize DB connection when this module is loaded
connectDB().catch(err => {
  console.error('Error initializing database connection:', err);
});

module.exports = { connectDB, getDB, getObjectId};
