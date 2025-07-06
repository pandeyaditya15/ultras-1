# 🎤 Audio Streaming Test Guide

## How to Test Audio Streaming

### Prerequisites
- Make sure the server is running: `npm run dev`
- Open the app in multiple browser tabs/windows
- Ensure you have a microphone connected and permissions granted

### Test Scenario 1: Host Audio Streaming

1. **Open Room as Host**
   - Navigate to a room where you are the host
   - You should see the audio controls in the bottom-right corner
   - The audio button should show "On Stage" status

2. **Start Audio Stream**
   - Click the audio control button
   - Click "Join Stage" 
   - Allow microphone permissions when prompted
   - You should see audio level indicators

3. **Verify Audio Levels**
   - Speak into your microphone
   - Watch the audio level bar in the controls
   - Check the stage display for your audio level

### Test Scenario 2: Add User to Stage

1. **Open Room as Regular User**
   - Open the same room in another browser tab
   - Sign in with a different account
   - You should see yourself in the audience

2. **Host Adds User to Stage**
   - In the host tab, send a message in chat
   - Hover over any user's message
   - Click the 🎤 button to add them to stage
   - The user should automatically start streaming

3. **Verify Bidirectional Audio**
   - Both host and user should see each other in the stage display
   - Audio levels should be visible for both users
   - Test speaking - both should hear each other

### Test Scenario 3: Stage Management

1. **Remove User from Stage**
   - Host hovers over user's message in chat
   - Clicks the ❌ button
   - User should be removed from stage and stop streaming

2. **Mute/Unmute**
   - Click the mute button in audio controls
   - Audio level should drop to zero
   - Other users should see muted indicator

### Test Scenario 4: Multiple Users

1. **Add Multiple Users**
   - Host adds 2-3 users to stage
   - All should be able to hear each other
   - Audio levels should be visible for all

2. **Stage Display**
   - Check the Stage Users component
   - All users should be listed with audio levels
   - Host can remove any user

## Troubleshooting

### Common Issues

1. **"Permission denied" error**
   - Check browser microphone permissions
   - Refresh page and try again

2. **No audio levels showing**
   - Ensure microphone is working
   - Check browser console for errors
   - Verify WebRTC is supported

3. **Users not hearing each other**
   - Check network connectivity
   - Verify STUN servers are accessible
   - Check browser console for WebRTC errors

4. **Stage not updating**
   - Check Socket.IO connection
   - Verify room ID is correct
   - Check browser console for connection errors

### Debug Information

- Open browser console (F12) to see debug logs
- Look for audio streaming initialization messages
- Check for WebRTC connection status
- Monitor Socket.IO events

### Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support  
- **Safari**: Full support
- **Mobile browsers**: Limited support

## Expected Behavior

### Audio Controls
- ✅ Floating control panel in bottom-right
- ✅ Stage join/leave buttons
- ✅ Mute/unmute toggle
- ✅ Real-time audio level display
- ✅ Connection status indicator

### Stage Management
- ✅ Host can add users via chat
- ✅ Host can remove users from stage
- ✅ Automatic audio streaming when added
- ✅ Audio stops when removed

### Real-time Features
- ✅ Live audio level monitoring
- ✅ Visual feedback for all users
- ✅ Automatic connection management
- ✅ Stage user list updates

## Success Criteria

- [ ] Host can start audio stream
- [ ] Host can add users to stage
- [ ] Users automatically start streaming when added
- [ ] Bidirectional audio works between all stage users
- [ ] Audio levels are visible in real-time
- [ ] Mute/unmute functionality works
- [ ] Users can be removed from stage
- [ ] Audio stops when users leave stage
- [ ] Stage display updates in real-time
- [ ] No audio leaks or echo issues 