import { body } from "express-validator";

export default [
  body("title")
    .notEmpty()
    .withMessage("Title is required")
    .bail()
    .isLength({ min: 5, max: 100 })
    .withMessage("Title must be between 5 and 100 characters"),

  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message is required")
    .bail()
    .isLength({ min: 10, max: 1000 })
    .withMessage("Message must be between 10 and 1000 characters"),
];
