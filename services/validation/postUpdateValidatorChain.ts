import { body } from "express-validator";

export default [
  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message is required")
    .bail()
    .isLength({ min: 10, max: 1000 })
    .withMessage("Message must be between 10 and 1000 characters"),
];
