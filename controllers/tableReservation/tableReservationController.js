const TableReservation = require("../../models/tableReservation/tableReservationModel");
const createError = require("http-errors");

// Public: Submit table reservation request
const submitTableReservation = async (req, res, next) => {
    try {
        const { name, phone, email, guests, date, time, occasion, notes } = req.body;

        if (!name || !name.trim()) {
            return next(createError(400, "Full Name is required!"));
        }
        if (!phone || !phone.trim()) {
            return next(createError(400, "Phone number is required!"));
        }
        if (!guests || !guests.trim()) {
            return next(createError(400, "Number of guests is required!"));
        }
        if (!date || !date.trim()) {
            return next(createError(400, "Reservation date is required!"));
        }
        if (!time || !time.trim()) {
            return next(createError(400, "Reservation time is required!"));
        }

        const newReservation = await TableReservation.create({
            name: name.trim(),
            phone: phone.trim(),
            email: email ? email.trim() : "",
            guests: guests.trim(),
            date: date.trim(),
            time: time.trim(),
            occasion: occasion ? occasion.trim() : "",
            notes: notes ? notes.trim() : ""
        });

        res.status(201).json({
            success: true,
            message: "Table reservation submitted successfully!",
            data: newReservation
        });
    } catch (error) {
        next(error);
    }
};

// Admin: Get all table reservations with status & search filtering
const getTableReservations = async (req, res, next) => {
    try {
        const { status, search } = req.query;
        const query = { isDeleted: { $ne: true } };

        if (status && status !== "All") {
            query.status = status;
        }

        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), "i");
            query.$or = [
                { name: searchRegex },
                { phone: searchRegex },
                { email: searchRegex },
                { guests: searchRegex },
                { date: searchRegex },
                { occasion: searchRegex }
            ];
        }

        const reservations = await TableReservation.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: "Table reservations retrieved successfully",
            data: reservations
        });
    } catch (error) {
        next(error);
    }
};

// Admin: Update reservation status or CRM notes
const updateTableReservation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, crmNotes } = req.body;

        const reservation = await TableReservation.findById(id);
        if (!reservation || reservation.isDeleted) {
            return next(createError(404, "Reservation request not found!"));
        }

        if (status) reservation.status = status;
        if (crmNotes !== undefined) reservation.crmNotes = crmNotes;

        await reservation.save();

        res.status(200).json({
            success: true,
            message: "Reservation request updated successfully",
            data: reservation
        });
    } catch (error) {
        next(error);
    }
};

// Admin: Soft delete a reservation request
const deleteTableReservation = async (req, res, next) => {
    try {
        const { id } = req.params;

        const reservation = await TableReservation.findById(id);
        if (!reservation || reservation.isDeleted) {
            return next(createError(404, "Reservation request not found!"));
        }

        reservation.isDeleted = true;
        await reservation.save();

        res.status(200).json({
            success: true,
            message: "Reservation request deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    submitTableReservation,
    getTableReservations,
    updateTableReservation,
    deleteTableReservation
};
