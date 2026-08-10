import { createClient } from 'redis';

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

client.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('Redis error:', err.message);
  }
});

export async function connectRedis(retries = 10) {
  try {
    if (!client.isOpen) {
      await client.connect();
    }
  } catch (err) {
    if (retries <= 0) {
      console.warn(`Redis unavailable after retries, running without cache: ${err.message}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return connectRedis(retries - 1);
  }
}

export default client;
