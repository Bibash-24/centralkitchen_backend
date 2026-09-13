const express = require("express");
const router = express.Router();
const {
    submitTableReservation,
    getTableReservations,
    updateTableReservation,
    deleteTableReservation
} = require("../../controllers/tableReservation/tableReservationController");

// Public route to submit reservation
router.post("/", submitTableReservation);

// Admin routes
router.get("/", getTableReservations);
router.put("/:id", updateTableReservation);
router.delete("/:id", deleteTableReservation);

module.exports = router;
