import { app } from "./server.js";
import supertest from "supertest";

async function testBatch() {
  console.log("Starting batch test...");
  try {
    const res = await supertest(app)
      .post("/api/batch")
      .send({
        requests: [
          { method: "POST", path: "/api/farm/plant", body: { plotId: 0, cropId: "strawberry" } },
          { method: "POST", path: "/api/farm/state", body: {} }
        ]
      })
      .set("Authorization", "Bearer 1")
      .expect(200);

    console.log("Response:", JSON.stringify(res.body, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

testBatch();
