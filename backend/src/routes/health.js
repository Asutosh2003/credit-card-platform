const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "wisibility-lending-hub",
    name: "Wisibility Loan Hub",
  });
});

module.exports = router;
