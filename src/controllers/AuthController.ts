/**
 * Authentication controller with login, callback, refresh, and status endpoints
 */

import { Request, Response } from 'express';
import session from 'express-session';
import { Database } from 'sqlite';
import jwt from 'jsonwebtoken';
import { DomainValidator } from '../services/auth/DomainValidator';
import { OAuthManager, OAuthConfig } from '../services/auth/OAuthManager';
import { TokenStore } from '../services/auth/TokenStore';
import { User } from '../types/models';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
    };
    session: session.Session & Partial<session.SessionData> & {
        oauthState?: string;
    };
}

export class AuthController {
    private readonly domainValidator: DomainValidator;
    private readonly oauthManager: OAuthManager;
    private readonly tokenStore: TokenStore;
    private readonly jwtSecret: string;

    constructor(
        private readonly db: Database,
        oauthConfig: OAuthConfig,
        encryptionKey: string,
        jwtSecret: string,
        allowedDomain: string = '@ashoka.edu.in'
    ) {
        this.domainValidator = new DomainValidator(allowedDomain);
        this.oauthManager = new OAuthManager(oauthConfig);
        this.tokenStore = new TokenStore(db, encryptionKey);
        this.jwtSecret = jwtSecret;
    }

    /**
     * Initiates OAuth login flow
     * POST /auth/login
     */
    login = async (req: Request, res: Response): Promise<void> => {
        try {
            const { email } = req.body;

            // Validate email domain if provided
            if (email) {
                const validation = this.domainValidator.validateEmail(email);
                if (!validation.isValid) {
                    res.status(400).json({
                        error: 'Invalid email',
                        message: validation.error
                    });
                    return;
                }
            }

            // Generate state for CSRF protection
            const state = this.generateState();

            // Store state in session or temporary storage
            (req as any).session = (req as any).session || {};
            (req as any).session.oauthState = state;

            const authUrl = this.oauthManager.getAuthorizationUrl(state);

            res.json({
                authUrl,
                message: 'Redirect to the provided URL to complete authentication'
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                error: 'Authentication failed',
                message: 'Unable to initiate login process'
            });
        }
    };

    /**
     * Handles OAuth callback from browser (GET request from Google)
     * GET /auth/callback
     */
    callbackGet = async (req: Request, res: Response): Promise<void> => {
        try {
            const { code, state, error } = req.query;

            // Handle OAuth errors
            if (error) {
                res.status(400).send(`
                    <html>
                        <body>
                            <h1>Authentication Error</h1>
                            <p>OAuth error: ${error}</p>
                            <p><a href="/">Try again</a></p>
                        </body>
                    </html>
                `);
                return;
            }

            if (!code) {
                res.status(400).send(`
                    <html>
                        <body>
                            <h1>Authentication Error</h1>
                            <p>Missing authorization code</p>
                            <p><a href="/">Try again</a></p>
                        </body>
                    </html>
                `);
                return;
            }

            // Validate state for CSRF protection
            if ((req as any).session?.oauthState && state !== (req as any).session.oauthState) {
                res.status(400).send(`
                    <html>
                        <body>
                            <h1>Security Error</h1>
                            <p>Invalid state parameter - possible CSRF attack detected</p>
                            <p><a href="/">Try again</a></p>
                        </body>
                    </html>
                `);
                return;
            }

            // Exchange code for tokens
            const tokens = await this.oauthManager.exchangeCodeForTokens(code as string);

            // Get user information
            const userInfo = await this.oauthManager.getUserInfo(tokens.accessToken);

            // Validate email domain
            const validation = this.domainValidator.validateEmail(userInfo.email);
            if (!validation.isValid) {
                // Revoke tokens for invalid domain
                await this.oauthManager.revokeTokens(tokens.accessToken);
                res.status(403).send(`
                    <html>
                        <body>
                            <h1>Access Denied</h1>
                            <p>${validation.error}</p>
                            <p><a href="/">Try again</a></p>
                        </body>
                    </html>
                `);
                return;
            }

            // Create or update user
            const user = await this.createOrUpdateUser(userInfo.email, userInfo.name);

            // Store OAuth tokens
            await this.tokenStore.storeTokens(user.id, tokens);

            // Generate JWT for session management
            const jwtToken = this.generateJWT(user);

            // Clear OAuth state
            if ((req as any).session) {
                delete (req as any).session.oauthState;
            }

            // Redirect to frontend with token
            const frontendUrl = process.env.FRONTEND_URL || 'http://15.206.169.99:3005';
            res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(jwtToken)}&user=${encodeURIComponent(JSON.stringify(user))}`);
        } catch (error) {
            console.error('Callback GET error:', error);
            res.status(500).send(`
                <html>
                    <body>
                        <h1>Authentication Failed</h1>
                        <p>Unable to complete authentication: ${error instanceof Error ? error.message : 'Unknown error'}</p>
                        <p><a href="/">Try again</a></p>
                    </body>
                </html>
            `);
        }
    };

    /**
     * Handles OAuth callback (POST request for API)
     * POST /auth/callback
     */
    callback = async (req: Request, res: Response): Promise<void> => {
        try {
            const { code, state, error } = req.body;

            // Handle OAuth errors
            if (error) {
                res.status(400).json({
                    error: 'OAuth error',
                    message: error
                });
                return;
            }

            if (!code) {
                res.status(400).json({
                    error: 'Missing authorization code',
                    message: 'Authorization code is required'
                });
                return;
            }

            // Validate state for CSRF protection
            if ((req as any).session?.oauthState && state !== (req as any).session.oauthState) {
                res.status(400).json({
                    error: 'Invalid state parameter',
                    message: 'Possible CSRF attack detected'
                });
                return;
            }

            // Exchange code for tokens
            const tokens = await this.oauthManager.exchangeCodeForTokens(code);

            // Get user information
            const userInfo = await this.oauthManager.getUserInfo(tokens.accessToken);

            // Validate email domain
            const validation = this.domainValidator.validateEmail(userInfo.email);
            if (!validation.isValid) {
                // Revoke tokens for invalid domain
                await this.oauthManager.revokeTokens(tokens.accessToken);
                res.status(403).json({
                    error: 'Unauthorized domain',
                    message: validation.error
                });
                return;
            }

            // Create or update user
            const user = await this.createOrUpdateUser(userInfo.email, userInfo.name);

            // Store OAuth tokens
            await this.tokenStore.storeTokens(user.id, tokens);

            // Generate JWT for session management
            const jwtToken = this.generateJWT(user);

            // Clear OAuth state
            if ((req as any).session) {
                delete (req as any).session.oauthState;
            }

            res.json({
                user: {
                    id: user.id,
                    email: user.email,
                    name: userInfo.name
                },
                token: jwtToken,
                message: 'Authentication successful'
            });
        } catch (error) {
            console.error('Callback error:', error);
            res.status(500).json({
                error: 'Authentication failed',
                message: 'Unable to complete authentication'
            });
        }
    };

    /**
     * Refreshes expired tokens
     * POST /auth/refresh
     */
    refresh = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Authentication required'
                });
                return;
            }

            const userId = req.user.id;
            const currentTokens = await this.tokenStore.getTokens(userId);

            if (!currentTokens) {
                res.status(401).json({
                    error: 'No tokens found',
                    message: 'Please re-authenticate'
                });
                return;
            }

            // Refresh tokens
            const newTokens = await this.oauthManager.refreshAccessToken(currentTokens.refreshToken);

            // Update stored tokens
            await this.tokenStore.updateAccessToken(userId, newTokens.accessToken, newTokens.expiresAt);

            // Generate new JWT
            const user = await this.getUserById(userId);
            if (!user) {
                res.status(404).json({
                    error: 'User not found',
                    message: 'User account no longer exists'
                });
                return;
            }

            const jwtToken = this.generateJWT(user);

            res.json({
                token: jwtToken,
                expiresAt: newTokens.expiresAt,
                message: 'Tokens refreshed successfully'
            });
        } catch (error) {
            console.error('Refresh error:', error);
            res.status(500).json({
                error: 'Token refresh failed',
                message: 'Unable to refresh authentication tokens'
            });
        }
    };

    /**
     * Gets authentication status
     * GET /auth/status
     */
    status = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.json({
                    authenticated: false,
                    message: 'Not authenticated'
                });
                return;
            }

            const userId = req.user.id;
            const user = await this.getUserById(userId);

            if (!user) {
                res.json({
                    authenticated: false,
                    message: 'User not found'
                });
                return;
            }

            const hasValidTokens = await this.tokenStore.hasValidTokens(userId);

            res.json({
                authenticated: true,
                user: {
                    id: user.id,
                    email: user.email,
                    lastLoginAt: user.lastLoginAt
                },
                hasValidTokens,
                message: 'Authentication status retrieved'
            });
        } catch (error) {
            console.error('Status error:', error);
            res.status(500).json({
                error: 'Status check failed',
                message: 'Unable to check authentication status'
            });
        }
    };

    /**
     * Logs out user and revokes tokens
     * POST /auth/logout
     */
    logout = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.json({
                    message: 'Already logged out'
                });
                return;
            }

            const userId = req.user.id;
            const tokens = await this.tokenStore.getTokens(userId);

            // Revoke OAuth tokens
            if (tokens) {
                try {
                    await this.oauthManager.revokeTokens(tokens.accessToken);
                } catch (error) {
                    console.error('Failed to revoke OAuth tokens:', error);
                }
            }

            // Delete stored tokens
            await this.tokenStore.deleteTokens(userId);

            res.json({
                message: 'Logged out successfully'
            });
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                error: 'Logout failed',
                message: 'Unable to complete logout'
            });
        }
    };

    /**
     * Creates or updates user in database
     */
    private async createOrUpdateUser(email: string, name?: string): Promise<User> {
        const now = new Date();
        const userId = this.generateUserId();

        // Check if user exists
        const existingUser = await this.db.get(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (existingUser) {
            // Update last login
            await this.db.run(
                'UPDATE users SET last_login_at = ? WHERE id = ?',
                [now.toISOString(), existingUser.id]
            );

            return {
                id: existingUser.id,
                email: existingUser.email,
                createdAt: new Date(existingUser.created_at),
                lastLoginAt: now,
                oauthTokens: {
                    accessToken: '',
                    refreshToken: '',
                    expiresAt: new Date()
                },
                preferences: {
                    autoClassify: Boolean(existingUser.auto_classify),
                    confidenceThreshold: existingUser.confidence_threshold || 0.7
                }
            };
        }

        // Create new user
        await this.db.run(`
      INSERT INTO users (
        id, email, created_at, last_login_at, 
        auto_classify, confidence_threshold
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
            userId,
            email,
            now.toISOString(),
            now.toISOString(),
            1, // Default auto_classify to true
            0.7 // Default confidence threshold
        ]);

        return {
            id: userId,
            email,
            createdAt: now,
            lastLoginAt: now,
            oauthTokens: {
                accessToken: '',
                refreshToken: '',
                expiresAt: new Date()
            },
            preferences: {
                autoClassify: true,
                confidenceThreshold: 0.7
            }
        };
    }

    /**
     * Gets user by ID
     */
    private async getUserById(userId: string): Promise<User | null> {
        const row = await this.db.get(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            email: row.email,
            createdAt: new Date(row.created_at),
            lastLoginAt: new Date(row.last_login_at),
            oauthTokens: {
                accessToken: '',
                refreshToken: '',
                expiresAt: new Date()
            },
            preferences: {
                autoClassify: Boolean(row.auto_classify),
                confidenceThreshold: row.confidence_threshold || 0.7
            }
        };
    }

    /**
     * Generates JWT token for user session
     */
    private generateJWT(user: User): string {
        return jwt.sign(
            {
                id: user.id,
                email: user.email
            },
            this.jwtSecret,
            {
                expiresIn: '24h',
                issuer: 'intelligent-email-filter',
                subject: user.id
            }
        );
    }

    /**
     * Generates random state for CSRF protection
     */
    private generateState(): string {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }

    /**
     * Generates unique user ID
     */
    private generateUserId(): string {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }
}