// requireAdmin.js
export function isAdmin(req) {
  return req.user && req.user.role === "admin";
}

function requireAdmin(req, res, next) {
    // Check if user is logged in and has an admin role
    if (isAdmin(req)) {
      return next(); // Allow the request to continue to the next handler (admin route)
    }
    // If not an admin, deny access and return a 403 Forbidden status
    res.status(403).json({ success: false, message: 'Access denied: Admins only.' });
  }
  
  export default requireAdmin;
  