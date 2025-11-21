# Danger Zone Feature

## Overview

The Danger Zone feature allows parents to define geographic areas (circular geofences) and receive notifications when their children enter or exit these zones. This is useful for monitoring children's safety and location in real-time.

## Architecture

### Schemas

#### DangerZone Schema (`schemas/danger-zone.schema.ts`)
- `name`: Name of the danger zone
- `description`: Optional description
- `parent`: Reference to the parent user who created the zone
- `center`: Geographic center point `{ lat, lng }`
- `radiusMeters`: Radius in meters (10m to 50km)
- `children`: Array of child IDs (empty = applies to all parent's children)
- `status`: ACTIVE or INACTIVE
- `notifyOnEntry`: Send notification when child enters (default: true)
- `notifyOnExit`: Send notification when child exits (default: false)

#### DangerZoneEvent Schema (`schemas/danger-zone-event.schema.ts`)
- `child`: Reference to the child
- `dangerZone`: Reference to the danger zone
- `type`: ENTER or EXIT
- `location`: Child's location when event occurred
- `notificationSent`: Whether notification was sent
- `createdAt`: Timestamp of the event

### API Endpoints

All endpoints require JWT authentication and appropriate roles.

#### Create Danger Zone
```http
POST /danger-zones
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "School Area",
  "description": "Alert when near school during non-school hours",
  "center": { "lat": 33.5731, "lng": -7.6598 },
  "radiusMeters": 500,
  "children": ["childId1", "childId2"], // optional, empty = all children
  "notifyOnEntry": true,
  "notifyOnExit": false
}
```

**Roles**: PARENT, ADMIN
**Response**: Created danger zone object

#### Get All Danger Zones
```http
GET /danger-zones
Authorization: Bearer <token>
```

**Roles**: PARENT (sees own), ADMIN (sees all)
**Response**: Array of danger zones

#### Get Danger Zone by ID
```http
GET /danger-zones/:id
Authorization: Bearer <token>
```

**Roles**: PARENT (own only), ADMIN (all)
**Response**: Danger zone object

#### Update Danger Zone
```http
PATCH /danger-zones/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "status": "INACTIVE",
  "radiusMeters": 600
}
```

**Roles**: PARENT (own only), ADMIN (all)
**Response**: Updated danger zone object

#### Delete Danger Zone
```http
DELETE /danger-zones/:id
Authorization: Bearer <token>
```

**Roles**: PARENT (own only), ADMIN (all)
**Response**: Success message

#### Get Zone Events (History)
```http
GET /danger-zones/:id/events
Authorization: Bearer <token>
```

**Roles**: PARENT (own only), ADMIN (all)
**Response**: Array of events (last 100)

#### Get Child's Active Zones
```http
GET /danger-zones/child/:childId/active
Authorization: Bearer <token>
```

**Roles**: PARENT (own children), ADMIN (all)
**Response**: Array of active danger zones monitoring this child

## How It Works

### 1. Parent Creates Danger Zone
Parent defines a circular area with center coordinates and radius. They can:
- Specify which children to monitor (or leave empty for all)
- Choose to be notified on entry, exit, or both
- Activate/deactivate zones as needed

### 2. Child Location Update
When a child's location is updated (via `PATCH /children/:id/location`):
1. The location is saved to the database
2. Danger zone detection runs automatically (non-blocking)
3. All active zones for that child are checked

### 3. Geofencing Detection
The system uses the Haversine formula to calculate distance between:
- Child's current location
- Center of each danger zone

If distance ≤ radius, child is "inside" the zone.

### 4. State Change Detection
The system tracks the last event for each child-zone pair:
- **Entry**: Child was outside, now inside → Create ENTER event
- **Exit**: Child was inside, now outside → Create EXIT event
- **No change**: No event created (prevents duplicate alerts)

### 5. Notification Dispatch
When an entry/exit event occurs:
1. Event is recorded in `danger_zone_events` collection
2. Notifications are sent to all parents (main parent + linked parents)
3. Email and/or SMS sent (based on parent's contact info)
4. Event marked as `notificationSent: true`

## Notification Formats

### Email
Beautiful HTML email with:
- Child name and action (ENTERED/EXITED)
- Danger zone name and description
- Location coordinates
- Google Maps link
- Timestamp

### SMS
Plain text message:
```
WELDIWIN ALERT: Your child [Name] has [entered/exited] the danger zone "[Zone Name]" at [timestamp]. Location: [lat], [lng]
```

## Configuration

### Environment Variables
```env
# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=no-reply@weldiwin.app

# SMS (optional via Twilio)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_FROM_NUMBER=+1234567890
```

If credentials are not configured, notifications will be logged only (development mode).

## Integration

### Child Module
The `ChildModule` imports `DangerZoneModule` and `NotificationModule`:

```typescript
// src/child/child.module.ts
imports: [
  // ...
  forwardRef(() => DangerZoneModule),
  NotificationModule,
]
```

### Child Service
The `ChildService` injects `DangerZoneService` and `NotificationService`:

```typescript
// src/child/child.service.ts
constructor(
  // ...
  @Inject(forwardRef(() => DangerZoneService))
  private dangerZoneService: DangerZoneService,
  private notificationService: NotificationService,
) {}
```

After updating a child's location, it calls:
```typescript
this.checkDangerZonesAndNotify(updatedChild).catch(error => {
  console.error('Error checking danger zones:', error);
});
```

## Testing

### Unit Tests
```bash
npm test danger-zone.service.spec.ts
npm test danger-zone.controller.spec.ts
```

### Manual Testing

1. **Create a danger zone:**
```bash
curl -X POST http://localhost:3000/danger-zones \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Home Area",
    "center": { "lat": 33.5731, "lng": -7.6598 },
    "radiusMeters": 200,
    "notifyOnEntry": true,
    "notifyOnExit": true
  }'
```

2. **Update child location (inside zone):**
```bash
curl -X PATCH http://localhost:3000/children/CHILD_ID/location \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 33.5731,
    "lng": -7.6598
  }'
```

3. **Check events:**
```bash
curl http://localhost:3000/danger-zones/ZONE_ID/events \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Performance Considerations

- **Async Processing**: Danger zone checks run asynchronously to avoid blocking location updates
- **Indexed Queries**: MongoDB indexes on `parent`, `status`, `child`, and `dangerZone` fields
- **Event Limit**: History endpoints return max 100 events to prevent large payloads
- **Circular Dependency**: `forwardRef()` used to resolve circular dependency between Child and DangerZone modules

## Future Enhancements

- [ ] Polygon zones (non-circular shapes)
- [ ] Time-based zone activation (e.g., only active during school hours)
- [ ] Push notifications (FCM/APNS)
- [ ] WebSocket real-time alerts via existing chat gateway
- [ ] Zone templates (school, home, park, etc.)
- [ ] Notification cooldown period (prevent spam)
- [ ] Parent notification preferences (email only, SMS only, both)

