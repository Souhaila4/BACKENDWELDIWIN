# SOS Alert Testing Guide - Swagger

## 📋 Prerequisites

1. **Start your backend server** (if not already running):
   ```bash
   npm run start:dev
   ```

2. **Access Swagger UI**:
   - Open your browser and go to: `http://localhost:3005/api`
   - You should see the Swagger documentation interface

## 🔐 Step 1: Authenticate (Get JWT Token)

You need to authenticate as either a **Child** or a **Parent** to test SOS alerts.

### Option A: Login as a Child (to trigger SOS)

1. In Swagger, find the **Authentication** section
2. Click on `POST /auth/login/qr`
3. Click **"Try it out"**
4. Enter a valid QR code in the request body:
   ```json
   {
     "qrCode": "your-child-qr-code-here"
   }
   ```
5. Click **"Execute"**
6. Copy the `access_token` from the response

### Option B: Login as a Parent (to view/respond to SOS)

1. In Swagger, find the **Authentication** section
2. Click on `POST /auth/login`
3. Click **"Try it out"**
4. Enter parent credentials:
   ```json
   {
     "email": "parent@example.com",
     "password": "password123"
   }
   ```
5. Click **"Execute"**
6. Copy the `access_token` from the response

### Authorize in Swagger

1. Click the **🔒 Authorize** button at the top right of Swagger UI
2. In the "JWT-auth" field, enter: `Bearer YOUR_ACCESS_TOKEN`
   - Example: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
3. Click **"Authorize"**
4. Click **"Close"**

Now all authenticated endpoints will use this token automatically.

---

## 🚨 Step 2: Test SOS Alert Endpoints

### Test 1: Trigger SOS Alert (Child Only)

**Endpoint**: `POST /sos-alert/trigger/{childId}`

**Steps**:
1. Make sure you're authenticated as a **Child** (use QR login)
2. Find the **SOS Alerts** section in Swagger
3. Click on `POST /sos-alert/trigger/{childId}`
4. Click **"Try it out"**
5. Enter the `childId` parameter (should match the logged-in child's ID)
6. Click **"Execute"**

**Expected Response** (201 Created):
```json
{
  "_id": "alert-id-here",
  "child": "child-id-here",
  "parent": "parent-id-here",
  "status": "PENDING",
  "parentCallAttempts": 0,
  "emergencyCallAttempts": 0,
  "callHistory": [],
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

**What happens**:
- SOS alert is created
- WebSocket notification is sent to parent's app to initiate Messenger call
- Status will change to `CALLING_PARENT` after a few seconds

---

### Test 2: Get Active SOS Alert

**Endpoint**: `GET /sos-alert/active/{childId}`

**Steps**:
1. Authenticate as either **Child** or **Parent** (must be the child's parent)
2. Click on `GET /sos-alert/active/{childId}`
3. Click **"Try it out"**
4. Enter the `childId`
5. Click **"Execute"**

**Expected Response** (200 OK):
```json
{
  "_id": "alert-id-here",
  "child": {
    "_id": "child-id",
    "firstName": "John",
    "lastName": "Doe"
  },
  "parent": {
    "_id": "parent-id",
    "firstName": "Jane",
    "lastName": "Doe",
    "phoneNumber": "+21612345678"
  },
  "status": "CALLING_PARENT",
  "parentCallAttempts": 1,
  "callHistory": [
    {
      "callSid": "MESSENGER_CALL",
      "phoneNumber": "+21612345678",
      "callType": "PARENT",
      "status": "initiated",
      "answered": false,
      "timestamp": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

**Or** if no active alert:
```json
null
```

---

### Test 3: Get SOS Alert History

**Endpoint**: `GET /sos-alert/history/{childId}`

**Steps**:
1. Authenticate as **Child** or **Parent**
2. Click on `GET /sos-alert/history/{childId}`
3. Click **"Try it out"**
4. Enter the `childId`
5. Click **"Execute"**

**Expected Response** (200 OK):
```json
[
  {
    "_id": "alert-id-1",
    "status": "RESOLVED",
    "parentCallAttempts": 2,
    "resolvedAt": "2024-01-01T12:05:00.000Z",
    "createdAt": "2024-01-01T12:00:00.000Z"
  },
  {
    "_id": "alert-id-2",
    "status": "EMERGENCY_CALLED",
    "parentCallAttempts": 2,
    "emergencyCallAttempts": 1,
    "createdAt": "2024-01-01T11:00:00.000Z"
  }
]
```

---

### Test 4: Mark Parent as Answered (Parent Only)

**Endpoint**: `POST /sos-alert/parent-answered/{alertId}`

**Steps**:
1. Authenticate as a **Parent** (must be the parent of the child who triggered the alert)
2. First, get the `alertId` from Test 2 or Test 3
3. Click on `POST /sos-alert/parent-answered/{alertId}`
4. Click **"Try it out"**
5. Enter the `alertId`
6. Click **"Execute"**

**Expected Response** (200 OK):
```json
{
  "_id": "alert-id-here",
  "status": "PARENT_ANSWERED",
  "resolvedAt": "2024-01-01T12:05:00.000Z",
  "resolvedBy": "parent-id-here",
  "callHistory": [
    {
      "callSid": "MESSENGER_CALL",
      "callType": "PARENT",
      "status": "answered",
      "answered": true
    }
  ]
}
```

**What happens**:
- Alert status changes to `PARENT_ANSWERED`
- Alert is marked as resolved
- No emergency call will be made

---

### Test 5: Resolve SOS Alert

**Endpoint**: `POST /sos-alert/resolve/{alertId}`

**Steps**:
1. Authenticate as **Child** or **Parent**
2. Click on `POST /sos-alert/resolve/{alertId}`
3. Click **"Try it out"**
4. Enter the `alertId`
5. Click **"Execute"**

**Expected Response** (200 OK):
```json
{
  "_id": "alert-id-here",
  "status": "RESOLVED",
  "resolvedAt": "2024-01-01T12:10:00.000Z",
  "resolvedBy": "user-id-here"
}
```

---

## 🔄 Complete Test Flow

### Scenario: Test Full SOS Flow

1. **Login as Child** → Get child token
2. **Trigger SOS** → `POST /sos-alert/trigger/{childId}`
   - Check response: status should be `PENDING`
3. **Wait 5 seconds**, then **Get Active Alert** → `GET /sos-alert/active/{childId}`
   - Check response: status should be `CALLING_PARENT`
   - Check `callHistory`: should have one entry with `callType: "PARENT"`
4. **Login as Parent** → Get parent token
5. **Mark Parent Answered** → `POST /sos-alert/parent-answered/{alertId}`
   - Check response: status should be `PARENT_ANSWERED`
6. **Get Active Alert again** → Should return `null` (no active alerts)

### Scenario: Test Emergency Escalation

1. **Login as Child** → Get child token
2. **Trigger SOS** → `POST /sos-alert/trigger/{childId}`
3. **Wait 30 seconds** (parent doesn't answer)
4. **Get Active Alert** → `GET /sos-alert/active/{childId}`
   - After 2 failed attempts, status should be `CALLING_EMERGENCY` or `EMERGENCY_CALLED`
   - Check `callHistory`: should have emergency call entry with `phoneNumber: "196"`

---

## 📱 WebSocket Events (For Mobile Apps)

While testing in Swagger, you won't see WebSocket events, but here's what the mobile apps should listen for:

### Parent App Should Listen:
```javascript
socket.on('sos-alert:{parentId}', (data) => {
  // data.action = 'MESSENGER_CALL'
  // Initiate Messenger call
});
```

### Child App Should Listen:
```javascript
socket.on('sos-emergency:{childId}', (data) => {
  // data.action = 'OPEN_PHONE_DIALER'
  // data.phoneNumber = '196'
  // Open phone dialer
});
```

---

## ⚠️ Common Issues

### Issue: "Forbidden - only children can trigger SOS"
- **Solution**: Make sure you're authenticated as a **Child** (use QR login), not as a Parent

### Issue: "You can only access your own SOS alerts"
- **Solution**: When testing as a child, use your own `childId`. When testing as a parent, use a `childId` that belongs to you.

### Issue: "Parent phone number is not set"
- **Solution**: Make sure the parent has a `phoneNumber` set in their profile

### Issue: "Alert not found"
- **Solution**: Make sure you're using the correct `alertId` from a previous response

---

## 🎯 Quick Test Checklist

- [ ] Can login as Child (QR code)
- [ ] Can login as Parent (email/password)
- [ ] Can authorize in Swagger
- [ ] Can trigger SOS alert (as Child)
- [ ] Can get active alert (as Child or Parent)
- [ ] Can get alert history (as Child or Parent)
- [ ] Can mark parent as answered (as Parent)
- [ ] Can resolve alert (as Child or Parent)

---

## 📝 Notes

- Swagger is only available in **development** mode (`NODE_ENV !== 'production'`)
- WebSocket events won't be visible in Swagger - test those in your mobile apps
- The system automatically escalates to emergency (196) after 2 failed parent call attempts
- All timestamps are in UTC

