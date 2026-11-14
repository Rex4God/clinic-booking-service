"use strict";
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

const connect = async () => {

  await mongoose.disconnect();

  mongod = await MongoMemoryServer.create();

  const mongoUri = mongod.getUri();
  try {
    await mongoose.connect(mongoUri);
    // Build unique indexes up-front: the double-booking guarantees rely on them
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    console.log("Connected to the database.");
  } catch (err) {
    console.error(err);
  }
};


const close = async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  console.log("Database connection closed.");
};


const clear = async () => {
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

module.exports = {
  connect,
  close,
  clear,
};
