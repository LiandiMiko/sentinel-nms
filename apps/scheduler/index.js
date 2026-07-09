import axios from "axios";

const API_URL = "http://localhost:3000/api/v1/metrics/poll";

console.log("=================================");
console.log(" Sentinel Scheduler");
console.log("=================================");

async function poll() {
    try {
        console.log("Polling API...");

        const response = await axios.post(API_URL);

        console.log("Success");
        console.log(JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error("Polling failed");

        if (err.response) {
            console.error(err.response.data);
        } else {
            console.error(err.message);
        }
    }
}

poll();

setInterval(poll, 5000);