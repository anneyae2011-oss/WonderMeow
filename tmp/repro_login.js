
import fetch from 'node-fetch';

async function testLogin() {
    const url = 'http://localhost:5000/api/admin/login';
    
    console.log("Testing with no body...");
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) {
        console.error("Error:", e);
    }

    console.log("\nTesting with empty object body...");
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) {
        console.error("Error:", e);
    }
}

testLogin();
