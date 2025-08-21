/**
 * Authentication middleware for JWT token validation
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

/**
 * Middleware to authenticate JWT tokens
 */
export function authenticateToken(jwtSecret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid access token'
      });
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as any;
      req.user = {
        id: decoded.id,
        email: decoded.email
      };
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          error: 'Token expired',
          message: 'Access token has expired. Please refresh your token.'
        });
      } else if (error instanceof jwt.JsonWebTokenError) {
        res.status(403).json({
          error: 'Invalid token',
          message: 'Access token is invalid'
        });
      } else {
        res.status(500).json({
          error: 'Authentication error',
          message: 'Unable to authenticate token'
        });
      }
    }
  };
}

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export function optionalAuth(jwtSecret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      next();
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as any;
      req.user = {
        id: decoded.id,
        email: decoded.email
      };
    } catch (error) {
      // Ignore token errors in optional auth
      console.warn('Optional auth token validation failed:', error);
    }

    next();
  };
}