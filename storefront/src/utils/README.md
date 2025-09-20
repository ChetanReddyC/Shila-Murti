# Session State Tracking Utilities

This directory contains utilities for tracking session state changes, detecting authentication events, and managing timing controls for the PasskeyNudge component.

## Overview

The session tracking system solves timing issues with the passkey nudge dialog by:

1. **Monitoring session state transitions** from loading → authenticated
2. **Detecting authentication events** like MFA completion and checkout authentication
3. **Managing timing delays** to ensure session data is stable before showing dialogs
4. **Storing authentication events** to prevent duplicate dialogs across tabs

## Files

### Core Utilities

- **`sessionStateTracking.ts`** - Core functions for session state comparison and authentication event detection
- **`authEventStorage.ts`** - Storage management for authentication events in sessionStorage
- **`sessionTrackingIntegration.ts`** - Main integration class that combines all functionality

### Testing & Validation

- **`__tests__/sessionStateTracking.test.js`** - Jest tests for core functionality
- **`validateSessionTracking.js`** - Node.js validation script for core utilities
- **`validateIntegration.js`** - Node.js validation script for integration functionality

## Key Components

### SessionTrackingManager

The main class that orchestrates session tracking:

```typescript
import { createSessionTrackingManager } from './utils/sessionTrackingIntegration'

const manager = createSessionTrackingManager({
  stabilizationDelay: 1000,  // Wait for session to stabilize
  authEventDelay: 2000,      // Wait after authentication events
  remountDelay: 500          // Wait after component remount
})
```

### Authentication Events

The system detects three types of authentication events:

1. **`mfa-complete`** - Multi-factor authentication completion (mfaComplete flag changes to true)
2. **`checkout-auth`** - Checkout authentication (customerId added to session)
3. **`login-complete`** - Initial login completion (session status changes from loading to authenticated)

### Session State Comparison

Functions to detect meaningful changes in session data:

- `hasSessionStatusChanged()` - Detects status transitions
- `hasSessionDataChanged()` - Detects changes in session data (customerId, mfaComplete, originalEmail/Phone)
- `hasSessionBecomeAuthenticated()` - Specifically detects loading → authenticated transition

### Timing Control

Configurable delays for different scenarios:

- **Stabilization Delay** (1000ms) - Wait for session data to fully populate
- **Authentication Event Delay** (2000ms) - Wait after MFA/checkout authentication
- **Remount Delay** (500ms) - Wait after component remounting

## Usage Example

```typescript
import { SessionTrackingManager } from './utils/sessionTrackingIntegration'

// In your component
const manager = new SessionTrackingManager()

// Process session updates
const result = manager.processSessionUpdate(status, sessionData)

if (result.shouldEvaluateDialog) {
  // Schedule dialog evaluation with appropriate delay
  manager.scheduleDialogEvaluation(() => {
    // Show dialog logic here
    if (manager.isSessionStableForDialog(identifier)) {
      showPasskeyDialog()
      manager.consumeAuthenticationEvents(identifier)
    }
  }, result.authenticationEvent)
}

// Setup cross-tab communication
manager.setupCrossTabCommunication((event) => {
  console.log('Authentication event from another tab:', event)
})

// Cleanup on unmount
useEffect(() => {
  return () => manager.cleanup()
}, [])
```

## Requirements Addressed

This implementation addresses the following requirements from the spec:

- **3.1** - Session status change detection (loading → authenticated)
- **3.2** - Session data change detection (customerId, mfaComplete, originalEmail/Phone)
- **5.1** - Configurable timing delays for session stabilization

## Testing

Run the validation scripts to verify functionality:

```bash
# Core utilities validation
node src/utils/validateSessionTracking.js

# Integration validation
node src/utils/validateIntegration.js

# Jest tests (if test environment is set up)
npm test -- --testPathPattern=sessionStateTracking.test.js
```

## Architecture

The system follows a layered architecture:

1. **Core Layer** (`sessionStateTracking.ts`) - Pure functions for state comparison and event detection
2. **Storage Layer** (`authEventStorage.ts`) - SessionStorage management and cross-tab communication
3. **Integration Layer** (`sessionTrackingIntegration.ts`) - Orchestration and timing control
4. **Component Layer** - Integration with React components (PasskeyNudge)

## Error Handling

The utilities include comprehensive error handling for:

- SessionStorage access failures
- Malformed session data
- Timer cleanup on component unmount
- Cross-tab communication errors

All errors are logged to console with appropriate prefixes for debugging.

## Performance Considerations

- Events are automatically cleaned up after 5 minutes
- Timers are properly cleared on component unmount
- Storage operations are wrapped in try-catch blocks
- Cross-tab communication uses efficient localStorage events

## Browser Compatibility

The utilities work in all modern browsers that support:

- SessionStorage and LocalStorage
- Storage events for cross-tab communication
- setTimeout/clearTimeout for timing control
- ES6+ features (arrow functions, destructuring, etc.)