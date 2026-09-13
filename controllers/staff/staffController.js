const Staff = require("../../models/staff/staffModel");
const User = require("../../models/user/userModel");
const createError = require("http-errors");

// Helper to enrich a staff document with matching user role based on phone number
const enrichStaffWithRole = async (staff) => {
    const staffObj = staff.toObject();
    
    // Parse phone number into digits only
    const cleanPhoneStr = staff.phone ? staff.phone.replace(/\D/g, "") : "";
    const numericPhone = cleanPhoneStr ? Number(cleanPhoneStr) : NaN;

    if (isNaN(numericPhone)) {
        staffObj.role = null;
        return staffObj;
    }

    try {
        const matchingUser = await User.findOne({
            isDeleted: { $ne: true },
            phone: numericPhone
        });
        staffObj.role = matchingUser ? matchingUser.role : null;
    } catch (err) {
        staffObj.role = null;
    }
    return staffObj;
};

const getStaffList = async (req, res, next) => {
    try {
        const staffDocs = await Staff.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
        
        const data = [];
        for (const doc of staffDocs) {
            const enriched = await enrichStaffWithRole(doc);
            data.push(enriched);
        }

        res.status(200).json({
            success: true,
            message: "Staff list retrieved successfully",
            data
        });
    } catch (error) {
        next(error);
    }
};

const createStaff = async (req, res, next) => {
    try {
        const { name, email, phone, panNumber, citizenshipNumber, salary, isCurrentlyEmployed } = req.body;
        
        // Required validation: name and phone
        if (!name || !phone) {
            const error = createError(400, "Name and Contact Number are required!");
            return next(error);
        }

        // Phone format validation (Nepal 10 digits starting with 98, 97 or 96)
        const cleanPhoneStr = phone.replace(/\D/g, "");
        if (!/^(98|97|96)\d{8}$/.test(cleanPhoneStr)) {
            const error = createError(400, "Please provide a valid 10-digit contact number starting with 98, 97, or 96!");
            return next(error);
        }

        // Email format validation (optional)
        if (email && !/\S+@\S+\.\S+/.test(email)) {
            const error = createError(400, "Please provide a valid email address!");
            return next(error);
        }

        // Unique phone constraint check
        const existingByPhone = await Staff.findOne({
            isDeleted: { $ne: true },
            phone: cleanPhoneStr
        });
        if (existingByPhone) {
            const error = createError(400, "Staff with this contact number already exists!");
            return next(error);
        }

        // Unique email constraint check (if email is provided)
        if (email) {
            const existingByEmail = await Staff.findOne({
                isDeleted: { $ne: true },
                email: email.trim().toLowerCase()
            });
            if (existingByEmail) {
                const error = createError(400, "Staff with this email address already exists!");
                return next(error);
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        const staff = new Staff({
            name,
            email: email ? email.trim().toLowerCase() : "",
            phone: cleanPhoneStr,
            panNumber: panNumber || "",
            citizenshipNumber: citizenshipNumber || "",
            salary: parseFloat(salary) || 0,
            isCurrentlyEmployed: isCurrentlyEmployed !== undefined ? isCurrentlyEmployed : true,
            createdBy: actorName
        });

        await staff.save();
        const enriched = await enrichStaffWithRole(staff);

        res.status(201).json({
            success: true,
            message: "Staff member created successfully",
            data: enriched
        });
    } catch (error) {
        next(error);
    }
};

const updateStaff = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, email, phone, panNumber, citizenshipNumber, salary, isCurrentlyEmployed } = req.body;

        // Required validation
        if (!name || !phone) {
            const error = createError(400, "Name and Contact Number are required!");
            return next(error);
        }

        const cleanPhoneStr = phone.replace(/\D/g, "");
        if (!/^(98|97|96)\d{8}$/.test(cleanPhoneStr)) {
            const error = createError(400, "Please provide a valid 10-digit contact number starting with 98, 97, or 96!");
            return next(error);
        }

        if (email && !/\S+@\S+\.\S+/.test(email)) {
            const error = createError(400, "Please provide a valid email address!");
            return next(error);
        }

        const staff = await Staff.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!staff) {
            const error = createError(404, "Staff member not found!");
            return next(error);
        }

        // Check constraints matching other staff members
        const otherByPhone = await Staff.findOne({
            _id: { $ne: id },
            isDeleted: { $ne: true },
            phone: cleanPhoneStr
        });
        if (otherByPhone) {
            const error = createError(400, "Another staff member with this contact number already exists!");
            return next(error);
        }

        if (email) {
            const otherByEmail = await Staff.findOne({
                _id: { $ne: id },
                isDeleted: { $ne: true },
                email: email.trim().toLowerCase()
            });
            if (otherByEmail) {
                const error = createError(400, "Another staff member with this email address already exists!");
                return next(error);
            }
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        
        staff.name = name;
        staff.email = email ? email.trim().toLowerCase() : "";
        staff.phone = cleanPhoneStr;
        staff.panNumber = panNumber || "";
        staff.citizenshipNumber = citizenshipNumber || "";
        staff.salary = parseFloat(salary) || 0;
        staff.isCurrentlyEmployed = isCurrentlyEmployed !== undefined ? isCurrentlyEmployed : true;
        staff.updatedBy = actorName;
        staff.updatedOn = new Date();

        await staff.save();
        const enriched = await enrichStaffWithRole(staff);

        res.status(200).json({
            success: true,
            message: "Staff member updated successfully",
            data: enriched
        });
    } catch (error) {
        next(error);
    }
};

const deleteStaff = async (req, res, next) => {
    try {
        const { id } = req.params;
        const staff = await Staff.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!staff) {
            const error = createError(404, "Staff member not found!");
            return next(error);
        }

        const actorName = req.user ? (req.user.email || String(req.user.phone || req.user.role)) : "System";
        staff.isDeleted = true;
        staff.deletedBy = actorName;
        staff.deletedOn = new Date();

        await staff.save();

        res.status(200).json({
            success: true,
            message: "Staff member deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getStaffList,
    createStaff,
    updateStaff,
    deleteStaff
};
