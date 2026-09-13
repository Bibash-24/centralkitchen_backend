const express = require("express");
const {
    addMenuCategory,
    getMenuCategories,
    updateMenuCategory,
    deleteMenuCategory
} = require("../../controllers/menuCategory/menuCategoryController");
const router = express.Router();
const { isVerifiedUser } = require("../../middlewares/tokenVerification");

/**
 * @swagger
 * tags:
 *   name: Menu Categories
 *   description: Menu category management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     MenuCategory:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Unique name of the category
 *           example: "Chiya Specials"
 *         description:
 *           type: string
 *           description: Optional description of the category
 *           example: "Traditional Nepali tea and beverages"
 *         isActive:
 *           type: boolean
 *           description: Whether the category is visible/active
 *           default: true
 */

/**
 * @swagger
 * /api/menu-category:
 *   post:
 *     summary: Create a new menu category
 *     tags: [Menu Categories]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MenuCategory'
 *     responses:
 *       201:
 *         description: Menu category created successfully
 *       400:
 *         description: Bad request (missing name or duplicate)
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Retrieve all active menu categories
 *     tags: [Menu Categories]
 *     responses:
 *       200:
 *         description: Menu categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MenuCategory'
 */
router.route("/").post(isVerifiedUser, addMenuCategory);
router.route("/").get(getMenuCategories);

/**
 * @swagger
 * /api/menu-category/{id}:
 *   put:
 *     summary: Update an existing menu category
 *     tags: [Menu Categories]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The menu category ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Snacks"
 *               description:
 *                 type: string
 *                 example: "Light bites and starters"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Menu category updated successfully
 *       400:
 *         description: Bad request (invalid ID or duplicate name)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 *   delete:
 *     summary: Soft delete a menu category
 *     tags: [Menu Categories]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The menu category ID to delete
 *     responses:
 *       200:
 *         description: Menu category deleted successfully
 *       400:
 *         description: Bad request (invalid ID)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 */
router.route("/:id").put(isVerifiedUser, updateMenuCategory);
router.route("/:id").delete(isVerifiedUser, deleteMenuCategory);

module.exports = router;
