import { body } from "express-validator";

export default [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .bail()
    .matches(/^[a-z]+([._][a-z]+)*$/)
    .withMessage(
      "Username must be lowercase without special characters except for . and _",
    )
    .bail()
    .isLength({ min: 3, max: 15 })
    .withMessage("Username must be between 3 and 15 characters"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .bail()
    .isLength({ min: 5 })
    .withMessage("Password must be at least 5 characters long"),
];
