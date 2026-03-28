// Optimized script.js with error handling, connection pooling, memory management, and performance improvements.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'https://api.example.com';

export default function() {
    // Implement a connection pool for managing connections efficiently
    const connectionPool = new http.ConnectionPool({maxSize: 10});

    // Wrap the request in a try-catch for error handling
    try {
        const response = connectionPool.get(`${BASE_URL}/endpoint`);

        // Check the response
        check(response, { 'status was 200': (r) => r.status === 200 });

    } catch (error) {
        console.error('Error occurred while fetching data:', error);
    } finally {
        // Manage memory efficiently
        connectionPool.close();
    }

    // Introduce a sleep for pacing the requests
    sleep(1);
}