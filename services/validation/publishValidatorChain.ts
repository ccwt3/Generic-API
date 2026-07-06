import { body } from "express-validator";

export default [
  body("is_published")
    .exists()
    .withMessage("is_published is required")
    .bail()
    .isBoolean({ strict: true })
    .withMessage("is_published must be a boolean"),
];
