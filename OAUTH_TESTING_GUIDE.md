# 🔐 Complete OAuth Testing Guide

This guide walks you through testing the complete Google OAuth flow for the Intelligent Email Filter API.

## 🚀 Prerequisites

1. **Docker containers running:**
   ```bash
   docker-compose up --build
   ```

2. **API accessible at:** `http://localhost:3000`

3. **Google OAuth credentials configured** in your `.env` file

## 📋 Testing Methods

### Method 1: Using the HTML Test Helper (Recommended)

1. **Open the test helper:**
   - Open `oauth_test.html` in your browser
   - This provides a user-friendly interface for the OAuth flow

2. **Follow the step-by-step process:**
   - Enter your @ashoka.edu.in email
   - Click "Start OAuth Login"
   - Follow the Google OAuth flow
   - Copy the authorization code
   - Exchange it for a JWT token
   - Test protected endpoints

### Method 2: Using Postman Collection

1. **Import the collection:**
   - Import `postman_collection.json` into Postman
   - The collection includes automated tests and variable management

2. **Run the requests in order:**
   - Health Check
   - Auth Status (Before Login)
   - Start OAuth Login
   - OAuth Callback (Manual step required)
   - Auth Status (After Login)
   - Test protected endpoints

### Method 3: Manual cURL Commands

#### Step 1: Health Check
```bash
curl -X GET http://localhost:3000/health
```

#### Step 2: Start OAuth Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@ashoka.edu.in"}' \
  -c cookies.txt
```

#### Step 3: Complete OAuth Flow
1. Copy the `authUrl` from the response
2. Open it in your browser
3. Complete Google OAuth
4. Copy the authorization code from the callback URL

#### Step 4: Exchange Code for Token
```bash
curl -X POST http://localhost:3000/api/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "YOUR_AUTH_CODE", "state": "YOUR_STATE"}' \
  -b cookies.txt
```

#### Step 5: Test Protected Endpoints
```bash
# Replace YOUR_JWT_TOKEN with the token from step 4
curl -X GET http://localhost:3000/api/emails \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔍 OAuth Flow Details

### 1. Login Endpoint (`POST /api/auth/login`)
- **Input:** `{"email": "user@ashoka.edu.in"}`
- **Output:** Google OAuth authorization URL
- **Purpose:** Initiates the OAuth flow and generates CSRF protection state

### 2. OAuth Authorization (Browser)
- User visits the OAuth URL
- Completes Google authentication
- Google redirects to callback URL with authorization code

### 3. Callback Endpoint (`POST /api/auth/callback`)
- **Input:** `{"code": "auth_code", "state": "csrf_state"}`
- **Output:** JWT token and user information
- **Purpose:** Exchanges authorization code for OAuth tokens and creates user session

### 4. Protected Endpoints
- **Authentication:** `Authorization: Bearer JWT_TOKEN`
- **Available endpoints:** All `/api/*` endpoints except auth endpoints

## 🧪 Expected Responses

### Successful Login Response:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "message": "Redirect to the provided URL to complete authentication"
}
```

### Successful Callback Response:
```json
{
  "user": {
    "id": "user_1234567890_abc123",
    "email": "test@ashoka.edu.in",
    "name": "Test User"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "Authentication successful"
}
```

### Protected Endpoint Response:
```json
{
  "emails": [],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 0
  }
}
```

## 🚨 Common Issues & Solutions

### Issue 1: "Invalid email domain"
- **Cause:** Email doesn't end with @ashoka.edu.in
- **Solution:** Use a valid @ashoka.edu.in email address

### Issue 2: "OAuth error" or "Invalid authorization code"
- **Cause:** Authorization code expired or invalid
- **Solution:** Restart the OAuth flow and use the code immediately

### Issue 3: "Invalid state parameter"
- **Cause:** CSRF state mismatch
- **Solution:** Ensure you're using the same browser session or copy the state correctly

### Issue 4: "Access token required"
- **Cause:** Missing or invalid JWT token
- **Solution:** Complete the OAuth flow to get a valid JWT token

### Issue 5: Database errors
- **Cause:** Database not initialized
- **Solution:** Restart Docker containers to run migrations

## 🔧 Environment Variables Required

Make sure these are set in your `.env` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# JWT & Security
JWT_SECRET=your-jwt-secret-key
ENCRYPTION_KEY=your-32-character-encryption-key
SESSION_SECRET=your-session-secret-key

# OpenAI (for protected endpoints to work fully)
OPENAI_API_KEY=your-openai-api-key
```

## 📊 Testing Checklist

- [ ] Health check returns 200 OK
- [ ] Login generates valid OAuth URL
- [ ] OAuth URL redirects to Google
- [ ] Google OAuth completes successfully
- [ ] Callback returns JWT token
- [ ] JWT token works for protected endpoints
- [ ] Auth status shows authenticated user
- [ ] Logout revokes access
- [ ] Subsequent requests fail after logout

## 🎯 Next Steps

Once OAuth is working:

1. **Test email indexing:** Use `/api/indexing/full` to start indexing
2. **Create filter expectations:** Use `/api/filter/expectations`
3. **Test email filtering:** Use `/api/filter/batch`
4. **Search emails:** Use `/api/emails/search`

The OAuth flow is now complete and ready for production use! 🎉