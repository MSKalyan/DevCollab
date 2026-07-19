import jwt from 'jsonwebtoken';

const setUser = (req, res, next) => {
  const cookieToken = req.cookies && req.cookies.access_token;
  const authHeader = req.headers.authorization;
  const token = cookieToken || (authHeader && authHeader.split(" ")[1]);

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
};

export default setUser;
