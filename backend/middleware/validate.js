// Lightweight request validators (no external dependency).
// Returns an array of error strings; empty array means valid.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegister({ name, email, password }) {
  const errors = [];
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.push("Name must be at least 2 characters.");
  }
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    errors.push("A valid email is required.");
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    errors.push("Password must be at least 8 characters.");
  }
  return errors;
}

export function validateLogin({ email, password }) {
  const errors = [];
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    errors.push("A valid email is required.");
  }
  if (!password || typeof password !== "string" || password.length === 0) {
    errors.push("Password is required.");
  }
  return errors;
}

export function validateBlog({ title, content }) {
  const errors = [];
  if (!title || typeof title !== "string" || title.trim().length < 3) {
    errors.push("Title must be at least 3 characters.");
  }
  if (!content || typeof content !== "string" || content.trim().length < 10) {
    errors.push("Content must be at least 10 characters.");
  }
  return errors;
}

// Express middleware factory that validates req.body with the given fn.
export function bodyValidator(fn) {
  return (req, res, next) => {
    const errors = fn(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(" "), errors });
    }
    next();
  };
}
