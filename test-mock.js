import express from "express";
import { EventEmitter } from "events";

const app = express();
app.use(express.json());

app.post("/test", (req, res) => {
  res.json({ ok: true, url: req.url, method: req.method, _body: req._body, parsed: req.body });
});

app.post("/batch", (req, res) => {
  const subReq = { method: "POST", path: "/test", body: { hello: "world" } };
  
  // Node 24 safe mock
  const mockReq = new EventEmitter();
  mockReq.method = subReq.method;
  mockReq.url = subReq.path;
  mockReq.originalUrl = subReq.path;
  mockReq.body = subReq.body;
  mockReq._body = true; // Tell body-parser it's parsed
  mockReq.headers = req.headers;
  
  const mockRes = new EventEmitter();
  mockRes.statusCode = 200;
  mockRes._headers = {};
  mockRes.locals = {};
  mockRes.setHeader = function(k, v) { this._headers[k] = v; };
  mockRes.get = function(h) { return this._headers[h]; };
  mockRes.status = function(c) { this.statusCode = c; return this; };
  mockRes.json = function(d) { console.log("RESPONDED:", d); res.json({ result: d }); };
  mockRes.end = function() {};
  
  app.handle(mockReq, mockRes);
});

const _server = app.listen(3001, async () => {
    try {
        const res = await fetch("http://localhost:3001/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doThing: true })
        });
        const data = await res.json();
        console.log("Output:", data);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
});
