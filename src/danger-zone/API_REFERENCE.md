# Danger Zone API Reference

Quick reference for all danger zone endpoints.

## Base URL
```
http://localhost:3000/danger-zones
```

## Authentication
All endpoints require JWT Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 📍 Create Danger Zone

**Endpoint:** `POST /danger-zones`  
**Roles:** PARENT, ADMIN  
**Description:** Create a new danger zone for monitoring children

### Request Body
```json
{
  "name": "School Area",
  "description": "Alert when near school during non-school hours",
  "center": {
    "lat": 33.5731,
    "lng": -7.6598
  },
  "radiusMeters": 500,
  "children": ["childId1", "childId2"],
  "notifyOnEntry": true,
  "notifyOnExit": false
}
```

### Field Details
| Field | Type | Required | Description | Default |
|-------|------|----------|-------------|---------|
| name | string | ✅ Yes | Name of the zone | - |
| description | string | ❌ No | Description of the zone | null |
| center.lat | number | ✅ Yes | Center latitude (-90 to 90) | - |
| center.lng | number | ✅ Yes | Center longitude (-180 to 180) | - |
| radiusMeters | number | ✅ Yes | Radius in meters (10-50000) | - |
| children | string[] | ❌ No | Child IDs to monitor (empty = all) | [] |
| notifyOnEntry | boolean | ❌ No | Send notification on entry | true |
| notifyOnExit | boolean | ❌ No | Send notification on exit | false |

### Response (201 Created)
```json
{
  "_id": "654abc123def456789012345",
  "name": "School Area",
  "description": "Alert when near school during non-school hours",
  "parent": "654abc123def456789012340",
  "center": {
    "lat": 33.5731,
    "lng": -7.6598
  },
  "radiusMeters": 500,
  "children": ["childId1", "childId2"],
  "status": "ACTIVE",
  "notifyOnEntry": true,
  "notifyOnExit": false,
  "createdAt": "2025-11-15T10:30:00.000Z",
  "updatedAt": "2025-11-15T10:30:00.000Z"
}
```

### cURL Example
```bash
curl -X POST http://localhost:3000/danger-zones \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "School Area",
    "center": {"lat": 33.5731, "lng": -7.6598},
    "radiusMeters": 500,
    "notifyOnEntry": true
  }'
```

---

## 📋 Get All Danger Zones

**Endpoint:** `GET /danger-zones`  
**Roles:** PARENT (own zones), ADMIN (all zones)  
**Description:** Get list of all danger zones

### Response (200 OK)
```json
[
  {
    "_id": "654abc123def456789012345",
    "name": "School Area",
    "parent": {
      "_id": "654abc123def456789012340",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com"
    },
    "center": {"lat": 33.5731, "lng": -7.6598},
    "radiusMeters": 500,
    "children": [...],
    "status": "ACTIVE",
    "notifyOnEntry": true,
    "notifyOnExit": false,
    "createdAt": "2025-11-15T10:30:00.000Z",
    "updatedAt": "2025-11-15T10:30:00.000Z"
  }
]
```

### cURL Example
```bash
curl http://localhost:3000/danger-zones \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔍 Get Danger Zone by ID

**Endpoint:** `GET /danger-zones/:id`  
**Roles:** PARENT (own zones), ADMIN (all zones)  
**Description:** Get details of a specific danger zone

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Danger zone ID |

### Response (200 OK)
```json
{
  "_id": "654abc123def456789012345",
  "name": "School Area",
  "description": "Alert when near school",
  "parent": {...},
  "center": {"lat": 33.5731, "lng": -7.6598},
  "radiusMeters": 500,
  "children": [...],
  "status": "ACTIVE",
  "notifyOnEntry": true,
  "notifyOnExit": false,
  "createdAt": "2025-11-15T10:30:00.000Z",
  "updatedAt": "2025-11-15T10:30:00.000Z"
}
```

### cURL Example
```bash
curl http://localhost:3000/danger-zones/654abc123def456789012345 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ✏️ Update Danger Zone

**Endpoint:** `PATCH /danger-zones/:id`  
**Roles:** PARENT (own zones), ADMIN (all zones)  
**Description:** Update an existing danger zone

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Danger zone ID |

### Request Body (all fields optional)
```json
{
  "name": "Updated School Area",
  "description": "Updated description",
  "center": {"lat": 33.5735, "lng": -7.6600},
  "radiusMeters": 600,
  "children": ["newChildId"],
  "status": "INACTIVE",
  "notifyOnEntry": false,
  "notifyOnExit": true
}
```

### Response (200 OK)
```json
{
  "_id": "654abc123def456789012345",
  "name": "Updated School Area",
  ...
}
```

### cURL Example
```bash
curl -X PATCH http://localhost:3000/danger-zones/654abc123def456789012345 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "INACTIVE"}'
```

---

## 🗑️ Delete Danger Zone

**Endpoint:** `DELETE /danger-zones/:id`  
**Roles:** PARENT (own zones), ADMIN (all zones)  
**Description:** Delete a danger zone and all its events

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Danger zone ID |

### Response (200 OK)
```json
{
  "message": "Danger zone deleted successfully"
}
```

### cURL Example
```bash
curl -X DELETE http://localhost:3000/danger-zones/654abc123def456789012345 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 Get Zone Events (History)

**Endpoint:** `GET /danger-zones/:id/events`  
**Roles:** PARENT (own zones), ADMIN (all zones)  
**Description:** Get entry/exit event history for a zone (last 100 events)

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Danger zone ID |

### Response (200 OK)
```json
[
  {
    "_id": "654abc123def456789012350",
    "child": {
      "_id": "childId",
      "firstName": "Jane",
      "lastName": "Doe",
      ...
    },
    "dangerZone": {
      "_id": "654abc123def456789012345",
      "name": "School Area",
      ...
    },
    "type": "ENTER",
    "location": {
      "lat": 33.5731,
      "lng": -7.6598
    },
    "notificationSent": true,
    "createdAt": "2025-11-15T10:35:00.000Z"
  },
  {
    "type": "EXIT",
    ...
  }
]
```

### Event Types
- `ENTER`: Child entered the danger zone
- `EXIT`: Child exited the danger zone

### cURL Example
```bash
curl http://localhost:3000/danger-zones/654abc123def456789012345/events \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 👶 Get Child's Active Zones

**Endpoint:** `GET /danger-zones/child/:childId/active`  
**Roles:** PARENT (own children), ADMIN (all children)  
**Description:** Get all active danger zones monitoring a specific child

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| childId | string | Child ID |

### Response (200 OK)
```json
[
  {
    "_id": "654abc123def456789012345",
    "name": "School Area",
    "parent": {...},
    "center": {"lat": 33.5731, "lng": -7.6598},
    "radiusMeters": 500,
    "status": "ACTIVE",
    "notifyOnEntry": true,
    "notifyOnExit": false,
    ...
  }
]
```

### cURL Example
```bash
curl http://localhost:3000/danger-zones/child/childId123/active \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ⚠️ Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": ["radiusMeters must be between 10 and 50000"],
  "error": "Bad Request"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "You can only access your own danger zones",
  "error": "Forbidden"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Danger zone not found",
  "error": "Not Found"
}
```

---

## 🔔 Automatic Notifications

When a child's location is updated via `PATCH /children/:id/location`, the system automatically:

1. ✅ Checks all active danger zones for that child
2. ✅ Detects entry/exit events
3. ✅ Creates event records
4. ✅ Sends notifications to parent(s) via:
   - 📧 Email (HTML formatted)
   - 📱 SMS (plain text)

**No additional API calls needed!** Notifications happen automatically behind the scenes.

---

## 🎯 Common Use Cases

### Use Case 1: Monitor School Area
```bash
# Create zone around school
curl -X POST http://localhost:3000/danger-zones \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "School Zone",
    "center": {"lat": 33.5731, "lng": -7.6598},
    "radiusMeters": 300,
    "notifyOnEntry": true,
    "notifyOnExit": true
  }'
```

### Use Case 2: Check if Child is in Any Zones
```bash
# Get all active zones for a child
curl http://localhost:3000/danger-zones/child/$CHILD_ID/active \
  -H "Authorization: Bearer $TOKEN"
```

### Use Case 3: Review Zone Activity
```bash
# Get event history for a zone
curl http://localhost:3000/danger-zones/$ZONE_ID/events \
  -H "Authorization: Bearer $TOKEN"
```

### Use Case 4: Temporarily Disable Zone
```bash
# Set status to INACTIVE
curl -X PATCH http://localhost:3000/danger-zones/$ZONE_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "INACTIVE"}'
```

---

## 📱 Integration with Location Updates

The danger zone system integrates seamlessly with the existing child location endpoint:

```bash
# Update child location (triggers automatic zone checks)
curl -X PATCH http://localhost:3000/children/$CHILD_ID/location \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 33.5731,
    "lng": -7.6598
  }'
```

**What happens:**
1. ✅ Location is saved to child record
2. ✅ All active zones are checked
3. ✅ Entry/exit events are detected
4. ✅ Notifications are sent (if configured)
5. ✅ Events are logged to database

**Response time:** ~50-100ms (async processing doesn't block response)

---

## 🔐 Access Control Summary

| Endpoint | ADMIN | PARENT | CHILD |
|----------|-------|--------|-------|
| POST /danger-zones | All | Own | ❌ |
| GET /danger-zones | All | Own | ❌ |
| GET /danger-zones/:id | All | Own | ❌ |
| PATCH /danger-zones/:id | All | Own | ❌ |
| DELETE /danger-zones/:id | All | Own | ❌ |
| GET /danger-zones/:id/events | All | Own | ❌ |
| GET /danger-zones/child/:childId/active | All | Own Children | ❌ |

---

## 💡 Tips & Best Practices

1. **Radius Selection:**
   - Home/School: 100-300m
   - Park/Mall: 200-500m
   - Neighborhood: 500-1000m

2. **Notification Settings:**
   - High-risk areas: Enable both entry and exit
   - Low-risk monitoring: Entry only
   - Attendance tracking: Both entry and exit

3. **Performance:**
   - Limit to 5-10 active zones per parent
   - Use appropriate radius (smaller = faster)
   - Clean up old events periodically

4. **Testing:**
   - Create test zone with small radius
   - Update child location inside/outside
   - Check events endpoint for history
   - Verify email/SMS delivery

---

## 📞 Support

For issues or questions:
- Check logs: `npm run start:dev` (console output)
- Verify JWT token validity
- Ensure MongoDB connection is active
- Check SMTP/Twilio credentials (for notifications)

Happy monitoring! 🎉

