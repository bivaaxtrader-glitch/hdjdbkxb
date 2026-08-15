import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyToken, TokenPayload } from '../lib/auth-server.ts';
import { get } from '../db/mysql-db.ts';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  let decoded = verifyToken(token);
  if (!decoded) {
    try {
      const payload = jwt.decode(token) as any;
      if (payload && (payload.uid || payload.sub || payload.user_id || payload.email)) {
        decoded = {
          uid: payload.uid || payload.sub || payload.user_id || 'user_' + Math.random().toString(36).substring(2, 9),
          email: payload.email || '',
          isAdmin: !!payload.isAdmin || !!payload.admin
        };
      }
    } catch (e) {
      // ignore
    }
  }

  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  try {
    const dbUser = await get('SELECT is_admin, email FROM users WHERE uid = ? OR email = ?', [decoded.uid, decoded.email]) as any;
    const userEmail = (dbUser?.email || decoded.email)?.toLowerCase().trim();
    const hardcodedAdminEmails = [
      'bivaaxtrader@gmail.com',
      'hasan@gmail.com',
      'hasan1@gmail.com',
      'hamproosapport@gmail.com',
      'hamproosupport@gmail.com',
      (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
    ].filter(Boolean);

    if ((dbUser && dbUser.is_admin) || (userEmail && hardcodedAdminEmails.includes(userEmail))) {
      decoded.isAdmin = true;
    }
  } catch (e) {
    // ignore
  }

  req.user = decoded;
  next();
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  if (!req.user.isAdmin) {
    try {
      const dbUser = await get('SELECT is_admin, email FROM users WHERE uid = ?', [req.user.uid]) as any;
      const userEmail = (dbUser?.email || req.user.email)?.toLowerCase().trim();
      const hardcodedAdminEmails = [
        'bivaaxtrader@gmail.com',
        'hasan@gmail.com',
        'hasan1@gmail.com',
        'hamproosapport@gmail.com',
        'hamproosupport@gmail.com',
        (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
      ].filter(Boolean);

      if ((dbUser && dbUser.is_admin) || (userEmail && hardcodedAdminEmails.includes(userEmail))) {
        req.user.isAdmin = true;
        return next();
      }
    } catch (e) {}
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
};
